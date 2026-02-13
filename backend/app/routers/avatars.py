"""Avatar management API endpoints."""

from __future__ import annotations

import base64
import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.middleware.auth import AuthUser, get_current_user

from app.services.avatar_vision_service import AvatarVisionService
from app.services.reference_validation_service import ReferenceValidationService

router = APIRouter(prefix="/api/v1/avatars", tags=["avatars"])
logger = logging.getLogger(__name__)


class AvatarDNA(BaseModel):
    """Avatar DNA model."""
    gender: str = ""
    face: str = ""
    skin: str = ""
    eyes: str = ""
    hair: str = ""
    body: str = ""
    wardrobe: str = ""
    voice: str = ""
    prohibited_drift: str = ""
    ethnicity: str = ""
    age_range: str = ""


class AvatarCreate(BaseModel):
    """Request to create an avatar."""
    name: str
    reference_image_url: Optional[str] = None
    reference_image_base64: Optional[str] = None
    dna: Optional[AvatarDNA] = None


class AvatarResponse(BaseModel):
    """Avatar response model."""
    id: str
    name: str
    thumbnail_url: Optional[str] = None
    reference_images: list[str] = []
    dna: Optional[AvatarDNA] = None


class ExtractDNARequest(BaseModel):
    """Request to extract DNA from an image."""
    image_url: Optional[str] = None
    image_base64: Optional[str] = None


class ExtractDNAResponse(BaseModel):
    """Response with extracted DNA."""
    dna: AvatarDNA


# In-memory avatar storage (replace with database in production)
_avatars: dict[str, dict] = {}


@router.post("/extract-dna", response_model=ExtractDNAResponse)
async def extract_dna(request: ExtractDNARequest, current_user: AuthUser = Depends(get_current_user)) -> ExtractDNAResponse:
    """Extract avatar DNA from an uploaded image using Gemini Vision.

    This endpoint analyzes a person's image and extracts detailed visual
    characteristics (face shape, skin tone, hair, etc.) that can be used
    to maintain consistency in AI-generated images.
    """
    if not request.image_url and not request.image_base64:
        raise HTTPException(status_code=400, detail="Either image_url or image_base64 is required")

    vision_service = AvatarVisionService()

    try:
        if request.image_base64:
            # Extract from base64 image
            logger.info("DNA extraction from base64 image (%d chars)", len(request.image_base64))
            dna = await vision_service.extract_dna_from_image(
                image_data=request.image_base64,
                image_mime_type="image/jpeg",
            )
        else:
            # Extract from URL
            logger.info("DNA extraction from URL: %s", request.image_url)
            dna = await vision_service.extract_dna_from_url(request.image_url)

        # Filter out internal fields before returning
        clean_dna = {k: v for k, v in dna.items() if not k.startswith("_")}
        logger.info("DNA extracted successfully: %s", list(clean_dna.keys()))
        return ExtractDNAResponse(dna=AvatarDNA(**clean_dna))

    except Exception as e:
        logger.exception("DNA extraction failed: %s", str(e))
        raise HTTPException(status_code=500, detail=f"DNA extraction failed: {str(e)}") from e


