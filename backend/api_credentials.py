from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from database import get_db
from models import Credential, PlatformType
from crypto_utils import encryption
import subprocess
import os
from pathlib import Path

router = APIRouter(prefix="/api/credentials", tags=["credentials"])

# ============================================
# SSH Config Management Helper Functions
# ============================================

def update_ssh_config(platform: str, user_id: str, key_path: str):
    """Update ~/.ssh/config with new host configuration"""
    ssh_config_path = Path.home() / ".ssh" / "config"
    host_alias = f"{platform}-{user_id}"

    # Determine hostname based on platform
    hostname_map = {
        "github": "github.com",
        "gitlab": "gitlab.com",
        "gitee": "gitee.com"
    }
    hostname = hostname_map.get(platform.lower(), platform)

    # Create config entry
    config_entry = f"""
Host {host_alias}
    HostName {hostname}
    User git
    IdentityFile {key_path}
    IdentitiesOnly yes
"""

    # Read existing config or create new
    if ssh_config_path.exists():
        with open(ssh_config_path, 'r') as f:
            existing_config = f.read()

        # Check if host already exists
        if f"Host {host_alias}" in existing_config:
            # Remove old entry
            lines = existing_config.split('\n')
            new_lines = []
            skip = False
            for line in lines:
                if line.strip().startswith('Host ') and host_alias in line:
                    skip = True
                elif skip and line.strip().startswith('Host '):
                    skip = False

                if not skip:
                    new_lines.append(line)

            existing_config = '\n'.join(new_lines).strip()

        # Append new entry
        with open(ssh_config_path, 'w') as f:
            f.write(existing_config + '\n' + config_entry)
    else:
        # Create new config file
        with open(ssh_config_path, 'w') as f:
            f.write(config_entry)

        # Set proper permissions
        ssh_config_path.chmod(0o600)

def remove_ssh_config_entry(platform: str, user_id: str):
    """Remove host configuration from ~/.ssh/config"""
    ssh_config_path = Path.home() / ".ssh" / "config"
    host_alias = f"{platform}-{user_id}"

    if not ssh_config_path.exists():
        return

    with open(ssh_config_path, 'r') as f:
        lines = f.readlines()

    # Remove the host entry
    new_lines = []
    skip = False
    for line in lines:
        if line.strip().startswith('Host ') and host_alias in line:
            skip = True
        elif skip and line.strip().startswith('Host '):
            skip = False

        if not skip:
            new_lines.append(line)

    with open(ssh_config_path, 'w') as f:
        f.writelines(new_lines)

# Pydantic schemas
class CredentialCreate(BaseModel):
    platform: str
    credential_type: str
    name: str
    user_id: Optional[str] = None  # GitHub/GitLab/Gitee username
    value: str
    scopes: Optional[str] = None

class CredentialResponse(BaseModel):
    id: int
    platform: str
    credential_type: str
    name: str
    user_id: Optional[str]
    scopes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class SSHKeyResponse(BaseModel):
    public_key: str
    fingerprint: str

class SSHKeyCreate(BaseModel):
    platform: str
    user_id: str
    name: Optional[str] = None

class SSHKeyInfo(BaseModel):
    id: int
    platform: str
    user_id: str
    name: str
    fingerprint: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================
# SSH Key Management - Multiple Keys Support
# ============================================

