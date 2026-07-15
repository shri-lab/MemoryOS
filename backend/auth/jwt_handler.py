"""
JWT Token handler logic using python-jose.
Fills in Task 1.1 token utilities.
"""

from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from config import get_settings

settings = get_settings()
ALGORITHM = "HS256"


def create_access_token(user_id: str) -> str:
    """
    Encode a JWT access token for a given user ID.
    
    Args:
        user_id: The string identifier of the user (UUID).
        
    Returns:
        The encoded string JWT token.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    to_encode = {"sub": user_id, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> str:
    """
    Decode a JWT access token and return the subject (user ID).
    Propagates JWTError on failure.
    
    Args:
        token: The encoded string JWT token.
        
    Returns:
        The decrypted user ID string from the subject claim.
        
    Raises:
        JWTError: If token decoding fails or subject is missing.
    """
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    if not user_id:
        raise JWTError("Token payload missing subject claim")
    return str(user_id)