@router.post("/upload-image")
async def upload_avatar_image(
    file: UploadFile = File(...),
    extract_dna: bool = Form(default=True),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload an avatar reference image and optionally extract DNA.

    Returns the saved image URL and optionally the extracted DNA.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        # Read file content
        content = await file.read()

        # Save to frontend public directory
        backend_dir = Path(__file__).resolve().parents[2]
        frontend_dir = backend_dir.parent / "frontend"
        uploads_dir = frontend_dir / "public" / "uploads" / "avatars"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        # Generate unique filename
        ext = Path(file.filename or "image.jpg").suffix or ".jpg"
        filename = f"avatar-{uuid.uuid4().hex[:8]}{ext}"
        filepath = uploads_dir / filename

        # Write file
        with open(filepath, "wb") as f:
            f.write(content)

        image_url = f"/uploads/avatars/{filename}"
        logger.info(f"Saved avatar image: {image_url}")

        result = {"image_url": image_url}

        # Optionally extract DNA
        if extract_dna:
            vision_service = AvatarVisionService()
            dna = await vision_service.extract_dna_from_image(content, file.content_type)
            result["dna"] = dna

        return result

    except Exception as e:
        logger.exception("Avatar image upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}") from e


@router.post("", response_model=AvatarResponse)
async def create_avatar(request: AvatarCreate, current_user: AuthUser = Depends(get_current_user)) -> AvatarResponse:
    """Create a new platform avatar.

    If reference_image_url or reference_image_base64 is provided and no DNA,
    the DNA will be automatically extracted using Gemini Vision.
    """
    avatar_id = f"custom-{uuid.uuid4().hex[:8]}"

    dna = request.dna
    reference_images = []

    # Extract DNA from image if not provided
    if not dna and (request.reference_image_url or request.reference_image_base64):
        vision_service = AvatarVisionService()

        if request.reference_image_base64:
            extracted_dna = await vision_service.extract_dna_from_image(
                request.reference_image_base64
            )
        else:
            extracted_dna = await vision_service.extract_dna_from_url(
                request.reference_image_url
            )

        dna = AvatarDNA(**extracted_dna)

        if request.reference_image_url:
            reference_images.append(request.reference_image_url)

    # Store avatar
    avatar_data = {
        "id": avatar_id,
        "name": request.name,
        "thumbnail_url": request.reference_image_url,
        "reference_images": reference_images,
        "dna": dna.model_dump() if dna else None,
    }
    _avatars[avatar_id] = avatar_data

    return AvatarResponse(**avatar_data)


@router.get("", response_model=list[AvatarResponse])
async def list_avatars(current_user: AuthUser = Depends(get_current_user)) -> list[AvatarResponse]:
    """List all platform avatars."""
    return [AvatarResponse(**avatar) for avatar in _avatars.values()]


@router.get("/{avatar_id}", response_model=AvatarResponse)
async def get_avatar(avatar_id: str, current_user: AuthUser = Depends(get_current_user)) -> AvatarResponse:
    """Get a specific avatar by ID."""
    if avatar_id not in _avatars:
        raise HTTPException(status_code=404, detail="Avatar not found")

    return AvatarResponse(**_avatars[avatar_id])


@router.delete("/{avatar_id}")
async def delete_avatar(avatar_id: str, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Delete an avatar."""
    if avatar_id not in _avatars:
        raise HTTPException(status_code=404, detail="Avatar not found")

    del _avatars[avatar_id]
    return {"status": "deleted", "id": avatar_id}


class ClassifyAnglesRequest(BaseModel):
    """Request to auto-classify avatar image angles."""
    image_urls: list[str]


@router.post("/{avatar_id}/classify-angles")
async def classify_angles(avatar_id: str, request: ClassifyAnglesRequest, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Auto-classify uploaded images into angle categories.

    Takes a list of image URLs and returns a mapping of angle -> URL,
    plus validation of required angle coverage.
    """
    ref_service = ReferenceValidationService()

    try:
        # Classify each image
        reference_angles = await ref_service.load_and_classify_images(request.image_urls)

        # Validate coverage
        validation = await ref_service.validate_character_references(reference_angles)

        # Update avatar in memory store if exists
        if avatar_id in _avatars:
            _avatars[avatar_id]["reference_angles"] = reference_angles
            _avatars[avatar_id]["angle_validation"] = validation

        return {
            "avatar_id": avatar_id,
            "reference_angles": reference_angles,
            "validation": validation,
        }

    except Exception as e:
        logger.exception("Angle classification failed")
        raise HTTPException(
            status_code=500,
            detail=f"Angle classification failed: {str(e)}",
        ) from e


@router.post("/{avatar_id}/upload-angle-image")
async def upload_angle_image(
    avatar_id: str,
    file: UploadFile = File(...),
    angle: str = Form(default="auto"),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload an avatar image with angle classification.

    If angle is "auto", uses Gemini Vision to auto-detect the angle.
    Otherwise, uses the provided angle value.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        content = await file.read()

        # Save file
        backend_dir = Path(__file__).resolve().parents[2]
        frontend_dir = backend_dir.parent / "frontend"
        uploads_dir = frontend_dir / "public" / "uploads" / "avatars"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        ext = Path(file.filename or "image.jpg").suffix or ".jpg"
        filename = f"avatar-{uuid.uuid4().hex[:8]}{ext}"
        filepath = uploads_dir / filename

        with open(filepath, "wb") as f:
            f.write(content)

        image_url = f"/uploads/avatars/{filename}"

        # Classify angle
        detected_angle = angle
        if angle == "auto":
            ref_service = ReferenceValidationService()
            detected_angle = await ref_service.classify_image_angle(
                content, file.content_type
            )

        # Update avatar's reference_angles in memory
        if avatar_id in _avatars:
            angles = _avatars[avatar_id].get("reference_angles", {})
            angles[detected_angle] = image_url
            _avatars[avatar_id]["reference_angles"] = angles

            # Add to general reference_images too
            ref_images = _avatars[avatar_id].get("reference_images", [])
            if image_url not in ref_images:
                ref_images.append(image_url)
                _avatars[avatar_id]["reference_images"] = ref_images

        return {
            "image_url": image_url,
            "angle": detected_angle,
            "avatar_id": avatar_id,
        }

    except Exception as e:
        logger.exception("Angle image upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}") from e
