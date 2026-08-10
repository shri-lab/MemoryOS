"""
Authentication routes handler.
Fills in Task 1.1 authentication logic, and Task 1.4 OAuth routes.
"""

import logging
import secrets
import time
import asyncio
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func
from sqlalchemy.future import select
from passlib.context import CryptContext
from authlib.integrations.starlette_client import OAuth

from db.session import get_db_session
from models import User, File, Chunk
from schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    OAuthExchangeRequest,
    UserSettingsResponse,
    ChangePasswordRequest,
    UpdateSettingsRequest,
    DeleteAccountRequest,
    UpdatePreferencesRequest,
    UserPreferences,
    StorageUsageResponse
)
from auth.jwt_handler import create_access_token
from auth.dependencies import get_current_user
from config import get_settings
from constants import OAuthProvider
from services import pdf_service

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 1. Initialize Authlib OAuth client registry
oauth = OAuth()

if settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
    oauth.register(
        name="google",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={
            "scope": "openid email profile"
        }
    )
else:
    logger.warning("Google OAuth credentials missing in configuration settings.")

if settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET:
    oauth.register(
        name="github",
        client_id=settings.GITHUB_CLIENT_ID,
        client_secret=settings.GITHUB_CLIENT_SECRET,
        access_token_url="https://github.com/login/oauth/access_token",
        authorize_url="https://github.com/login/oauth/authorize",
        api_base_url="https://api.github.com/",
        client_kwargs={
            "scope": "user:email"
        }
    )
else:
    logger.warning("GitHub OAuth credentials missing in configuration settings.")

# 2. In-memory dict mapping one-time exchange codes -> {"token": JWT, "expires_at": float}
oauth_exchange_codes: Dict[str, Dict] = {}


async def handle_oauth_user(db: AsyncSession, email: str, provider: str, oauth_id: str, email_verified: bool = True) -> str:
    """
    Looks up or links/creates a user using OAuth credentials.
    If the email is already registered locally but the provider's email is unverified,
    rejects the auto-link to avoid account-takeover.
    """
    # Check if user already exists with this provider and ID
    result = await db.execute(
        select(User).where(User.oauth_provider == provider, User.oauth_id == oauth_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        # Check if email is already registered locally or via other provider
        result = await db.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()

        if user:
            # If local user exists, link OAuth to it
            if user.oauth_provider == OAuthProvider.LOCAL:
                if not email_verified:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Linking to the existing local account was rejected because the provider email is unverified. Please verify your email with the provider or login via password."
                    )
                user.oauth_provider = provider
                user.oauth_id = oauth_id
                await db.commit()
                logger.info(f"Linked OAuth provider '{provider}' to local account '{email}'")
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"This email is already linked to provider '{user.oauth_provider}'."
                )
        else:
            # Create a new user record
            user = User(
                email=email,
                hashed_password=None,
                oauth_provider=provider,
                oauth_id=oauth_id
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            logger.info(f"Registered new OAuth user '{email}' via '{provider}' provider.")

    return create_access_token(str(user.id))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db_session)
) -> TokenResponse:
    """
    Register a new user, hash password, save in DB and return access token.
    """
    # Check email uniqueness
    result = await db.execute(select(User).where(User.email == request.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    # Hash the password
    hashed_password = pwd_context.hash(request.password)

    # Create new User
    new_user = User(email=request.email, hashed_password=hashed_password)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Generate token
    token = create_access_token(str(new_user.id))
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db_session)
) -> TokenResponse:
    """
    Authenticate user credentials, generate and return access token.
    """
    # Query user by email
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    # Verify password hash (only valid if a password exists)
    if not user or not user.hashed_password or not pwd_context.verify(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Generate token
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """
    Retrieve details of the currently authenticated user.
    """
    return UserResponse.model_validate(current_user)


@router.get("/{provider}/login")
async def oauth_login(provider: str, request: Request):
    """
    Redirects user to the respective OAuth provider's consent page.
    """
    if provider not in ("google", "github"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported OAuth provider.")
    
    client = getattr(oauth, provider, None)
    if not client:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"OAuth provider '{provider}' is unconfigured.")
        
    redirect_uri = f"{settings.OAUTH_REDIRECT_BASE_URL}/{provider}/callback"
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db_session)):
    """
    Google OAuth authentication callback page. Links or signs in the user.
    Checks for Google email verification.
    """
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get("userinfo")
        if not user_info:
            resp = await oauth.google.get("https://www.googleapis.com/oauth2/v3/userinfo", token=token)
            user_info = resp.json()

        email = user_info.get("email")
        oauth_id = str(user_info.get("sub"))
        email_verified = user_info.get("email_verified", False)

        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google authentication failed to provide email.")

        jwt_token = await handle_oauth_user(db, email, "google", oauth_id, email_verified=email_verified)

        # Generate one-time 60s exchange code
        exchange_code = secrets.token_urlsafe(32)
        oauth_exchange_codes[exchange_code] = {
            "token": jwt_token,
            "expires_at": time.time() + 60.0
        }

        return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth/callback?code={exchange_code}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google OAuth callback error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Google login failed: {e}")


