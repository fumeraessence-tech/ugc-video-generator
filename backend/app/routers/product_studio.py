"""Product Studio API endpoints.

Upload CSV, bottle images, inspiration images.
Start white-bg and inspiration batch jobs.
Download results as ZIP.
"""

import csv
import io
import logging
import os
import time
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.middleware.auth import AuthUser, get_current_user
from app.services.perfume_name_cleaner import clean_perfume_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/product-studio", tags=["product-studio"])

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_FRONTEND_DIR = _BACKEND_DIR.parent / "frontend"
_UPLOADS_DIR = _FRONTEND_DIR / "public" / "uploads" / "product-studio"


# ─── CSV Upload ───────────────────────────────────────────────────

@router.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...), current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Parse Shopify CSV and return products list."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="CSV too large (max 5MB)")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Could not decode CSV")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no headers")

    normalized_fields = [f.strip().lower().replace(" ", "_") for f in reader.fieldnames]

    def find_value(row: dict, *keys: str) -> str:
        for k in keys:
            if k in row and row[k]:
                return row[k]
        for k in keys:
            for col_key, col_val in row.items():
                if col_key.startswith(k) and col_val:
                    return col_val
        return ""

    products = []
    for row_num, row in enumerate(reader, start=2):
        norm_row = {}
        for orig_key, norm_key in zip(reader.fieldnames, normalized_fields):
            norm_row[norm_key] = (row.get(orig_key) or "").strip()

        perfume_name = find_value(norm_row, "perfume_name", "name", "product_name", "title")
        if not perfume_name:
            continue

        handle = find_value(norm_row, "handle", "url_handle", "slug") or perfume_name.lower().replace(" ", "-")
        image_src = find_value(norm_row, "image_src", "image", "image_url", "product_image")

        product = {
            "perfume_name": perfume_name,
            "cleaned_name": clean_perfume_name(perfume_name),
            "brand_name": find_value(norm_row, "brand_name", "brand", "vendor"),
            "gender": find_value(norm_row, "gender") or "unisex",
            "description": find_value(norm_row, "description", "product_description", "body_(html)"),
            "handle": handle,
            "image_src": image_src,
            "row_number": row_num,
        }
        products.append(product)

    if not products:
        raise HTTPException(status_code=400, detail="No valid products found in CSV")

    return {
        "success": True,
        "products": products,
        "count": len(products),
        "columns": normalized_fields,
    }


# ─── File Uploads ─────────────────────────────────────────────────

@router.post("/upload-bottle-images")
async def upload_bottle_images(
    files: list[UploadFile] = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload bottle reference images. Returns list of URLs."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Max 50 files per upload")

    uploads_dir = _UPLOADS_DIR / "bottles"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    urls: list[str] = []
    ts = int(time.time())

    for f in files:
        if not f.content_type or not f.content_type.startswith("image/"):
            continue
        content = await f.read()
        if len(content) > 10 * 1024 * 1024:
            continue

        original = f.filename or "image.jpg"
        sanitized = "".join(c if c.isalnum() or c in ".-_" else "_" for c in original)
        filename = f"{ts}-{sanitized}"
        filepath = uploads_dir / filename

        with open(filepath, "wb") as out:
            out.write(content)

        url = f"/uploads/product-studio/bottles/{filename}"
        urls.append(url)

    return {"urls": urls, "count": len(urls)}


