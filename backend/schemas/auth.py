"""
Pydantic schemas for authentication request and response models.
Fills in Task 1.1 request/response validations.
"""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr, ConfigDict


class RegisterRequest(BaseModel):
    """
    Schema for user registration request payload.
    """
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    """
    Schema for user login request payload.
    """
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """
    Schema for successful authentication response containing JWT token.
    """
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """
    Schema for returning authenticated user details.
    """
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    created_at: datetime


class OAuthExchangeRequest(BaseModel):
    """
    Schema for exchanging short-lived code for JWT token.
    """
    code: str
