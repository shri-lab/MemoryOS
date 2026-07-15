"""
Authentication routes handler.
Fills in Task 1.1 authentication logic, and Task 1.4 OAuth routes.
"""

import logging
import secrets
import time
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from passlib.context import CryptContext
from authlib.integrations.starlette_client import OAuth

from db.session import get_db_session
from models import User
from schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    OAuthExchangeRequest
)
from auth.jwt_handler import create_access_token
from auth.dependencies import get_current_user
from config import get_settings
from constants import OAuthProvider

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


async def handle_oauth_user(db: AsyncSession, email: str, provider: str, oauth_id: str) -> str:
    """
    Looks up or links/creates a user using OAuth credentials.
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

    # Verify password hash (only valid for local provider accounts)
    if not user or user.oauth_provider != OAuthProvider.LOCAL or not pwd_context.verify(request.password, user.hashed_password):
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
    
    redirect_uri = f"{settings.OAUTH_REDIRECT_BASE_URL}/{provider}/callback"
    client = getattr(oauth, provider, None)
    if not client:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"OAuth provider '{provider}' is unconfigured.")
    
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db_session)):
    """
    Google OAuth authentication callback page. Links or signs in the user.
    """
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get("userinfo")
        if not user_info:
            resp = await oauth.google.get("https://www.googleapis.com/oauth2/v3/userinfo", token=token)
            user_info = resp.json()

        email = user_info.get("email")
        oauth_id = str(user_info.get("sub"))

        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google authentication failed to provide email.")

        jwt_token = await handle_oauth_user(db, email, "google", oauth_id)

        # Generate one-time 60s exchange code
        exchange_code = secrets.token_urlsafe(32)
        oauth_exchange_codes[exchange_code] = {
            "token": jwt_token,
            "expires_at": time.time() + 60.0
        }

        return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth/callback?code={exchange_code}")
    except Exception as e:
        logger.error(f"Google OAuth callback error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Google login failed: {e}")


@router.get("/github/callback")
async def github_callback(request: Request, db: AsyncSession = Depends(get_db_session)):
    """
    GitHub OAuth authentication callback page. Links or signs in the user.
    """
    try:
        token = await oauth.github.authorize_access_token(request)
        resp = await oauth.github.get("user", token=token)
        profile = resp.json()
        oauth_id = str(profile.get("id"))

        email = profile.get("email")
        if not email:
            # Fetch emails API fallback for primary private email
            emails_resp = await oauth.github.get("user/emails", token=token)
            emails = emails_resp.json()
            for email_entry in emails:
                if email_entry.get("primary"):
                    email = email_entry.get("email")
                    break
            if not email and emails:
                email = emails[0].get("email")

        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub authentication failed to provide email.")

        jwt_token = await handle_oauth_user(db, email, "github", oauth_id)

        # Generate one-time 60s exchange code
        exchange_code = secrets.token_urlsafe(32)
        oauth_exchange_codes[exchange_code] = {
            "token": jwt_token,
            "expires_at": time.time() + 60.0
        }

        return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth/callback?code={exchange_code}")
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
