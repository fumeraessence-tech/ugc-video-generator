"""
Per-user daily usage quota tracking via Redis.

Keys: quota:{user_id}:{YYYY-MM-DD}:{category}
Categories: "generation", "storyboard", "script"
"""
import datetime
import logging
from fastapi import Depends, HTTPException, status

from app.config import settings
from app.middleware.auth import AuthUser, get_current_user
from app.utils.redis_client import get_redis

logger = logging.getLogger(__name__)

QUOTA_MAP = {
    "generation": "USAGE_QUOTA_DAILY_GENERATIONS",
    "storyboard": "USAGE_QUOTA_DAILY_STORYBOARDS",
    "script": "USAGE_QUOTA_DAILY_SCRIPTS",
}


async def check_and_increment_quota(user: AuthUser, category: str) -> int:
    """Check if user is within quota; if so increment and return remaining.
    Raises HTTP 429 if quota exceeded."""
    limit = getattr(settings, QUOTA_MAP.get(category, "USAGE_QUOTA_DAILY_GENERATIONS"), 50)
    today = datetime.date.today().isoformat()
    key = f"quota:{user.id}:{today}:{category}"

    try:
        r = await get_redis()
        current = await r.get(key)
        current = int(current) if current else 0

        if current >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "Daily usage quota exceeded",
                    "category": category,
                    "limit": limit,
                    "used": current,
                    "resets_at": f"{today}T23:59:59Z",
                },
            )

        new_count = await r.incr(key)
        if new_count == 1:
            # Set TTL to end of day + 1 hour buffer
            await r.expire(key, 90000)  # ~25 hours

        return limit - new_count

    except HTTPException:
        raise
    except Exception:
        logger.warning("Quota check Redis error -- allowing request")
        return limit  # Allow through if Redis is down


def require_quota(category: str):
    """FastAPI dependency factory for quota enforcement.

    Usage in router:
        @router.post("/generate")
        async def gen(
            request: ...,
            user: AuthUser = Depends(get_current_user),
            _quota: int = Depends(require_quota("generation")),
        ):
    """
    async def _check(user: AuthUser = Depends(get_current_user)) -> int:
        return await check_and_increment_quota(user, category)
    return _check
