"""Bulk Image Generator API Router.

CSV-driven bulk product image generation:
  - Upload reference images (Fumera bottle)
  - Upload CSV with PRODUCT_NAME, LIQUID_COLOR columns
  - Generate base shot + 4 angles per row via SSE streaming
  - Download all results as ZIP
"""

import csv
import io
import json
import logging
import time
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.middleware.auth import AuthUser, get_current_user
from app.services.bulk_image_service import BulkImageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/bulk-generator", tags=["bulk-generator"])

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_FRONTEND_DIR = _BACKEND_DIR.parent / "frontend"
_UPLOADS_DIR = _FRONTEND_DIR / "public" / "uploads" / "bulk-generator"

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_CSV_ROWS = 100


# ─── Request Models ───────────────────────────────────────────────

class BulkGenerateRequest(BaseModel):
    """Request to start bulk generation from parsed CSV rows."""
    rows: list[dict] = Field(..., min_length=1)
    reference_images: list[str] = Field(..., min_length=1)
    box_images: list[str] = []
    brand_name: str = "Fumera"
    api_key: str | None = None


class DownloadBulkZipRequest(BaseModel):
    """Request to download bulk images as ZIP."""
    image_urls: list[str] = Field(default_factory=list)
    product_name: str = "bulk-products"


# ─── File Uploads ─────────────────────────────────────────────────

@router.post("/upload-reference")
async def upload_reference_images(
    files: list[UploadFile] = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload reference bottle images (Fumera originals)."""
    uploads_dir = _UPLOADS_DIR / "references"
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
        urls.append(f"/uploads/bulk-generator/references/{filename}")

    return {"urls": urls, "count": len(urls)}


@router.post("/upload-box")
async def upload_box_images(
    files: list[UploadFile] = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload reference box/packaging images."""
    uploads_dir = _UPLOADS_DIR / "boxes"
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
        urls.append(f"/uploads/bulk-generator/boxes/{filename}")

    return {"urls": urls, "count": len(urls)}


@router.post("/upload-csv")
async def upload_csv(
    file: UploadFile = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Parse uploaded CSV file. Returns rows as list of dicts.

    Expected columns: PRODUCT_NAME, LIQUID_COLOR (+ optional extras).
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB max CSV
        raise HTTPException(status_code=400, detail="CSV file too large (max 5MB)")

    try:
        text = content.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Could not decode CSV file")

    reader = csv.DictReader(io.StringIO(text))
    rows: list[dict] = []

    # Normalize column names: "Product Name" → "PRODUCT_NAME", "Liquid Color" → "LIQUID_COLOR"
    def _normalize_key(k: str) -> str:
        return k.strip().upper().replace(" ", "_").replace("-", "_")

    for i, row in enumerate(reader):
        if i >= MAX_CSV_ROWS:
            break
        cleaned = {_normalize_key(k): v.strip() for k, v in row.items() if k and v}
        if cleaned:
            rows.append(cleaned)

    if not rows:
        raise HTTPException(status_code=400, detail="CSV is empty or has no valid rows")

    # Validate required columns
    first_row_keys = set(rows[0].keys())
    if "PRODUCT_NAME" not in first_row_keys:
        raise HTTPException(
            status_code=400,
            detail=f"CSV must have a PRODUCT_NAME (or 'Product Name') column. Found: {', '.join(rows[0].keys())}",
        )

    columns = list(rows[0].keys())

    return {
        "rows": rows,
        "columns": columns,
        "count": len(rows),
        "message": f"Parsed {len(rows)} products from CSV",
    }


# ─── Generate (SSE streaming) ────────────────────────────────────

@router.post("/generate-stream")
async def generate_stream(
    request: BulkGenerateRequest,
    current_user: AuthUser = Depends(get_current_user),
) -> EventSourceResponse:
    """Generate images for all CSV rows via SSE streaming."""
    if not request.reference_images:
        raise HTTPException(status_code=400, detail="Reference images are required")
    if not request.rows:
        raise HTTPException(status_code=400, detail="No product rows provided")
    if len(request.rows) > MAX_CSV_ROWS:
        raise HTTPException(status_code=400, detail=f"Max {MAX_CSV_ROWS} rows per batch")

    rows = request.rows
    reference_images = request.reference_images
    box_images = request.box_images
    brand_name = request.brand_name
    api_key = request.api_key

    async def event_generator():
        service = BulkImageService(api_key=api_key)

        try:
            async for event in service.generate_bulk_streaming(
                rows=rows,
                reference_image_urls=reference_images,
                brand_name=brand_name,
                box_reference_urls=box_images or None,
            ):
                event_type = event.pop("event", "image")
                yield {
                    "event": event_type,
                    "data": json.dumps(event),
                }
        except Exception as e:
            logger.exception("Bulk generation streaming failed")
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)}),
            }

    return EventSourceResponse(event_generator())


# ─── Download ZIP ─────────────────────────────────────────────────

@router.post("/download-zip")
async def download_zip(
    request: DownloadBulkZipRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Download generated bulk images as a ZIP file."""
    if not request.image_urls:
        raise HTTPException(status_code=400, detail="No images to download")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for url in request.image_urls:
            if url.startswith("/uploads/"):
                file_path = _FRONTEND_DIR / "public" / url.lstrip("/")
                if file_path.exists():
                    zf.write(file_path, file_path.name)

    buf.seek(0)
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in request.product_name)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_bulk_images.zip"'},
    )
