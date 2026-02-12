from celery import Celery

from app.config import settings

celery_app = Celery(
    "ugcgen",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=600,
    task_time_limit=900,
    task_reject_on_worker_lost=True,
    worker_max_tasks_per_child=50,
    result_expires=86400,
    broker_connection_retry_on_startup=True,
)

# Auto-discover tasks in the tasks package
celery_app.autodiscover_tasks(["app.tasks"])