@router.get("/github/callback")
async def github_callback(request: Request, db: AsyncSession = Depends(get_db_session)):
    """
    GitHub OAuth authentication callback page. Links or signs in the user.
    Checks for GitHub primary email verification.
    """
    try:
        token = await oauth.github.authorize_access_token(request)
        resp = await oauth.github.get("user", token=token)
        profile = resp.json()
        oauth_id = str(profile.get("id"))

        email = None
        email_verified = False

        # Query all user emails via GitHub API to verify email status
        emails_resp = await oauth.github.get("user/emails", token=token)
        if emails_resp.status_code == 200:
            emails = emails_resp.json()
            # 1. Search for primary verified email
            for entry in emails:
                if entry.get("primary") and entry.get("verified"):
                    email = entry.get("email")
                    email_verified = True
                    break
            # 2. Search for any verified email
            if not email:
                for entry in emails:
                    if entry.get("verified"):
                        email = entry.get("email")
                        email_verified = True
                        break
            # 3. Fallback to primary unverified
            if not email:
                for entry in emails:
                    if entry.get("primary"):
                        email = entry.get("email")
                        break
            # 4. Fallback to first email
            if not email and emails:
                email = emails[0].get("email")

        # Fallback to public profile email if emails endpoint failed or returned empty
        if not email:
            email = profile.get("email")

        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub authentication failed to provide email.")

        jwt_token = await handle_oauth_user(db, email, "github", oauth_id, email_verified=email_verified)

        # Generate one-time 60s exchange code
        exchange_code = secrets.token_urlsafe(32)
        oauth_exchange_codes[exchange_code] = {
            "token": jwt_token,
            "expires_at": time.time() + 60.0
        }

        return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth/callback?code={exchange_code}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"GitHub OAuth callback error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"GitHub login failed: {e}")


