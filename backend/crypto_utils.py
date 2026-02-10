"""
Encryption utilities for secure credential storage
"""
from cryptography.fernet import Fernet
import os
import base64
import hashlib

class CredentialEncryption:
    """Handle encryption and decryption of credentials"""

    def __init__(self):
        # Get encryption key from environment or generate one
        encrypt_key = os.getenv('ENCRYPT_KEY', 'default_secret_key_change_in_production')

        # Derive a proper Fernet key from the encryption key
        # Fernet requires a 32-byte base64-encoded key
        key_bytes = hashlib.sha256(encrypt_key.encode()).digest()
        self.fernet_key = base64.urlsafe_b64encode(key_bytes)
        self.cipher = Fernet(self.fernet_key)

    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt a plaintext string

        Args:
            plaintext: The string to encrypt

        Returns:
            Base64-encoded encrypted string
        """
        if not plaintext:
            return ""

        encrypted_bytes = self.cipher.encrypt(plaintext.encode())
        return encrypted_bytes.decode()

    def decrypt(self, encrypted_text: str) -> str:
        """
        Decrypt an encrypted string

        Args:
            encrypted_text: The encrypted string to decrypt

        Returns:
            Decrypted plaintext string
        """
        if not encrypted_text:
            return ""

        try:
            decrypted_bytes = self.cipher.decrypt(encrypted_text.encode())
            return decrypted_bytes.decode()
        except Exception as e:
            raise ValueError(f"Decryption failed: {str(e)}")

# Global encryption instance
encryption = CredentialEncryption()
