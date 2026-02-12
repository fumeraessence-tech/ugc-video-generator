"""Security headers middleware for production hardening."""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Strict-Transport-Security only in production (not localhost)
        if "localhost" not in request.url.hostname and "127.0.0.1" not in request.url.hostname:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
