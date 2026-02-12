"""
Supabase JWT authentication middleware for FastAPI.
Verifies JWT tokens from the Authorization header and extracts user info.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from app.config.settings import Settings

settings = Settings()
security = HTTPBearer()


class AuthUser(BaseModel):
    """Authenticated user extracted from JWT."""
    id: str
    email: str
    role: str = "user"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    """
    Verify Supabase JWT and return the authenticated user.
    Use as a FastAPI dependency: `user = Depends(get_current_user)`
    """
    token = credentials.credentials

    if not settings.SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWT_SECRET not configured",
        )

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
    user_role = payload.get("role", "authenticated")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Map Supabase role to app role — default to "user"
    # The app_metadata.role field is set by our profiles table trigger
    app_metadata = payload.get("app_metadata", {})
    role = app_metadata.get("role", "user")

    return AuthUser(id=user_id, email=email, role=role)


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
    Optionally verify JWT — returns None if no token provided.
    Use for endpoints that work both authenticated and unauthenticated.
    """
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
