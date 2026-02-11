import git
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Tuple
import logging
import re
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
        temp_path = self.work_dir / f"{task_name}_{os.getpid()}"

        try:
            # Determine authentication tokens
            source_token = auth_token
            dest_token = auth_token

            # If no manual token provided and db session available, auto-find credentials
            if not auth_token and db:
                source_token = self._find_credential(db, source_url)
                dest_token = self._find_credential(db, dest_url)
                logger.info(f"Auto-selected credentials: source={'found' if source_token else 'none'}, dest={'found' if dest_token else 'none'}")

            # Step 1: Clone source as mirror with submodules
            logger.info(f"Cloning mirror from {source_url}")
            source_with_auth = self._inject_auth(source_url, source_token)

            result = subprocess.run(
                ["git", "clone", "--mirror", "--recurse-submodules", source_with_auth, str(temp_path)],
                capture_output=True,
                text=True,
                timeout=600
            )

            if result.returncode != 0:
                return False, f"Clone failed: {result.stderr}"

            # Step 2: Set push URL to destination
            logger.info(f"Setting push URL to {dest_url}")
            dest_with_auth = self._inject_auth(dest_url, dest_token)

            result = subprocess.run(
                ["git", "remote", "set-url", "--push", "origin", dest_with_auth],
                cwd=temp_path,
                capture_output=True,
                text=True
            )

            if result.returncode != 0:
                return False, f"Set URL failed: {result.stderr}"

            # Step 3: Push mirror to destination
            logger.info(f"Pushing mirror to destination")
            result = subprocess.run(
                ["git", "push", "--mirror"],
                cwd=temp_path,
                capture_output=True,
                text=True,
                timeout=600
            )

            if result.returncode != 0:
                return False, f"Push failed: {result.stderr}"

            return True, f"Successfully synced {source_url} to {dest_url}"

        except subprocess.TimeoutExpired:
            return False, "Operation timed out"
        except Exception as e:
            logger.error(f"Sync error: {str(e)}")
            return False, f"Sync error: {str(e)}"
        finally:
            # Cleanup temp directory
            if temp_path.exists():
                shutil.rmtree(temp_path, ignore_errors=True)

    def _inject_auth(self, url: str, token: Optional[str]) -> str:
        """Inject authentication token into URL"""
        if not token or not url.startswith("http"):
            return url

        # Insert token after https://
        if "://" in url:
            protocol, rest = url.split("://", 1)
            return f"{protocol}://{token}@{rest}"
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
