"""
Supabase authentication middleware for FastAPI.
Verifies tokens by calling Supabase Auth API (no JWT secret needed).
Falls back to local JWT decode if SUPABASE_JWT_SECRET is configured.
"""

import logging

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config.settings import Settings

logger = logging.getLogger(__name__)

settings = Settings()
security = HTTPBearer()


class AuthUser(BaseModel):
    """Authenticated user extracted from JWT."""
    id: str
    email: str
    role: str = "user"


async def _verify_via_supabase_api(token: str) -> AuthUser:
    """Verify token by calling Supabase Auth API /auth/v1/user."""
    if not settings.SUPABASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL not configured",
        )

    url = f"{settings.SUPABASE_URL}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY or "",
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, headers=headers)

    if resp.status_code != 200:
        logger.warning("Supabase auth API returned %d", resp.status_code)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    data = resp.json()
    user_id = data.get("id", "")
    email = data.get("email", "")
    app_metadata = data.get("app_metadata", {})
    role = app_metadata.get("role", "user")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AuthUser(id=user_id, email=email, role=role)


async def _verify_via_jwt(token: str) -> AuthUser:
    """Verify token locally using JWT secret."""
    from jose import JWTError, jwt

    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    email = payload.get("email", "")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    app_metadata = payload.get("app_metadata", {})
    role = app_metadata.get("role", "user")

    return AuthUser(id=user_id, email=email, role=role)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    """
    Verify Supabase token and return the authenticated user.
    Prefers Supabase API verification; falls back to local JWT if configured.
    """
    token = credentials.credentials

    # Primary: verify via Supabase Auth API
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        return await _verify_via_supabase_api(token)

    # Fallback: local JWT verification
    if settings.SUPABASE_JWT_SECRET:
        return await _verify_via_jwt(token)

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="No auth verification method configured (need SUPABASE_URL or SUPABASE_JWT_SECRET)",
    )


async def get_current_admin(
    user: AuthUser = Depends(get_current_user),
) -> AuthUser:
    """
    Verify the user has super_admin role.
    Use as: `admin = Depends(get_current_admin)`
    """
    if user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required",
        )
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
) -> AuthUser | None:
    """
    Optionally verify token — returns None if no token provided.
    Use for endpoints that work both authenticated and unauthenticated.
    """
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
