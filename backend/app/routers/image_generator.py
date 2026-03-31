"""Image Generator API endpoints.

Upload product/reference images (separate bottle vs box uploads),
analyze reference scenes, generate product shots with replace technique,
regenerate individual shots, download as ZIP.
"""

import io
import json
import logging
import time
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from app.middleware.auth import AuthUser, get_current_user
from app.models.image_generator_schemas import (
    GenerateRequest,
    RegenerateRequest,
)
from app.services.image_generator_service import ImageGeneratorService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/image-generator", tags=["image-generator"])

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_FRONTEND_DIR = _BACKEND_DIR.parent / "frontend"
_UPLOADS_DIR = _FRONTEND_DIR / "public" / "uploads" / "image-generator"

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


async def _save_uploads(
    files: list[UploadFile],
    subdir: str,
    max_files: int = 10,
) -> list[str]:
    """Save uploaded files to disk and return their URLs."""
    if not files:
        return []
    if len(files) > max_files:
        raise HTTPException(status_code=400, detail=f"Max {max_files} files per upload")

    uploads_dir = _UPLOADS_DIR / subdir
    uploads_dir.mkdir(parents=True, exist_ok=True)

    urls: list[str] = []
    ts = int(time.time())

    for f in files:
        if not f.content_type or f.content_type not in ALLOWED_IMAGE_TYPES:
            continue
        content = await f.read()
        if len(content) > MAX_FILE_SIZE:
            continue

        original = f.filename or "image.jpg"
        sanitized = "".join(c if c.isalnum() or c in ".-_" else "_" for c in original)
        filename = f"{ts}-{sanitized}"
        filepath = uploads_dir / filename

        with open(filepath, "wb") as out:
            out.write(content)

        url = f"/uploads/image-generator/{subdir}/{filename}"
        urls.append(url)

    return urls


# ─── File Uploads ────────────────────────────────────────────────