@router.post("/upload-inspiration")
async def upload_inspiration(
    files: list[UploadFile] = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload Pinterest/inspiration reference images."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > 100:
        raise HTTPException(status_code=400, detail="Max 100 files per upload")

    uploads_dir = _UPLOADS_DIR / "inspiration"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    urls: list[str] = []
    ts = int(time.time())

    for f in files:
        if not f.content_type or not f.content_type.startswith("image/"):
            continue
        content = await f.read()
        if len(content) > 10 * 1024 * 1024:
            continue

        original = f.filename or "image.jpg"
        sanitized = "".join(c if c.isalnum() or c in ".-_" else "_" for c in original)
        filename = f"{ts}-{sanitized}"
        filepath = uploads_dir / filename

        with open(filepath, "wb") as out:
            out.write(content)

        url = f"/uploads/product-studio/inspiration/{filename}"
        urls.append(url)

    return {"urls": urls, "count": len(urls)}


# ─── White-BG Batch Endpoints ────────────────────────────────────

@router.post("/white-bg/start")
async def white_bg_start(request: dict, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Start white-background batch generation."""
    from app.pipelines.product_studio_pipeline import ProductStudioPipeline

    products = request.get("products", [])
    if not products:
        raise HTTPException(status_code=400, detail="No products provided")

    pipeline = ProductStudioPipeline()
    job_id = await pipeline.start_white_bg_batch(
        products=products,
        bottle_images=request.get("bottle_images", {}),
        brand_name=request.get("brand_name", ""),
        logo_url=request.get("logo_url"),
        aspect_ratio=request.get("aspect_ratio", "1:1"),
        product_indices=request.get("product_indices"),
    )

    from app.pipelines.product_studio_pipeline import get_job
    job = get_job(job_id)

    return {
        "success": True,
        "job_id": job_id,
        "total_products": job["total_products"] if job else 0,
    }


@router.get("/job/{job_id}/status")
async def job_status(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Poll job progress (works for both white-bg and inspiration jobs)."""
    from app.pipelines.product_studio_pipeline import get_job

    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "job_id": job_id,
        "job_type": job.get("job_type", ""),
        "status": job["status"],
        "progress": job.get("progress", 0),
        "message": job.get("message", ""),
        "total_products": job["total_products"],
        "current_product_name": job.get("current_product_name", ""),
        "completed_count": job.get("completed_count", 0),
        "results": job.get("results", []),
        "paused": job.get("paused", False),
    }


@router.post("/job/{job_id}/pause")
async def job_pause(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> dict:
    from app.pipelines.product_studio_pipeline import ProductStudioPipeline
    if not ProductStudioPipeline.pause(job_id):
        raise HTTPException(status_code=400, detail="Job not found or already completed")
    return {"success": True}


@router.post("/job/{job_id}/resume")
async def job_resume(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> dict:
    from app.pipelines.product_studio_pipeline import ProductStudioPipeline
    if not ProductStudioPipeline.resume(job_id):
        raise HTTPException(status_code=400, detail="Job not found or already completed")
    return {"success": True}


@router.post("/job/{job_id}/cancel")
async def job_cancel(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> dict:
    from app.pipelines.product_studio_pipeline import ProductStudioPipeline
    if not ProductStudioPipeline.cancel(job_id):
        raise HTTPException(status_code=400, detail="Job not found or already completed")
    return {"success": True}


# ─── Inspiration Batch Endpoints ──────────────────────────────────

@router.post("/inspiration/start")
async def inspiration_start(request: dict, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Start inspiration-based styled generation."""
    from app.pipelines.product_studio_pipeline import ProductStudioPipeline

    products = request.get("products", [])
    if not products:
        raise HTTPException(status_code=400, detail="No products provided")

    pipeline = ProductStudioPipeline()
    job_id = await pipeline.start_inspiration_batch(
        products=products,
        white_bg_images=request.get("white_bg_images", {}),
        inspiration_images=request.get("inspiration_images", []),
        angles_per_product=request.get("angles_per_product", 5),
        aspect_ratio=request.get("aspect_ratio", "1:1"),
        product_indices=request.get("product_indices"),
    )

    from app.pipelines.product_studio_pipeline import get_job
    job = get_job(job_id)

    return {
        "success": True,
        "job_id": job_id,
        "total_products": job["total_products"] if job else 0,
    }


# ─── Download ─────────────────────────────────────────────────────

@router.post("/download-zip")
async def download_zip(request: dict, current_user: AuthUser = Depends(get_current_user)):
    """Download results as a ZIP file."""
    image_urls = request.get("image_urls", [])
    batch_results = request.get("batch_results", [])
    product_name = request.get("product_name", "product-studio")

    if batch_results:
        for result in batch_results:
            if result.get("image_url"):
                image_urls.append(result["image_url"])
            for img in result.get("images", []):
                if img.get("image_url") and not img["image_url"].startswith("Error"):
                    image_urls.append(img["image_url"])

    if not image_urls:
        raise HTTPException(status_code=400, detail="No images to download")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for url in image_urls:
            if url.startswith("/uploads/"):
                file_path = _FRONTEND_DIR / "public" / url.lstrip("/")
                if file_path.exists():
                    arcname = file_path.name
                    zf.write(file_path, arcname)

    buf.seek(0)
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in product_name)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_images.zip"'},
    )
