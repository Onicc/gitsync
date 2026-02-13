import git
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Tuple
import logging
import re
import time
from urllib.parse import urlparse
from sqlalchemy.orm import Session
from models import Credential, PlatformType
from crypto_utils import encryption

logger = logging.getLogger(__name__)

class GitSyncEngine:
    """Git repository synchronization engine"""

    def __init__(self, work_dir: str = "./temp_repos"):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(exist_ok=True)
        # Clean up old temporary directories on initialization (older than 2 hours)
        self._cleanup_old_temp_dirs(max_age_hours=2)

    def _cleanup_old_temp_dirs(self, max_age_hours: float = 2):
        """
        Clean up temporary directories older than max_age_hours

        Args:
            max_age_hours: Maximum age in hours before a temp directory is considered stale
        """
        try:
            if not self.work_dir.exists():
                return

            current_time = time.time()
            max_age_seconds = max_age_hours * 3600
            cleaned_count = 0

            for item in self.work_dir.iterdir():
                if item.is_dir():
                    try:
                        # Check directory age
                        dir_age = current_time - item.stat().st_mtime
                        if dir_age > max_age_seconds:
                            shutil.rmtree(item, ignore_errors=True)
                            cleaned_count += 1
                            logger.info(f"Cleaned up old temp directory: {item.name}")
                    except Exception as e:
                        logger.warning(f"Failed to clean up temp directory {item.name}: {e}")

            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} old temporary directories")
        except Exception as e:
            logger.error(f"Error during temp directory cleanup: {e}")

    def _extract_user_id_from_url(self, url: str) -> Optional[str]:
        """
        Extract user/organization ID from repository URL

        Examples:
        - https://github.com/username/repo.git -> username
        - git@github.com:username/repo.git -> username
        - https://gitlab.com/group/subgroup/repo.git -> group
        - https://gitee.com/username/repo.git -> username
        """
        try:
            # Handle SSH format: git@github.com:username/repo.git
            ssh_match = re.match(r'git@[^:]+:([^/]+)/', url)
            if ssh_match:
                return ssh_match.group(1)

            # Handle HTTPS format: https://github.com/username/repo.git
            parsed = urlparse(url)
            if parsed.path:
                # Remove leading slash and split by /
                path_parts = parsed.path.lstrip('/').split('/')
                if len(path_parts) >= 2:
                    # Return the first part (username or organization)
                    return path_parts[0]

            return None
        except Exception as e:
            logger.error(f"Failed to extract user ID from URL {url}: {e}")
            return None

    def _get_platform_from_url(self, url: str) -> Optional[PlatformType]:
        """Determine platform type from URL"""
        url_lower = url.lower()
        if 'github.com' in url_lower:
            return PlatformType.GITHUB
        elif 'gitlab.com' in url_lower:
            return PlatformType.GITLAB
        elif 'gitee.com' in url_lower:
            return PlatformType.GITEE
        return None

    def _find_credential(self, db: Session, url: str) -> Optional[str]:
        """
        Find matching credential for the given repository URL

        Returns decrypted token value or None if not found
        """
        try:
            # Extract platform and user ID from URL
            platform = self._get_platform_from_url(url)
            if not platform:
                logger.warning(f"Could not determine platform from URL: {url}")
                return None

            user_id = self._extract_user_id_from_url(url)
            if not user_id:
                logger.warning(f"Could not extract user ID from URL: {url}")
                return None

            # Query database for matching credential
            credential = db.query(Credential).filter(
                Credential.platform == platform,
                Credential.user_id == user_id,
                Credential.credential_type == "token"
            ).first()

            if not credential:
                logger.warning(f"No credential found for platform={platform}, user_id={user_id}")
                return None

            # Decrypt and return token value
            decrypted_token = encryption.decrypt(credential.encrypted_value)
            logger.info(f"Found credential for {platform.value}/{user_id}")
            return decrypted_token

        except Exception as e:
            logger.error(f"Error finding credential for URL {url}: {e}")
            return None

    def sync_repository(
        self,
        source_url: str,
        dest_url: str,
        task_name: str,
        db: Optional[Session] = None,
        auth_token: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Sync repository from source to destination using mirror

        Args:
            source_url: Source repository URL
            dest_url: Destination repository URL
            task_name: Task identifier
            db: Database session for automatic credential lookup
            auth_token: Optional manual auth token (overrides automatic lookup)

        Returns:
            Tuple[bool, str]: (success, message/error)
        """
        try:
            # Determine authentication tokens
            source_token = auth_token
            dest_token = auth_token

            # If no manual token provided and db session available, auto-find credentials
            if not auth_token and db:
                source_token = self._find_credential(db, source_url)
                dest_token = self._find_credential(db, dest_url)
                logger.info(f"Auto-selected credentials: source={'found' if source_token else 'none'}, dest={'found' if dest_token else 'none'}")

            # Set up SSH environment to prevent hanging
            env = os.environ.copy()
            env['GIT_SSH_COMMAND'] = 'ssh -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new'

            # Check if destination is local path or remote URL
            is_local = not (dest_url.startswith("http") or dest_url.startswith("git@"))

            # For local destinations, check if we can do incremental update
            if is_local:
                dest_path = Path(dest_url)

                # Check if destination already exists and is a valid Git mirror
                if self._is_valid_git_mirror(dest_path):
                    # Incremental update: use existing mirror and fetch updates
                    logger.info(f"Destination exists as valid Git mirror, performing incremental update: {dest_url}")

                    try:
                        # Update remote URL in case source changed
                        source_with_auth = self._inject_auth(source_url, source_token)
                        result = subprocess.run(
                            ["git", "remote", "set-url", "origin", source_with_auth],
                            cwd=dest_path,
                            capture_output=True,
                            text=True,
                            timeout=30,
                            env=env
                        )

                        if result.returncode != 0:
                            logger.warning(f"Failed to update remote URL: {result.stderr}")
                            # Continue anyway, might still work with old URL

                        # Fetch all updates from source (incremental)
                        logger.info(f"Fetching updates from {source_url}")
                        result = subprocess.run(
                            ["git", "remote", "update", "--prune"],
                            cwd=dest_path,
                            capture_output=True,
                            text=True,
                            timeout=600,
                            env=env
                        )

                        if result.returncode != 0:
                            error_msg = result.stderr.strip() if result.stderr else "Unknown error"
                            logger.error(f"Incremental update failed: {error_msg}")
                            return False, f"Incremental update failed: {error_msg}"

                        logger.info(f"Incremental update completed successfully")
                        return True, f"Successfully synced (incremental) {source_url} to {dest_url}"

                    except subprocess.TimeoutExpired:
                        logger.error("Incremental update timed out")
                        return False, "Incremental update timed out (10 minutes)"
                    except Exception as e:
                        logger.error(f"Incremental update error: {str(e)}")
                        return False, f"Incremental update error: {str(e)}"

            # If we reach here, we need to do a full clone
            # Use timestamp to ensure unique temp directory names
            timestamp = int(time.time())
            temp_path = self.work_dir / f"{task_name}_{os.getpid()}_{timestamp}"

            # Clean up temp directory if it already exists (from previous failed attempts)
            if temp_path.exists():
                logger.warning(f"Temp directory already exists, cleaning up: {temp_path}")
                shutil.rmtree(temp_path, ignore_errors=True)

            # Step 1: Clone source as mirror with submodules
            logger.info(f"Cloning mirror from {source_url}")
            source_with_auth = self._inject_auth(source_url, source_token)

            result = subprocess.run(
                ["git", "clone", "--mirror", "--recurse-submodules", source_with_auth, str(temp_path)],
                capture_output=True,
                text=True,
                timeout=600,
                env=env
            )

            if result.returncode != 0:
                error_msg = result.stderr.strip() if result.stderr else "Unknown error"
                logger.error(f"Clone failed: {error_msg}")
                return False, f"Clone failed: {error_msg}"

            # Step 1.5: Configure git user info for this repository
            logger.info("Configuring git user info")
            subprocess.run(
                ["git", "config", "--local", "user.name", "gitsync"],
                cwd=temp_path,
                capture_output=True
            )
            subprocess.run(
                ["git", "config", "--local", "user.email", "admin@gitsync.com"],
                cwd=temp_path,
                capture_output=True
            )

            if is_local:
                # Full clone to local destination
                dest_path = Path(dest_url)
                logger.info(f"Performing full clone to local destination: {dest_url}")

                # Remove destination if it exists but is not a valid mirror
                if dest_path.exists():
                    logger.warning(f"Removing invalid destination: {dest_path}")
                    shutil.rmtree(dest_path, ignore_errors=True)

                # Move temp mirror to destination
                shutil.move(str(temp_path), str(dest_path))

                logger.info(f"Full clone completed successfully")
                return True, f"Successfully synced (full clone) {source_url} to {dest_url}"
            else:
                # Step 2: For remote destination, set push URL
                logger.info(f"Setting push URL to {dest_url}")
                dest_with_auth = self._inject_auth(dest_url, dest_token)

                result = subprocess.run(
                    ["git", "remote", "set-url", "--push", "origin", dest_with_auth],
                    cwd=temp_path,
                    capture_output=True,
                    text=True
                )

                if result.returncode != 0:
                    error_msg = result.stderr.strip() if result.stderr else "Unknown error"
                    logger.error(f"Set URL failed: {error_msg}")
                    return False, f"Set URL failed: {error_msg}"

                # Step 3: Push mirror to destination
                logger.info(f"Pushing mirror to destination")
                result = subprocess.run(
                    ["git", "push", "--mirror"],
                    cwd=temp_path,
                    capture_output=True,
                    text=True,
                    timeout=600,
                    env=env
                )

                if result.returncode != 0:
                    error_msg = result.stderr.strip() if result.stderr else "Unknown error"
                    logger.error(f"Push failed: {error_msg}")
                    return False, f"Push failed: {error_msg}"

                return True, f"Successfully synced {source_url} to {dest_url}"

        except subprocess.TimeoutExpired:
            logger.error("Operation timed out after 600 seconds")
            return False, "Operation timed out (10 minutes)"
        except Exception as e:
            logger.error(f"Sync error: {str(e)}")
            return False, f"Sync error: {str(e)}"
        finally:
            # Cleanup temp directory
            if temp_path.exists():
                shutil.rmtree(temp_path, ignore_errors=True)

    def _is_valid_git_mirror(self, path: Path) -> bool:
        """
        Check if the path is a valid Git mirror (bare) repository

        Args:
            path: Path to check

        Returns:
            bool: True if valid Git mirror, False otherwise
        """
        try:
            if not path.exists():
                return False

            # Check if it's a bare repository (mirror)
            # Bare repos have HEAD, config, objects, refs directly in the root
            required_items = ['HEAD', 'config', 'objects', 'refs']
            for item in required_items:
                if not (path / item).exists():
                    return False

            # Verify it's actually a bare repo by checking config
            result = subprocess.run(
                ["git", "config", "--local", "core.bare"],
                cwd=path,
                capture_output=True,
                text=True,
                timeout=5
            )

            return result.returncode == 0 and result.stdout.strip() == "true"
        except Exception as e:
            logger.warning(f"Failed to check if {path} is valid Git mirror: {e}")
            return False

    def _inject_auth(self, url: str, token: Optional[str]) -> str:
        """
        Inject authentication into URL
        - For HTTPS URLs: inject token
        - For SSH URLs: replace with SSH config host alias
        """
        # Handle HTTPS URLs with token
        if url.startswith("http") and token:
            if "://" in url:
                protocol, rest = url.split("://", 1)
                return f"{protocol}://{token}@{rest}"
            return url

        # Handle SSH URLs - replace with SSH config host alias
        if url.startswith("git@"):
            # Extract platform and user from SSH URL
            # Format: git@github.com:username/repo.git
            ssh_match = re.match(r'git@([^:]+):([^/]+)/', url)
            if ssh_match:
                hostname = ssh_match.group(1)
                username = ssh_match.group(2)

                # Determine platform from hostname
                platform = None
                if 'github.com' in hostname:
                    platform = 'github'
                elif 'gitlab.com' in hostname:
                    platform = 'gitlab'
                elif 'gitee.com' in hostname:
                    platform = 'gitee'

                if platform:
                    # Replace with SSH config host alias
                    # git@github.com:username/repo.git -> git@github-username:username/repo.git
                    host_alias = f"{platform}-{username}"
                    return url.replace(f"git@{hostname}:", f"git@{host_alias}:")

        return url

    def check_repository_exists(
        self,
        url: str,
        db: Optional[Session] = None,
        token: Optional[str] = None
    ) -> bool:
        """
        Check if repository exists and is accessible

        Args:
            url: Repository URL to check
            db: Database session for automatic credential lookup
            token: Optional manual auth token (overrides automatic lookup)
        """
        try:
            # Auto-find credential if no manual token provided
            auth_token = token
            if not auth_token and db:
                auth_token = self._find_credential(db, url)

            url_with_auth = self._inject_auth(url, auth_token)
            result = subprocess.run(
                ["git", "ls-remote", url_with_auth],
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0
        except Exception:
            return False
