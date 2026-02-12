"""Storyboard API endpoints with regeneration support."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.middleware.auth import AuthUser, get_current_user
from app.middleware.usage_tracker import require_quota

from app.models.schemas import (
    Script,
    ScriptScene,
    Storyboard,
    RegenerateSceneRequest,
    RegenerateAllRequest,
)
from app.agents.storyboard_agent import StoryboardAgent
from app.services.image_service import ImageService
from app.models.schemas import AvatarDNA

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/storyboard", tags=["storyboard"])


class GenerateStoryboardRequest(BaseModel):
    """Request to generate storyboard."""

    script: Script
    avatar_id: str | None = None
    avatar_data: dict | None = None
    avatar_reference_images: list[str] = []
    product_images: list[str] = []
    product_name: str | None = None
    api_key: str | None = None
    aspect_ratio: str = "9:16"


class GenerateStoryboardResponse(BaseModel):
    """Response with generated storyboard."""

    storyboard: Storyboard


@router.post("/generate", response_model=GenerateStoryboardResponse)
async def generate_storyboard(
    request: GenerateStoryboardRequest,
    current_user: AuthUser = Depends(get_current_user),
    _remaining: int = Depends(require_quota("storyboard")),
) -> GenerateStoryboardResponse:
    """Generate storyboard images with character + product consistency."""
    if not request.script or not request.script.scenes:
        raise HTTPException(status_code=400, detail="Script with scenes is required")

    agent = StoryboardAgent(api_key=request.api_key)

    try:
        storyboard = await agent.generate_storyboard(
            script=request.script,
            avatar_data=request.avatar_data,
            avatar_reference_images=request.avatar_reference_images,
            product_images=request.product_images,
            product_name=request.product_name,
            aspect_ratio=request.aspect_ratio,
        )

        return GenerateStoryboardResponse(storyboard=storyboard)

    except Exception as e:
        logger.exception("Storyboard generation failed")
        raise HTTPException(
            status_code=500,
            detail=f"Storyboard generation failed: {str(e)}",
        ) from e


@router.post("/regenerate-scene")
async def regenerate_scene(request: RegenerateSceneRequest, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Regenerate storyboard for a single scene with optional updated script.

    This allows users to edit a scene's description/dialogue and regenerate
    just that one storyboard frame without re-running the entire pipeline.
    """
    image_service = ImageService(api_key=request.api_key)

    # Build avatar_dna from avatar_data if provided
    avatar_dna = None
    if request.avatar_data and request.avatar_data.get("dna"):
        dna_data = request.avatar_data["dna"]
        avatar_dna = AvatarDNA(**dna_data) if isinstance(dna_data, dict) else None
    elif request.avatar_data:
        avatar_dna = AvatarDNA(**request.avatar_data) if isinstance(request.avatar_data, dict) else None

    try:
        if request.updated_scene:
            # User edited the scene - use updated scene data
            scene = request.updated_scene
        else:
            raise HTTPException(status_code=400, detail="updated_scene is required")

        # Generate storyboard for just this scene
        mini_script = Script(
            title="Regeneration",
            scenes=[scene],
            total_duration=scene.duration_seconds,
        )

        storyboard_results = await image_service.generate_storyboard(
            script=mini_script,
            avatar_dna=avatar_dna,
            avatar_reference_images=request.avatar_reference_images,
            product_name=request.product_name,
            product_images=request.product_images,
            aspect_ratio=request.aspect_ratio,
        )

        return {
            "scene_number": request.scene_number,
            "result": storyboard_results[0] if storyboard_results else {},
            "job_id": request.job_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Scene regeneration failed")
        raise HTTPException(status_code=500, detail=f"Regeneration failed: {str(e)}") from e


@router.post("/regenerate-all")
async def regenerate_all(request: RegenerateAllRequest, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Regenerate entire storyboard from an updated script.

    Used when the user has edited multiple scenes and wants to regenerate
    all storyboard frames at once.
    """
    image_service = ImageService(api_key=request.api_key)

    avatar_dna = None
    if request.avatar_data and request.avatar_data.get("dna"):
        dna_data = request.avatar_data["dna"]
        avatar_dna = AvatarDNA(**dna_data) if isinstance(dna_data, dict) else None
    elif request.avatar_data:
        avatar_dna = AvatarDNA(**request.avatar_data) if isinstance(request.avatar_data, dict) else None

    try:
        storyboard_results = await image_service.generate_storyboard(
            script=request.updated_script,
            avatar_dna=avatar_dna,
            avatar_reference_images=request.avatar_reference_images,
            product_name=request.product_name,
            product_images=request.product_images,
            aspect_ratio=request.aspect_ratio,
        )

        return {
            "storyboard": storyboard_results,
            "scene_count": len(storyboard_results),
            "job_id": request.job_id,
        }

    except Exception as e:
        logger.exception("Full storyboard regeneration failed")
        raise HTTPException(status_code=500, detail=f"Regeneration failed: {str(e)}") from e
