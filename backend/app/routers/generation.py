import asyncio
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends

from app.middleware.auth import AuthUser, get_current_user
from app.middleware.usage_tracker import require_quota
from app.models.schemas import (
    GenerationRequest,
    GenerationResponse,
    QualityGateDecision,
    RegenerateStageRequest,
)
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["generation"])


async def _run_pipeline_async(job_id: str, request: GenerationRequest) -> None:
    """Run the video pipeline in-process (fallback when Celery is unavailable)."""
    from app.pipelines.video_pipeline import VideoPipeline
    from app.utils import redis_client

    # Reset Redis client to ensure it's created in this event loop
    redis_client.reset_redis()

    pipeline = VideoPipeline()
    try:
        await pipeline.run(
            job_id=job_id,
            request=request,
            api_key=settings.GEMINI_API_KEY,
        )
    except Exception:
        logger.exception("Pipeline failed for job %s", job_id)


@router.post("/generate", response_model=GenerationResponse)
async def generate_video(
    request: GenerationRequest,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(get_current_user),
    _remaining: int = Depends(require_quota("generation")),
) -> GenerationResponse:
    """Submit a new UGC video generation job."""
    # Use frontend job_id if provided, otherwise generate new UUID
    job_id = request.job_id if request.job_id else str(uuid.uuid4())
    logger.info("Processing job %s (frontend_provided=%s)", job_id, bool(request.job_id))

    if settings.USE_CELERY:
        from app.tasks.generation_tasks import run_video_pipeline
        run_video_pipeline.delay(job_id, request.model_dump())
        logger.info("Job %s queued in Celery", job_id)
    else:
        # Use in-process background task (Celery disabled)
        def _sync_wrapper() -> None:
            asyncio.run(_run_pipeline_async(job_id, request))

        background_tasks.add_task(_sync_wrapper)
        logger.info("Job %s queued in background task", job_id)

    return GenerationResponse(
        job_id=job_id,
        status="queued",
        message="Video generation job has been queued.",
    )


@router.post("/jobs/{job_id}/decision")
async def submit_quality_gate_decision(
    job_id: str,
    decision: QualityGateDecision,
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Submit a user decision at a quality gate checkpoint.

    Called when the pipeline is paused at a quality gate waiting for user input.
    Publishes the decision to Redis so the pipeline can resume.
    """
    from app.utils.redis_client import publish_progress

    try:
        await publish_progress(job_id, {
            "job_id": job_id,
            "status": "processing",
            "current_step": "quality_decision",
            "progress": 0,
            "message": f"User decided: {decision.decision}",
            "data": {
                "decision": decision.decision,
                "scene_numbers": decision.scene_numbers,
                "additional_images": decision.additional_images,
            },
        })

        return {
            "status": "accepted",
            "job_id": job_id,
            "decision": decision.decision,
        }
    except Exception as e:
        logger.exception("Failed to submit decision for job %s", job_id)
        return {"status": "error", "error": str(e)}


@router.post("/regenerate-stage")
async def regenerate_stage(
    request: RegenerateStageRequest,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Regenerate a specific pipeline stage for a job.

    Loads prior artifacts from the job context and re-runs only the
    specified stage (storyboard, video, or audio).
    """
    from app.pipelines.video_pipeline import VideoPipeline
    from app.utils import redis_client

    async def _run_regen(job_id: str, stage: str, context: dict) -> None:
        redis_client.reset_redis()
        pipeline = VideoPipeline()
        try:
            await pipeline.run_single_step(
                job_id=job_id,
                step=stage,
                context=context,
                api_key=settings.GEMINI_API_KEY,
            )
        except Exception:
            logger.exception("Stage regeneration failed for job %s step %s", job_id, stage)

    # Build context from request (in production, this would load from DB)
    context: dict = {
        "scene_numbers": request.scene_numbers,
    }

    def _sync_wrapper() -> None:
        asyncio.run(_run_regen(request.job_id, request.stage, context))

    background_tasks.add_task(_sync_wrapper)

    return {
        "status": "queued",
        "job_id": request.job_id,
        "stage": request.stage,
        "scene_numbers": request.scene_numbers,
    }
