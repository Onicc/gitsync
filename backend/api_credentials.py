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

# ============================================
# SSH Key Management
# ============================================

@router.post("/ssh/generate", response_model=SSHKeyResponse)
def generate_ssh_key(db: Session = Depends(get_db)):
    """Generate a new SSH key pair"""
    try:
        # Create .ssh directory if it doesn't exist
        ssh_dir = Path.home() / ".ssh"
        ssh_dir.mkdir(mode=0o700, exist_ok=True)

        key_path = ssh_dir / "gitsync_rsa"

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