@router.post("/ssh-keys", response_model=SSHKeyResponse)
def create_ssh_key(ssh_key: SSHKeyCreate, db: Session = Depends(get_db)):
    """Generate a new SSH key pair for specific platform and user"""
    try:
        # Create .ssh directory if it doesn't exist
        ssh_dir = Path.home() / ".ssh"
        ssh_dir.mkdir(mode=0o700, exist_ok=True)

        # Generate key path based on platform and user_id
        platform_lower = ssh_key.platform.lower()
        key_name = f"id_rsa_{platform_lower}_{ssh_key.user_id}"
        key_path = ssh_dir / key_name

        # Remove existing key files if they exist
        if key_path.exists():
            key_path.unlink()
        if Path(f"{key_path}.pub").exists():
            Path(f"{key_path}.pub").unlink()

        # Generate SSH key
        subprocess.run([
            "ssh-keygen",
            "-t", "rsa",
            "-b", "4096",
            "-f", str(key_path),
            "-N", "",  # No passphrase
            "-C", f"gitsync@{platform_lower}-{ssh_key.user_id}"
        ], check=True, capture_output=True)

        # Read public key
        with open(f"{key_path}.pub", "r") as f:
            public_key = f.read().strip()

        # Get fingerprint
        result = subprocess.run([
            "ssh-keygen",
            "-lf",
            str(key_path)
        ], capture_output=True, text=True, check=True)

        fingerprint = result.stdout.strip()

        # Update SSH config
        update_ssh_config(platform_lower, ssh_key.user_id, str(key_path))

        # Store in database
        credential = Credential(
            platform=PlatformType[ssh_key.platform.upper()],
            credential_type="ssh",
            name=ssh_key.name or f"{ssh_key.platform} - {ssh_key.user_id}",
            user_id=ssh_key.user_id,
            encrypted_value=str(key_path),
            scopes=fingerprint
        )
        db.add(credential)
        db.commit()
        db.refresh(credential)

        return SSHKeyResponse(
            public_key=public_key,
            fingerprint=fingerprint
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate SSH key: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ssh-keys", response_model=List[SSHKeyInfo])
def get_ssh_keys(db: Session = Depends(get_db)):
    """Get all SSH keys"""
    keys = db.query(Credential).filter(
        Credential.credential_type == "ssh"
    ).all()

    return [SSHKeyInfo(
        id=key.id,
        platform=key.platform.value,
        user_id=key.user_id or "",
        name=key.name,
        fingerprint=key.scopes,
        created_at=key.created_at
    ) for key in keys]

@router.get("/ssh-keys/{key_id}/public-key")
def get_ssh_key_public_key(key_id: int, db: Session = Depends(get_db)):
    """Get public key for specific SSH key"""
    key = db.query(Credential).filter(
        Credential.id == key_id,
        Credential.credential_type == "ssh"
    ).first()

    if not key:
        raise HTTPException(status_code=404, detail="SSH key not found")

    try:
        key_path = key.encrypted_value
        pub_key_path = f"{key_path}.pub"

        if not Path(pub_key_path).exists():
            raise HTTPException(status_code=404, detail="Public key file not found")

        with open(pub_key_path, 'r') as f:
            public_key = f.read().strip()

        return {
            "public_key": public_key,
            "fingerprint": key.scopes or "Unknown"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/ssh-keys/{key_id}")
def delete_ssh_key(key_id: int, db: Session = Depends(get_db)):
    """Delete SSH key"""
    key = db.query(Credential).filter(
        Credential.id == key_id,
        Credential.credential_type == "ssh"
    ).first()

    if not key:
        raise HTTPException(status_code=404, detail="SSH key not found")

    try:
        # Remove key files
        key_path = Path(key.encrypted_value)
        if key_path.exists():
            key_path.unlink()
        pub_key_path = Path(f"{key_path}.pub")
        if pub_key_path.exists():
            pub_key_path.unlink()

        # Remove from SSH config
        platform = key.platform.value.lower()
        user_id = key.user_id or ""
        remove_ssh_config_entry(platform, user_id)

        # Remove from database
        db.delete(key)
        db.commit()

        return {"message": "SSH key deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ssh/generate", response_model=SSHKeyResponse)
def generate_ssh_key(db: Session = Depends(get_db)):
    """Generate a new SSH key pair"""
    try:
        # Create .ssh directory if it doesn't exist
        ssh_dir = Path.home() / ".ssh"
        ssh_dir.mkdir(mode=0o700, exist_ok=True)

        key_path = ssh_dir / "gitsync_rsa"

        # Remove existing key files if they exist
        if key_path.exists():
            key_path.unlink()
        if Path(f"{key_path}.pub").exists():
            Path(f"{key_path}.pub").unlink()

        # Generate SSH key
        subprocess.run([
            "ssh-keygen",
            "-t", "rsa",
            "-b", "4096",
            "-f", str(key_path),
            "-N", "",  # No passphrase
            "-C", "gitsync@backup"
        ], check=True, capture_output=True)

        # Read public key
        with open(f"{key_path}.pub", "r") as f:
            public_key = f.read().strip()

        # Get fingerprint
        result = subprocess.run([
            "ssh-keygen",
            "-lf",
            str(key_path)
        ], capture_output=True, text=True, check=True)

        fingerprint = result.stdout.strip()

        # Store in database
        credential = Credential(
            platform=PlatformType.CUSTOM,
            credential_type="ssh",
            name="GitSync SSH Key",
            encrypted_value=str(key_path),
            scopes="read,write"
        )
        db.add(credential)
        db.commit()

        return SSHKeyResponse(
            public_key=public_key,
            fingerprint=fingerprint
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate SSH key: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ssh/public-key")
def get_ssh_public_key():
    """Get the current SSH public key"""
    try:
        ssh_dir = Path.home() / ".ssh"
        key_path = ssh_dir / "gitsync_rsa.pub"

        if not key_path.exists():
            raise HTTPException(status_code=404, detail="SSH key not found. Generate one first.")

        with open(key_path, "r") as f:
            public_key = f.read().strip()

        return {"public_key": public_key}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# Access Token Management
# ============================================

@router.get("/tokens", response_model=List[CredentialResponse])
def get_tokens(db: Session = Depends(get_db)):
    """Get all access tokens"""
    tokens = db.query(Credential).filter(
        Credential.credential_type == "token"
    ).all()
    return tokens

@router.post("/tokens", response_model=CredentialResponse)
def create_token(credential: CredentialCreate, db: Session = Depends(get_db)):
    """Create a new access token"""
    # Encrypt the token value before storing
    encrypted_value = encryption.encrypt(credential.value)

    db_credential = Credential(
        platform=PlatformType[credential.platform.upper()],
        credential_type=credential.credential_type,
        name=credential.name,
        user_id=credential.user_id,
        encrypted_value=encrypted_value,
        scopes=credential.scopes
    )
    db.add(db_credential)
    db.commit()
    db.refresh(db_credential)
    return db_credential

@router.delete("/tokens/{token_id}")
def delete_token(token_id: int, db: Session = Depends(get_db)):
    """Delete an access token"""
    token = db.query(Credential).filter(Credential.id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    db.delete(token)
    db.commit()
    return {"message": "Token deleted successfully"}

@router.put("/tokens/{token_id}", response_model=CredentialResponse)
def update_token(token_id: int, credential: CredentialCreate, db: Session = Depends(get_db)):
    """Update an access token"""
    token = db.query(Credential).filter(Credential.id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    # Update fields
    token.platform = PlatformType[credential.platform.upper()]
    token.name = credential.name
    token.user_id = credential.user_id
    token.scopes = credential.scopes

    # Only update encrypted_value if a new value is provided
    if credential.value:
        token.encrypted_value = encryption.encrypt(credential.value)

    db.commit()
    db.refresh(token)
    return token