@router.post("/oauth/exchange", response_model=TokenResponse)
async def oauth_exchange(request: OAuthExchangeRequest) -> TokenResponse:
    """
    Exchanges one-time code for JWT authentication credentials.
    """
    code = request.code
    if code not in oauth_exchange_codes:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired exchange code.")

    entry = oauth_exchange_codes.pop(code)  # Invalidate immediately (single-use)
    if time.time() > entry["expires_at"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Exchange code has expired.")

    return TokenResponse(
        access_token=entry["token"],
        token_type="bearer"
    )


@router.get("/users/me", response_model=UserSettingsResponse)
async def get_users_me(
    current_user: User = Depends(get_current_user)
) -> UserSettingsResponse:
    """
    Retrieve settings-specific details for the currently authenticated user.
    """
    prov = current_user.oauth_provider.value if hasattr(current_user.oauth_provider, "value") else current_user.oauth_provider
    return UserSettingsResponse(
        email=current_user.email,
        oauth_provider=prov,
        has_password=current_user.hashed_password is not None,
        full_name=current_user.full_name,
        preferred_name=current_user.preferred_name,
        work_description=current_user.work_description,
        custom_instructions=current_user.custom_instructions,
        theme_preference=current_user.theme_preference,
        preferences=UserPreferences(**current_user.preferences) if current_user.preferences else UserPreferences()
    )


@router.patch("/users/me", response_model=UserSettingsResponse)
async def update_users_settings(
    request: UpdateSettingsRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> UserSettingsResponse:
    """
    Update settings-specific details for the currently authenticated user.
    """
    if request.full_name is not None:
        current_user.full_name = request.full_name
    if request.preferred_name is not None:
        current_user.preferred_name = request.preferred_name
    if request.work_description is not None:
        current_user.work_description = request.work_description
    if request.custom_instructions is not None:
        current_user.custom_instructions = request.custom_instructions
    if request.theme_preference is not None:
        if request.theme_preference not in ("light", "dark", "system"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid theme preference."
            )
        current_user.theme_preference = request.theme_preference

    await db.commit()
    
    prov = current_user.oauth_provider.value if hasattr(current_user.oauth_provider, "value") else current_user.oauth_provider
    return UserSettingsResponse(
        email=current_user.email,
        oauth_provider=prov,
        has_password=current_user.hashed_password is not None,
        full_name=current_user.full_name,
        preferred_name=current_user.preferred_name,
        work_description=current_user.work_description,
        custom_instructions=current_user.custom_instructions,
        theme_preference=current_user.theme_preference,
        preferences=UserPreferences(**current_user.preferences) if current_user.preferences else UserPreferences()
    )


@router.post("/users/me/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    request: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
):
    """
    Change password credentials for the current user.
    Disabled/blocked for OAuth-only accounts.
    """
    if current_user.hashed_password is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth-only accounts do not support password credentials."
        )

    if not pwd_context.verify(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password."
        )

    current_user.hashed_password = pwd_context.hash(request.new_password)
    await db.commit()
    return {"detail": "Password updated successfully."}


@router.delete("/users/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_account(
    request: DeleteAccountRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
):
    """
    Permanently deletes the current user account and cascades:
    - Cleans up all files from private Supabase Storage.
    - Cascades DB deletions for files, chunks, conversations, messages, search history, and file views.
    """
    # Verify password if a local password exists
    if current_user.hashed_password is not None:
        if not request.password or not pwd_context.verify(request.password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect password confirmation."
            )

    # 1. Fetch all user files to delete their blobs from storage first
    result = await db.execute(
        select(File).where(File.user_id == current_user.id)
    )
    files = result.scalars().all()
    
    for f in files:
        if f.storage_path:
            try:
                await asyncio.to_thread(pdf_service.delete_from_storage, f.storage_path)
            except Exception as storage_err:
                logger.error(
                    f"Failed to delete file {f.storage_path} from storage during user account deletion: {storage_err}"
                )

    # 2. Delete the user (SQLAlchemy cascades delete all files, chunks, search history, conversations, messages, file views)
    await db.delete(current_user)
    await db.commit()
    logger.info(f"Successfully deleted user account {current_user.email} and all cascading data.")


@router.patch("/users/me/preferences", response_model=UserSettingsResponse)
async def update_users_preferences(
    request: UpdatePreferencesRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> UserSettingsResponse:
    """
    Update partial user-specific JSON preferences.
    """
    prefs = current_user.preferences or {}
    if request.default_search_top_k is not None:
        prefs["default_search_top_k"] = request.default_search_top_k
    if request.default_landing_page is not None:
        prefs["default_landing_page"] = request.default_landing_page
    if request.chat_auto_title_enabled is not None:
        prefs["chat_auto_title_enabled"] = request.chat_auto_title_enabled
        
    current_user.preferences = prefs
    await db.commit()
    
    prov = current_user.oauth_provider.value if hasattr(current_user.oauth_provider, "value") else current_user.oauth_provider
    return UserSettingsResponse(
        email=current_user.email,
        oauth_provider=prov,
        has_password=current_user.hashed_password is not None,
        full_name=current_user.full_name,
        preferred_name=current_user.preferred_name,
        work_description=current_user.work_description,
        custom_instructions=current_user.custom_instructions,
        theme_preference=current_user.theme_preference,
        preferences=UserPreferences(**current_user.preferences) if current_user.preferences else UserPreferences()
    )


@router.get("/users/me/usage", response_model=StorageUsageResponse)
async def get_users_me_usage(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> StorageUsageResponse:
    """
    Retrieve counts of files and database chunks uploaded by the user.
    """
    # 1. Total files
    files_stmt = select(func.count(File.id)).where(File.user_id == current_user.id)
    files_res = await db.execute(files_stmt)
    total_files = files_res.scalar() or 0

    # 2. Total chunks
    chunks_stmt = (
        select(func.count(Chunk.id))
        .join(File, Chunk.file_id == File.id)
        .where(File.user_id == current_user.id)
    )
    chunks_res = await db.execute(chunks_stmt)
    total_chunks = chunks_res.scalar() or 0

    # Approximate storage bytes: File model doesn't track size (limitation noted in plan)
    approx_storage_bytes = 0

    return StorageUsageResponse(
        total_files=total_files,
        total_chunks=total_chunks,
        approx_storage_bytes=approx_storage_bytes
    )


