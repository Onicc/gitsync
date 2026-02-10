import git
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)

class GitSyncEngine:
    """Git repository synchronization engine"""

    def __init__(self, work_dir: str = "./temp_repos"):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(exist_ok=True)

    def sync_repository(
        self,
        source_url: str,
        dest_url: str,
        task_name: str,
        auth_token: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Sync repository from source to destination using mirror

        Returns:
            Tuple[bool, str]: (success, message/error)
        """
        temp_path = self.work_dir / f"{task_name}_{os.getpid()}"

        try:
            # Step 1: Clone source as mirror with submodules
            logger.info(f"Cloning mirror from {source_url}")
            source_with_auth = self._inject_auth(source_url, auth_token)

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
            dest_with_auth = self._inject_auth(dest_url, auth_token)

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

    def check_repository_exists(self, url: str, token: Optional[str] = None) -> bool:
        """Check if repository exists and is accessible"""
        try:
            url_with_auth = self._inject_auth(url, token)
            result = subprocess.run(
                ["git", "ls-remote", url_with_auth],
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0
        except Exception:
            return False
