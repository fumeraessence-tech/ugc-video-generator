import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.middleware.auth import AuthUser, get_current_user

from app.models.schemas import JobProgress
from app.utils.redis_client import get_job_state, publish_progress, subscribe_progress

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobProgress)
async def get_job_status(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> JobProgress:
    """Get the current status of a generation job."""
    state = await get_job_state(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobProgress(**state)


@router.get("/{job_id}/stream")
async def stream_job_progress(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> EventSourceResponse:
    """SSE endpoint streaming real-time progress updates for a job."""

    async def event_generator() -> Any:
        # Emit current state first
        state = await get_job_state(job_id)
        if state is not None:
            yield {"event": "progress", "data": json.dumps(state)}

        async for update in subscribe_progress(job_id):
            yield {"event": "progress", "data": json.dumps(update)}

    return EventSourceResponse(event_generator())


@router.post("/{job_id}/approve-storyboard")
async def approve_storyboard(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> dict[str, str]:
    """Approve the storyboard so the pipeline can continue to video generation."""
    state = await get_job_state(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if state.get("current_step") != "storyboard_review":
        raise HTTPException(
            status_code=400,
            detail=f"Job is not awaiting storyboard approval. Current step: {state.get('current_step')}",
        )

    # Signal approval via Redis
    await publish_progress(job_id, {
        "job_id": job_id,
        "status": "processing",
        "current_step": "storyboard_approved",
        "progress": state.get("progress", 40),
        "message": "Storyboard approved. Continuing to video generation...",
    })

    return {"status": "approved", "message": "Storyboard has been approved."}
