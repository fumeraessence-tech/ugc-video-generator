"""Video generation API endpoints."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.middleware.auth import AuthUser, get_current_user
from app.middleware.usage_tracker import require_quota

from app.models.schemas import Script, Storyboard, VideoGeneration
from app.agents.video_generator_agent import VideoGeneratorAgent
from app.services.video_service import VideoService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/video", tags=["video"])


class GenerateVideoRequest(BaseModel):
    """Request to generate video."""

    script: Script
    storyboard: Storyboard
    avatar_id: str | None = None
    avatar_data: dict | None = None
    product_images: list[str] = []
    api_key: str | None = None


class GenerateVideoResponse(BaseModel):
    """Response with generated video."""

    video_generation: VideoGeneration


class SceneVideoRequest(BaseModel):
    """Request to generate video clips for a single scene."""

    scene_number: int
    prompt: str  # Detailed scene prompt (from storyboard)
    storyboard_image_url: str | None = None  # Scene's storyboard image (STYLE reference)
    product_images: list[str] = []  # Product images (ASSET reference)
    packaging_images: list[str] = []  # Packaging/box images (ASSET reference, for unboxing)
    avatar_images: list[str] = []  # Avatar reference images
    num_clips: int = 1  # Number of clips to generate (1-3)
    duration_seconds: int = 8  # Duration per clip (max 8)
    aspect_ratio: str = "9:16"  # Video aspect ratio
    model: str = "veo-3.1"  # Veo model
    generate_audio: bool = False  # Whether to generate audio
    api_key: str | None = None


class SceneVideoResponse(BaseModel):
    """Response with generated video clips for a scene."""

    scene_number: int
    clips: list[dict]  # List of {clip_number, video_url, status, error?}
    total_clips: int


class BatchVideoRequest(BaseModel):
    """Request to generate videos for multiple scenes."""

    scenes: list[SceneVideoRequest]
    api_key: str | None = None


class BatchVideoResponse(BaseModel):
    """Response with all generated videos."""

    results: list[SceneVideoResponse]
    total_scenes: int
    total_clips: int


@router.post("/generate", response_model=GenerateVideoResponse)
async def generate_video(
    request: GenerateVideoRequest,
    current_user: AuthUser = Depends(get_current_user),
    _remaining: int = Depends(require_quota("generation")),
) -> GenerateVideoResponse:
    """Generate video with Veo 3.1 and frame continuity."""
    if not request.script or not request.script.scenes:
        raise HTTPException(status_code=400, detail="Script with scenes is required")

    if not request.storyboard or not request.storyboard.scenes:
        raise HTTPException(status_code=400, detail="Storyboard is required")

    agent = VideoGeneratorAgent(api_key=request.api_key)

    try:
        video_generation = await agent.generate_video(
            script=request.script,
            storyboard=request.storyboard,
            avatar_data=request.avatar_data,
            product_images=request.product_images,
        )

        return GenerateVideoResponse(video_generation=video_generation)

    except Exception as e:
        logger.exception("Video generation failed")
        raise HTTPException(
            status_code=500,
            detail=f"Video generation failed: {str(e)}",
        ) from e


@router.post("/generate-scene", response_model=SceneVideoResponse)
async def generate_scene_video(
    request: SceneVideoRequest,
    current_user: AuthUser = Depends(get_current_user),
) -> SceneVideoResponse:
    """Generate video clips for a single scene.

    This endpoint allows generating multiple video clips per scene with:
    - Product images as ASSET references (for product consistency)
    - Packaging images as ASSET references (for unboxing videos)
    - Storyboard image as STYLE reference (for visual style)
    - Avatar images for character consistency

    Max 4 reference images total.
    """
    if not request.prompt:
        raise HTTPException(status_code=400, detail="Scene prompt is required")

    video_service = VideoService(api_key=request.api_key)

    try:
        # Combine product + packaging images as ASSET references
        all_product_images = request.product_images + request.packaging_images

        logger.info(f"🎬 Generating {request.num_clips} clip(s) for scene {request.scene_number}")
        logger.info(f"   Product images: {len(request.product_images)}")
        logger.info(f"   Packaging images: {len(request.packaging_images)}")
        logger.info(f"   Avatar images: {len(request.avatar_images)}")
        logger.info(f"   Storyboard image: {'Yes' if request.storyboard_image_url else 'No'}")

        clips = await video_service.generate_scene_videos(
            scene_number=request.scene_number,
            prompt=request.prompt,
            storyboard_image_url=request.storyboard_image_url,
            product_images=all_product_images,
            avatar_images=request.avatar_images,
            num_clips=min(request.num_clips, 3),  # Max 3 clips per scene
            duration_seconds=min(request.duration_seconds, 8),  # Max 8s
            aspect_ratio=request.aspect_ratio,
            model=request.model,
            generate_audio=request.generate_audio,
        )

        return SceneVideoResponse(
            scene_number=request.scene_number,
            clips=clips,
            total_clips=len(clips),
        )

    except Exception as e:
        logger.exception(f"Scene video generation failed for scene {request.scene_number}")
        raise HTTPException(
            status_code=500,
            detail=f"Video generation failed: {str(e)}",
        ) from e


@router.post("/generate-batch", response_model=BatchVideoResponse)
async def generate_batch_videos(
    request: BatchVideoRequest,
    current_user: AuthUser = Depends(get_current_user),
) -> BatchVideoResponse:
    """Generate videos for multiple scenes in batch.

    Each scene can have different settings (num_clips, duration, etc.)
    Reference images are used consistently across all scenes.
    """
    if not request.scenes:
        raise HTTPException(status_code=400, detail="At least one scene is required")

    video_service = VideoService(api_key=request.api_key)
    results = []
    total_clips = 0

    for scene_req in request.scenes:
        try:
            all_product_images = scene_req.product_images + scene_req.packaging_images

            logger.info(f"🎬 Processing scene {scene_req.scene_number}")

            clips = await video_service.generate_scene_videos(
                scene_number=scene_req.scene_number,
                prompt=scene_req.prompt,
                storyboard_image_url=scene_req.storyboard_image_url,
                product_images=all_product_images,
                avatar_images=scene_req.avatar_images,
                num_clips=min(scene_req.num_clips, 3),
                duration_seconds=min(scene_req.duration_seconds, 8),
                aspect_ratio=scene_req.aspect_ratio,
                model=scene_req.model,
                generate_audio=scene_req.generate_audio,
            )

            results.append(SceneVideoResponse(
                scene_number=scene_req.scene_number,
                clips=clips,
                total_clips=len(clips),
            ))
            total_clips += len(clips)

        except Exception as e:
            logger.exception(f"Failed to generate scene {scene_req.scene_number}")
            results.append(SceneVideoResponse(
                scene_number=scene_req.scene_number,
                clips=[{
                    "scene_number": scene_req.scene_number,
                    "clip_number": 1,
                    "video_url": "",
                    "status": "failed",
                    "error": str(e),
                }],
                total_clips=0,
            ))

    return BatchVideoResponse(
        results=results,
        total_scenes=len(results),
        total_clips=total_clips,
    )
