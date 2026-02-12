"""Co-Pilot API endpoints for script generation."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.middleware.auth import AuthUser, get_current_user
from app.middleware.usage_tracker import require_quota

from app.models.schemas import Script, BackgroundSetting, Platform
from app.agents.copilot_agent import CoPilotAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/copilot", tags=["copilot"])


class GenerateScriptRequest(BaseModel):
    """Request to generate a script."""

    prompt: str
    product_name: str | None = None
    background_setting: BackgroundSetting = BackgroundSetting.modern_bedroom
    platform: Platform = Platform.instagram_reels
    duration: int = 30
    max_scene_duration: int = 8
    words_per_minute: int = 150
    api_key: str | None = None


class GenerateScriptResponse(BaseModel):
    """Response with generated script."""

    script: Script


@router.post("/generate-script", response_model=GenerateScriptResponse)
async def generate_script(request: GenerateScriptRequest, current_user: AuthUser = Depends(get_current_user), _remaining: int = Depends(require_quota("script"))) -> GenerateScriptResponse:
    """Generate a professional UGC script with AI Co-Pilot."""
    if not request.prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    agent = CoPilotAgent(api_key=request.api_key)

    try:
        script = await agent.generate_script(
            prompt=request.prompt,
            product_name=request.product_name,
            background_setting=request.background_setting,
            platform=request.platform,
            duration=request.duration,
            max_scene_duration=request.max_scene_duration,
            words_per_minute=request.words_per_minute,
        )

        return GenerateScriptResponse(script=script)

    except Exception as e:
        logger.exception("Script generation failed")
        raise HTTPException(
            status_code=500,
            detail=f"Script generation failed: {str(e)}",
        ) from e
