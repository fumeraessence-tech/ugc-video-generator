import asyncio
import logging
from typing import Any

from app.tasks.celery_app import celery_app
from app.models.schemas import GenerationRequest
from app.pipelines.video_pipeline import VideoPipeline
from app.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="app.tasks.run_video_pipeline", max_retries=2)
def run_video_pipeline(self: Any, job_id: str, request_data: dict[str, Any]) -> dict[str, Any]:
    """Celery task that runs the full video generation pipeline.

    Args:
        job_id: Unique job identifier.
        request_data: Serialised GenerationRequest dict.

    Returns:
        Pipeline result dict.
    """
    request = GenerationRequest.model_validate(request_data)
    pipeline = VideoPipeline()

    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(
            pipeline.run(
                job_id=job_id,
                request=request,
                api_key=settings.GEMINI_API_KEY,
            )
        )
        return result
    except Exception as exc:
        logger.exception("Celery task failed for job %s", job_id)
        raise self.retry(exc=exc, countdown=10)
    finally:
        loop.close()