@router.post("/upload-bottle")
async def upload_bottle_images(
    files: list[UploadFile] = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload bottle-only reference images. Returns list of URLs."""
    urls = await _save_uploads(files, "bottles", max_files=5)
    return {"urls": urls, "count": len(urls)}


@router.post("/upload-box")
async def upload_box_images(
    files: list[UploadFile] = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload packaging box reference images. Returns list of URLs."""
    urls = await _save_uploads(files, "boxes", max_files=5)
    return {"urls": urls, "count": len(urls)}


@router.post("/upload-product")
async def upload_product_images(
    files: list[UploadFile] = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload general product images (fallback if no separate bottle/box). Returns list of URLs."""
    urls = await _save_uploads(files, "products", max_files=10)
    return {"urls": urls, "count": len(urls)}


@router.post("/upload-reference")
async def upload_reference_images(
    files: list[UploadFile] = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload reference/Pinterest scene images. Returns list of URLs."""
    urls = await _save_uploads(files, "references", max_files=5)
    return {"urls": urls, "count": len(urls)}


# ─── Analyze Product ─────────────────────────────────────────────

@router.post("/analyze-product")
async def analyze_product(
    request: dict,
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Extract ProductDNA from uploaded product images."""
    from app.services.product_vision_service import ProductVisionService

    image_urls = request.get("image_urls", [])
    if not image_urls:
        raise HTTPException(status_code=400, detail="No image URLs provided")

    api_key = request.get("api_key")
    service = ProductVisionService(api_key=api_key)

    try:
        dna = await service.analyze_product(
            image_urls=image_urls,
            product_name_hint=request.get("product_name", ""),
            brand_name_hint=request.get("brand_name", ""),
        )
        return {"success": True, "product_dna": dna}
    except Exception as e:
        logger.exception("Product analysis failed")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}") from e


# ─── Analyze Reference Scene ─────────────────────────────────────

@router.post("/analyze-scene")
async def analyze_scene(
    request: dict,
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Analyze a reference/Pinterest scene image — returns mood, lighting, composition, etc."""
    image_url = request.get("image_url", "")
    if not image_url:
        raise HTTPException(status_code=400, detail="image_url is required")

    api_key = request.get("api_key")
    service = ImageGeneratorService(api_key=api_key)

    try:
        analysis = await service._analyze_reference_scene(image_url)
        if analysis:
            return {"success": True, "analysis": analysis}
        return {"success": False, "error": "Scene analysis returned empty"}
    except Exception as e:
        logger.exception("Scene analysis failed")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}") from e


# ─── Generate (SSE streaming) ───────────────────────────────────

@router.post("/generate-stream")
async def generate_stream(
    request: GenerateRequest,
    current_user: AuthUser = Depends(get_current_user),
) -> EventSourceResponse:
    """Generate product shots sequentially via SSE — one event per image.

    Pipeline: analyze reference scene → build per-shot prompts → generate images.
    """
    if not request.reference_images:
        raise HTTPException(status_code=400, detail="Reference images are required")

    # Need at least bottle or product images
    has_product = request.bottle_images or request.product_images
    if not has_product:
        raise HTTPException(status_code=400, detail="Bottle or product images are required")

    # Extract before entering async generator
    product_images = request.product_images
    bottle_images = request.bottle_images
    box_images = request.box_images
    reference_images = request.reference_images
    product_name = request.product_name
    brand_name = request.brand_name
    liquid_color = request.liquid_color
    product_dna = request.product_dna
    shot_types = request.shot_types
    api_key = request.api_key

    async def event_generator():
        service = ImageGeneratorService(api_key=api_key)

        total = len(shot_types) if shot_types else 5
        yield {
            "event": "started",
            "data": json.dumps({
                "total_images": total,
                "message": "Product image generation started",
            }),
        }

        try:
            async for result in service.generate_all_shots_streaming(
                product_images=product_images,
                reference_images=reference_images,
                product_name=product_name,
                brand_name=brand_name,
                liquid_color=liquid_color,
                product_dna=product_dna,
                shot_types=shot_types,
                bottle_images=bottle_images or None,
                box_images=box_images or None,
            ):
                event_type = result.pop("event", "image")
                yield {
                    "event": event_type,
                    "data": json.dumps(result),
                }
        except Exception as e:
            logger.exception("Image generation streaming failed")
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)}),
            }
            return

        yield {
            "event": "complete",
            "data": json.dumps({"message": "All images generated"}),
        }

    return EventSourceResponse(event_generator())


# ─── Regenerate Single Shot ──────────────────────────────────────

@router.post("/regenerate")
async def regenerate_shot(
    request: RegenerateRequest,
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Regenerate a single product shot."""
    service = ImageGeneratorService(api_key=request.api_key)

    try:
        result = await service.generate_single_shot(
            shot_type=request.shot_type,
            product_images=request.product_images,
            reference_images=request.reference_images,
            product_name=request.product_name,
            brand_name=request.brand_name,
            liquid_color=request.liquid_color,
            product_dna=request.product_dna,
            bottle_images=request.bottle_images or None,
            box_images=request.box_images or None,
        )
        return {"success": True, **result}
    except Exception as e:
        logger.exception("Regeneration failed for %s", request.shot_type)
        raise HTTPException(status_code=500, detail=f"Regeneration failed: {str(e)}") from e


# ─── Download ZIP ────────────────────────────────────────────────

@router.post("/download-zip")
async def download_zip(
    request: dict,
    current_user: AuthUser = Depends(get_current_user),
):
    """Download generated images as a ZIP file."""
    image_urls = request.get("image_urls", [])
    product_name = request.get("product_name", "product-images")

    if not image_urls:
        raise HTTPException(status_code=400, detail="No images to download")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for url in image_urls:
            if url.startswith("/uploads/"):
                file_path = _FRONTEND_DIR / "public" / url.lstrip("/")
                if file_path.exists():
                    zf.write(file_path, file_path.name)

    buf.seek(0)
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in product_name)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_images.zip"'},
    )
