from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Google Gemini
    GEMINI_API_KEY: str | None = None

    # Google Cloud Storage
    GCS_BUCKET: str = "ugcgen-assets"
    GCS_PROJECT_ID: str = "ugcgen-project"
    GCS_CREDENTIALS_PATH: str | None = None

    # Consistency scoring
    CONSISTENCY_MODEL: str = "gemini-2.5-flash"
    CONSISTENCY_THRESHOLD: float = 0.75
    CONSISTENCY_FRAME_SAMPLE_RATE: int = 1  # Sample 1 frame per second

    # Local storage fallback
    LOCAL_STORAGE_ROOT: str = "frontend/public/uploads"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # App
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    FRONTEND_URL: str = "http://localhost:3000"
    PORT: int = 8000

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    CORS_ALLOW_CREDENTIALS: bool = True

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    LOG_FILE: str | None = None

    # Celery worker mode
    USE_CELERY: bool = False

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT_RPM: int = 60
    RATE_LIMIT_GENERATION_RPM: int = 5
    RATE_LIMIT_UPLOAD_RPM: int = 20
    RATE_LIMIT_BURST_MULTIPLIER: float = 1.5
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # Usage quotas (per user per day)
    USAGE_QUOTA_DAILY_GENERATIONS: int = 50
    USAGE_QUOTA_DAILY_STORYBOARDS: int = 100
    USAGE_QUOTA_DAILY_SCRIPTS: int = 200

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }
