"""
Redis-based sliding window rate limiter middleware.

Tiers:
  - "generation": /api/v1/generate, /api/v1/video/generate, /api/v1/storyboard/generate
  - "upload": endpoints with /upload in path
  - "default": all other endpoints

Keys in Redis:
  - ratelimit:{user_id_or_ip}:{tier} -> sorted set of timestamps
"""
import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings
from app.utils.redis_client import get_redis

logger = logging.getLogger(__name__)

# Endpoint tier classification
GENERATION_PREFIXES = [
    "/api/v1/generate",
    "/api/v1/video/generate",
    "/api/v1/storyboard/generate",
    "/api/v1/storyboard/regenerate",
    "/api/v1/editor/compile",
    "/api/v1/perfume/generate",
    "/api/v1/perfume/batch",
]
UPLOAD_PREFIXES = ["/upload"]


def _classify_endpoint(path: str) -> tuple[str, int]:
    """Return (tier_name, max_rpm) for the given request path."""
    for prefix in GENERATION_PREFIXES:
        if path.startswith(prefix):
            return "generation", settings.RATE_LIMIT_GENERATION_RPM
    for prefix in UPLOAD_PREFIXES:
        if prefix in path:
            return "upload", settings.RATE_LIMIT_UPLOAD_RPM
    return "default", settings.RATE_LIMIT_DEFAULT_RPM


def _get_identifier(request: Request) -> str:
    """Extract user ID from auth state, falling back to client IP."""
    # The auth dependency sets request.state.user if authenticated
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "id"):
        return f"user:{user.id}"
    # Fall back to X-Forwarded-For or client host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        # Skip health check and docs
        path = request.url.path
        if path in ("/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        tier, max_rpm = _classify_endpoint(path)
        identifier = _get_identifier(request)
        window = settings.RATE_LIMIT_WINDOW_SECONDS
        now = time.time()
        key = f"ratelimit:{identifier}:{tier}"

        try:
            r = await get_redis()
            # Sliding window: remove entries older than window
            await r.zremrangebyscore(key, 0, now - window)
            # Count current requests in window
            count = await r.zcard(key)

            if count >= max_rpm:
                retry_after = window
                oldest = await r.zrange(key, 0, 0, withscores=True)
                if oldest:
                    retry_after = int(window - (now - oldest[0][1])) + 1
                logger.warning(
                    "Rate limit exceeded: %s on tier %s (%d/%d)",
                    identifier, tier, count, max_rpm,
                )
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Rate limit exceeded",
                        "tier": tier,
                        "limit": max_rpm,
                        "window_seconds": window,
                        "retry_after": retry_after,
                    },
                    headers={"Retry-After": str(retry_after)},
                )

            # Add current request timestamp
            await r.zadd(key, {str(now): now})
            await r.expire(key, window + 10)  # TTL slightly longer than window

        except Exception:
            # If Redis is down, allow the request through (degraded mode)
            logger.warning("Rate limiter Redis error -- allowing request")

        response = await call_next(request)
        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(max_rpm)
        response.headers["X-RateLimit-Remaining"] = str(max(0, max_rpm - count - 1))
        response.headers["X-RateLimit-Reset"] = str(int(now + window))
        return response
