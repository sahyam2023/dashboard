from cryptography.fernet import Fernet, InvalidToken
from flask import current_app

def encrypt_message(text_to_encrypt: str) -> str:
    """Encrypts a message using Fernet encryption."""
    try:
        key = current_app.config.get('ENCRYPTION_KEY')
        if not key:
            current_app.logger.error("Encryption key not found in app config.")
            return "[Encryption Error: Key Missing]"
        f = Fernet(key)
        encrypted_bytes = f.encrypt(text_to_encrypt.encode('utf-8'))
        return encrypted_bytes.decode('utf-8') # Store as base64 string
    except Exception as e:
        current_app.logger.error(f"Encryption failed: {e}", exc_info=True)
        return "[Encryption Error]"

def decrypt_message(encrypted_text: str) -> str:
    """Decrypts a message using Fernet encryption."""
    try:
        key = current_app.config.get('ENCRYPTION_KEY')
        if not key:
            current_app.logger.error("Decryption key not found in app config.")
            return "[Decryption Error: Key Missing]"
        
        f = Fernet(key)
        decrypted_bytes = f.decrypt(encrypted_text.encode('utf-8'))
        return decrypted_bytes.decode('utf-8')
    except InvalidToken:
        current_app.logger.error("Failed to decrypt message: Invalid token or key.")
        return "[Message could not be decrypted]"
    except Exception as e:
        current_app.logger.error(f"An unexpected error occurred during message decryption: {e}", exc_info=True)
        return "[Decryption Error: Unexpected]"
