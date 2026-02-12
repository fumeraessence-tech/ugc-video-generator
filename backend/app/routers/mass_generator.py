"""Mass Script Generator API Router.

Provides endpoints for the step-by-step video generation wizard:
1. Analyze product images → Product DNA
2. Assemble Production Bible
3. Generate complete script
4. Generate storyboard (uses existing ImageService with bible context)
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.middleware.auth import AuthUser, get_current_user

from app.models.product_dna import ProductDNA, ProductAnalysisRequest, ProductAnalysisResponse
from app.models.production_bible import (
    ProductionBible,
    Platform,
    VideoStyle,
    Tone,
    CreativeBrief,
    StyleConfig,
)
from app.models.schemas import AvatarDNA
from app.services.product_vision_service import ProductVisionService
from app.services.production_bible_service import ProductionBibleService
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/mass-generator", tags=["mass-generator"])


# ============================================================================
# Request/Response Models
# ============================================================================

class AssembleBibleRequest(BaseModel):
    """Request to assemble a Production Bible."""

    product_dna: ProductDNA
    avatar_dna: AvatarDNA | None = None
    user_prompt: str = Field(min_length=10, max_length=2000)
    platform: str = "instagram_reels"
    style: str = "testimonial"
    tone: str = "excited"
    duration: int = Field(default=30, ge=5, le=180)


class AssembleBibleResponse(BaseModel):
    """Response with assembled Production Bible."""

    success: bool
    bible: ProductionBible | None = None
    error: str | None = None


class GenerateScriptRequest(BaseModel):
    """Request to generate script from Production Bible."""

    bible: ProductionBible


class GenerateScriptResponse(BaseModel):
    """Response with generated script."""

    success: bool
    script: dict | None = None
    error: str | None = None


class ExpandBriefRequest(BaseModel):
    """Request to expand a user brief."""

    user_prompt: str = Field(min_length=10, max_length=2000)
    product_dna: ProductDNA
    platform: str = "instagram_reels"
    style: str = "testimonial"
    duration: int = 30


class ExpandBriefResponse(BaseModel):
    """Response with expanded brief."""

    success: bool
    brief: CreativeBrief | None = None
    error: str | None = None


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/analyze-product", response_model=ProductAnalysisResponse)
async def analyze_product(request: ProductAnalysisRequest, current_user: AuthUser = Depends(get_current_user)) -> ProductAnalysisResponse:
    """Analyze product images and extract Product DNA.

    This is Step 1 of the Mass Script Generator wizard.
    Uses Gemini Vision to analyze uploaded product images.
    """
    logger.info(f"Analyzing {len(request.image_urls)} product images")

    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        vision_service = ProductVisionService(api_key=settings.GEMINI_API_KEY)
        product_dna = await vision_service.analyze_product(
            image_urls=request.image_urls,
            product_name_hint=request.product_name,
            brand_name_hint=request.brand_name,
        )

        return ProductAnalysisResponse(
            success=True,
            product_dna=product_dna,
            analyzed_images=len(request.image_urls),
        )

    except ValueError as e:
        logger.warning(f"Product analysis validation error: {e}")
        return ProductAnalysisResponse(
            success=False,
            error=str(e),
        )

    except Exception as e:
        logger.exception(f"Product analysis failed: {e}")
        return ProductAnalysisResponse(
            success=False,
            error=f"Analysis failed: {str(e)}",
        )


@router.post("/expand-brief", response_model=ExpandBriefResponse)
async def expand_brief(request: ExpandBriefRequest, current_user: AuthUser = Depends(get_current_user)) -> ExpandBriefResponse:
    """Expand a simple user prompt into a detailed creative brief.

    Uses Co-Pilot (Gemini) to analyze the prompt and product,
    then generates a comprehensive creative strategy.
    """
    logger.info("Expanding user brief")

    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        # Parse enum values
        platform = Platform(request.platform)
        style = VideoStyle(request.style)

        bible_service = ProductionBibleService(api_key=settings.GEMINI_API_KEY)
        brief = await bible_service.expand_brief(
            user_prompt=request.user_prompt,
            product_dna=request.product_dna,
            platform=platform,
            style=style,
            duration=request.duration,
        )

        return ExpandBriefResponse(
            success=True,
            brief=brief,
        )

    except ValueError as e:
        logger.warning(f"Brief expansion validation error: {e}")
        return ExpandBriefResponse(
            success=False,
            error=str(e),
        )

    except Exception as e:
        logger.exception(f"Brief expansion failed: {e}")
        return ExpandBriefResponse(
            success=False,
            error=f"Expansion failed: {str(e)}",
        )


@router.post("/assemble-bible", response_model=AssembleBibleResponse)
async def assemble_bible(request: AssembleBibleRequest, current_user: AuthUser = Depends(get_current_user)) -> AssembleBibleResponse:
    """Assemble a complete Production Bible.

    This is Step 2-3 of the wizard. Takes Product DNA, Avatar DNA,
    and user settings to create the master document.
    """
    logger.info("Assembling Production Bible")

    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        # Parse enum values
        platform = Platform(request.platform)
        style = VideoStyle(request.style)
        tone = Tone(request.tone)

        bible_service = ProductionBibleService(api_key=settings.GEMINI_API_KEY)
        bible = await bible_service.assemble_bible(
            product_dna=request.product_dna,
            avatar_dna=request.avatar_dna,
            user_prompt=request.user_prompt,
            platform=platform,
            style=style,
            tone=tone,
            duration=request.duration,
        )

        return AssembleBibleResponse(
            success=True,
            bible=bible,
        )

    except ValueError as e:
        logger.warning(f"Bible assembly validation error: {e}")
        return AssembleBibleResponse(
            success=False,
            error=str(e),
        )

    except Exception as e:
        logger.exception(f"Bible assembly failed: {e}")
        return AssembleBibleResponse(
            success=False,
            error=f"Assembly failed: {str(e)}",
        )


@router.post("/generate-script", response_model=GenerateScriptResponse)
async def generate_script(request: GenerateScriptRequest, current_user: AuthUser = Depends(get_current_user)) -> GenerateScriptResponse:
    """Generate complete script from Production Bible.

    This is Step 4 of the wizard. Uses the Production Bible to
    generate ALL scenes in a single call for consistency.
    """
    logger.info("Generating script from Production Bible")

    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        bible_service = ProductionBibleService(api_key=settings.GEMINI_API_KEY)
        script = await bible_service.generate_script(bible=request.bible)

        return GenerateScriptResponse(
            success=True,
            script=script,
        )

    except ValueError as e:
        logger.warning(f"Script generation validation error: {e}")
        return GenerateScriptResponse(
            success=False,
            error=str(e),
        )

    except Exception as e:
        logger.exception(f"Script generation failed: {e}")
        return GenerateScriptResponse(
            success=False,
            error=f"Generation failed: {str(e)}",
        )


@router.get("/health")
async def health_check(current_user: AuthUser = Depends(get_current_user)):
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "mass-generator",
        "gemini_configured": bool(settings.GEMINI_API_KEY),
    }
