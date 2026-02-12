import logging
import sys
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health, generation, jobs, avatars, copilot, storyboard, video, mass_generator, editor, perfume, product_studio
from app.utils.redis_client import get_redis, close_redis
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.rate_limiter import RateLimitMiddleware

# Configure logging
log_level = logging.DEBUG if settings.DEBUG else getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
log_handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]

if settings.LOG_FILE:
    log_handlers.append(logging.FileHandler(settings.LOG_FILE))

logging.basicConfig(
    level=log_level,
    format=settings.LOG_FORMAT,
    handlers=log_handlers,
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle handler."""
    logger.info("Starting UGC Video Generator backend v%s", settings.APP_VERSION)
    # Warm up Redis connection
    try:
        r = await get_redis()
        await r.ping()
        logger.info("Redis connection established")
    except Exception:
        logger.warning("Redis not available -- running in degraded mode")
    yield
    # Shutdown
    await close_redis()
    logger.info("Backend shutdown complete")


app = FastAPI(
    title="UGC Video Generator",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# Security headers (outermost middleware)
app.add_middleware(SecurityHeadersMiddleware)

# Rate limiting
app.add_middleware(RateLimitMiddleware)

# CORS - use configurable origins
cors_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(generation.router)
app.include_router(jobs.router)
app.include_router(avatars.router)
app.include_router(copilot.router)
app.include_router(storyboard.router)
app.include_router(video.router)
app.include_router(mass_generator.router)
app.include_router(editor.router)
app.include_router(perfume.router)
app.include_router(product_studio.router)
