"""
Pydantic schemas for authentication request and response models.
Fills in Task 1.1 request/response validations.
"""

from datetime import datetime
from uuid import UUID
from typing import Literal
from pydantic import BaseModel, EmailStr, ConfigDict, Field


class UserPreferences(BaseModel):
    default_search_top_k: int = Field(5, ge=3, le=20)
    default_landing_page: Literal["dashboard", "last-visited"] = "dashboard"
    chat_auto_title_enabled: bool = True


class UpdatePreferencesRequest(BaseModel):
    default_search_top_k: int | None = Field(None, ge=3, le=20)
    default_landing_page: Literal["dashboard", "last-visited"] | None = None
    chat_auto_title_enabled: bool | None = None


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
    theme_preference: str = "system"
    preferences: UserPreferences = Field(default_factory=UserPreferences)



class OAuthExchangeRequest(BaseModel):
    """
    Schema for exchanging short-lived code for JWT token.
    """
    code: str


class UserSettingsResponse(BaseModel):
    """
    Schema for returning current user profile settings.
    """
    email: EmailStr
    oauth_provider: str | None = None
    has_password: bool
    full_name: str | None = None
    preferred_name: str | None = None
    work_description: str | None = None
    custom_instructions: str | None = None
    theme_preference: str = "system"
    preferences: UserPreferences = Field(default_factory=UserPreferences)


class ChangePasswordRequest(BaseModel):
    """
    Schema for changing user password credentials.
    """
    current_password: str
    new_password: str


class UpdateSettingsRequest(BaseModel):
    """
    Schema for updating user profile settings.
    """
    full_name: str | None = None
    preferred_name: str | None = None
    work_description: str | None = None
    custom_instructions: str | None = None
    theme_preference: str | None = None


class DeleteAccountRequest(BaseModel):
    """
    Schema for deleting user account (re-verifying password).
    """
    password: str | None = None


class StorageUsageResponse(BaseModel):
    """
    Schema for returning user storage usage stats.
    """
    total_files: int
    total_chunks: int
    approx_storage_bytes: int




