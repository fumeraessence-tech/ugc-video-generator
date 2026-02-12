"""Perfume Studio API endpoints for bulk image generation with DNA extraction and CSV batch processing."""

import asyncio
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

from app.models.schemas import (
    AnalyzeInspirationRequest,
    ExtractAvatarDNARequest,
    ExtractGenderAvatarDNARequest,
    ExtractPerfumeDNARequest,
    FetchPerfumeNotesRequest,
    GeneratePerfumeImagesRequest,
    InspirationDNA,
    PerfumeAvatarDNA,
    PerfumeInfo,
    PerfumeNotes,
    PerfumeProductDNA,
    RegeneratePerfumeImageRequest,
)
from app.services.perfume_image_service import PerfumeImageService
from app.services.perfume_name_cleaner import clean_perfume_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/perfume", tags=["perfume"])

# ─── Async Batch Job Management ────────────────────────────────────
# In-memory job state. Each job tracks pause/resume/cancel signals and progress.


# Resolve paths once
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_FRONTEND_DIR = _BACKEND_DIR.parent / "frontend"
_UPLOADS_DIR = _FRONTEND_DIR / "public" / "uploads" / "perfume"


@router.post("/upload-references")
async def upload_references(
    files: list[UploadFile] = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload perfume reference images (bottle, cap, labels).

    Accepts multipart form data. Saves to public/uploads/perfume/refs/.
    Returns list of URLs.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files allowed")

    # Validate file types
    for f in files:
        if not f.content_type or not f.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"Invalid file type: {f.filename}")

    # Save to uploads directory
    uploads_dir = _FRONTEND_DIR / "public" / "uploads" / "perfume" / "refs"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    urls: list[str] = []
    timestamp = int(time.time())

    for f in files:
        content = await f.read()

        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"File too large: {f.filename} (max 10MB)")

        # Sanitize filename
        original = f.filename or "image.jpg"
        sanitized = "".join(c if c.isalnum() or c in ".-_" else "_" for c in original)
        filename = f"{timestamp}-{sanitized}"
        filepath = uploads_dir / filename

        with open(filepath, "wb") as out:
            out.write(content)

        url = f"/uploads/perfume/refs/{filename}"
        urls.append(url)
        logger.info(f"Saved reference image: {url} ({len(content)} bytes)")

    return {"urls": urls}


@router.post("/extract-product-dna")
async def extract_product_dna(request: ExtractPerfumeDNARequest, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Extract detailed product DNA from reference images using Gemini Vision."""
    if not request.image_urls:
        raise HTTPException(status_code=400, detail="At least one image URL is required")

    service = PerfumeImageService(api_key=request.api_key)

    try:
        dna = await service.extract_product_dna(
            image_urls=request.image_urls,
            perfume_name=request.perfume_name,
            brand_name=request.brand_name,
        )

        return {
            "success": True,
            "product_dna": dna.model_dump(),
        }
    except Exception as e:
        logger.exception("Product DNA extraction failed")
        raise HTTPException(status_code=500, detail=f"DNA extraction failed: {str(e)}") from e


@router.post("/extract-avatar-dna")
async def extract_avatar_dna(request: ExtractAvatarDNARequest, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Extract avatar DNA from a model reference image using Gemini Vision."""
    if not request.image_url:
        raise HTTPException(status_code=400, detail="Image URL is required")

    service = PerfumeImageService(api_key=request.api_key)

    try:
        dna = await service.extract_avatar_dna(request.image_url)

        return {
            "success": True,
            "avatar_dna": dna.model_dump(),
        }
    except Exception as e:
        logger.exception("Avatar DNA extraction failed")
        raise HTTPException(status_code=500, detail=f"Avatar DNA extraction failed: {str(e)}") from e


@router.post("/fetch-notes")
async def fetch_notes(request: FetchPerfumeNotesRequest, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Fetch fragrance notes for an inspired-by perfume."""
    if not request.inspired_by.strip():
        raise HTTPException(status_code=400, detail="inspired_by is required")

    service = PerfumeImageService(api_key=request.api_key)
    notes = await service.fetch_perfume_notes(request.inspired_by.strip())

    return {
        "success": True,
        "inspired_by": request.inspired_by,
        "notes": notes.model_dump(),
    }


@router.post("/generate-images")
async def generate_images(request: GeneratePerfumeImagesRequest, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Generate all styled perfume images with Production Bible, avatar DNA, and product DNA."""
    if not request.reference_images:
        raise HTTPException(status_code=400, detail="At least one reference image is required")

    if not request.perfume_info.perfume_name.strip():
        raise HTTPException(status_code=400, detail="Perfume name is required")

    service = PerfumeImageService(api_key=request.api_key)

    try:
        results = await service.generate_all_styles(
            perfume_info=request.perfume_info,
            reference_images=request.reference_images,
            product_dna=request.product_dna,
            avatar_dna=request.avatar_dna,
            avatar_reference_images=request.avatar_reference_images if request.avatar_reference_images else None,
            styles=request.styles if request.styles else None,
            aspect_ratio=request.aspect_ratio,
        )

        return {
            "success": True,
            "images": results,
            "count": len(results),
        }
    except Exception as e:
        logger.exception("Perfume image generation failed")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}") from e


@router.post("/regenerate-image")
async def regenerate_image(request: RegeneratePerfumeImageRequest, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Regenerate a single styled perfume image."""
    if not request.reference_images:
        raise HTTPException(status_code=400, detail="At least one reference image is required")

    service = PerfumeImageService(api_key=request.api_key)

    try:
        result = await service.regenerate_style(
            perfume_info=request.perfume_info,
            reference_images=request.reference_images,
            style=request.style,
            product_dna=request.product_dna,
            avatar_dna=request.avatar_dna,
            avatar_reference_images=request.avatar_reference_images if request.avatar_reference_images else None,
            aspect_ratio=request.aspect_ratio,
        )

        return {
            "success": True,
            "image": result,
        }
    except Exception as e:
        logger.exception("Perfume image regeneration failed")
        raise HTTPException(status_code=500, detail=f"Regeneration failed: {str(e)}") from e


# ─── CSV Batch Processing ─────────────────────────────────────────


@router.post("/upload-inspiration")
async def upload_inspiration(files: list[UploadFile] = File(...), current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Upload inspiration images for style analysis. Saves to /uploads/perfume/inspiration/."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    uploads_dir = _FRONTEND_DIR / "public" / "uploads" / "perfume" / "inspiration"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    urls: list[str] = []
    timestamp = int(time.time())

    for f in files:
        if not f.content_type or not f.content_type.startswith("image/"):
            continue  # Skip non-image files silently

        content = await f.read()
        if len(content) > 10 * 1024 * 1024:
            continue  # Skip oversized files

        original = f.filename or "image.jpg"
        sanitized = "".join(c if c.isalnum() or c in ".-_" else "_" for c in original)
        filename = f"{timestamp}-{sanitized}"
        filepath = uploads_dir / filename

        with open(filepath, "wb") as out:
            out.write(content)

        url = f"/uploads/perfume/inspiration/{filename}"
        urls.append(url)

    return {"urls": urls, "count": len(urls)}


@router.post("/analyze-inspiration")
async def analyze_inspiration(request: AnalyzeInspirationRequest, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Analyze inspiration images and extract style DNA via vision API."""
    if not request.image_urls:
        raise HTTPException(status_code=400, detail="At least one image URL is required")

    from app.services.inspiration_service import InspirationService

    service = InspirationService(api_key=request.api_key)
    try:
        dna = await service.analyze_inspiration_portfolio(
            image_urls=request.image_urls,
            sample_size=request.sample_size,
        )
        return {"success": True, "inspiration_dna": dna.model_dump()}
    except Exception as e:
        logger.exception("Inspiration analysis failed")
        raise HTTPException(status_code=500, detail=f"Inspiration analysis failed: {str(e)}") from e


@router.post("/extract-gender-avatar-dna")
async def extract_gender_avatar_dna(request: ExtractGenderAvatarDNARequest, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Extract avatar DNA for a specific gender slot (male/female/unisex)."""
    if not request.image_urls:
        raise HTTPException(status_code=400, detail="At least one image URL is required")

    service = PerfumeImageService(api_key=request.api_key)

    try:
        # Use the first image for DNA extraction (primary reference)
        dna = await service.extract_avatar_dna(request.image_urls[0])
        # Override gender to match the slot
        dna.gender = request.gender.upper()

        return {
            "success": True,
            "gender": request.gender,
            "avatar_dna": dna.model_dump(),
        }
    except Exception as e:
        logger.exception(f"Gender avatar DNA extraction failed for {request.gender}")
        raise HTTPException(status_code=500, detail=f"Avatar DNA extraction failed: {str(e)}") from e


@router.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...), current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Upload a CSV file with perfume product data for batch processing.

    Expected CSV columns:
    - perfume_name (required)
    - brand_name
    - inspired_by
    - gender (male/female/unisex)
    - description
    - top_notes (comma-separated within)
    - middle_notes (comma-separated within)
    - base_notes (comma-separated within)

    Returns parsed products list.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="CSV file too large (max 5MB)")

    try:
        text = content.decode("utf-8-sig")  # Handle BOM
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Could not decode CSV file")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no headers")

    # Normalize header names (lowercase, strip, replace spaces with underscores)
    normalized_fields = [f.strip().lower().replace(" ", "_") for f in reader.fieldnames]

    # Helper to find values by exact key or prefix match (for Shopify metafield columns
    # like "base_notes_(product.metafields.custom.base_notes)")
    def find_value(row: dict, *keys: str) -> str:
        for k in keys:
            if k in row and row[k]:
                return row[k]
        # Prefix match for Shopify metafield-style columns
        for k in keys:
            for col_key, col_val in row.items():
                if col_key.startswith(k) and col_val:
                    return col_val
        return ""

    # Parse notes - handle both semicolon and comma separated
    def parse_list(val: str) -> list[str]:
        if not val:
            return []
        items = []
        for part in val.replace(";", ",").split(","):
            cleaned = part.strip()
            if cleaned:
                items.append(cleaned)
        return items

    products = []
    for row_num, row in enumerate(reader, start=2):
        # Build normalized row
        norm_row = {}
        for orig_key, norm_key in zip(reader.fieldnames, normalized_fields):
            norm_row[norm_key] = (row.get(orig_key) or "").strip()

        # Extract perfume name (required) - supports Shopify "Title" column
        perfume_name = find_value(norm_row, "perfume_name", "name", "product_name", "title")
        if not perfume_name:
            continue  # Skip empty/variant rows

        top_notes = parse_list(find_value(norm_row, "top_notes", "top"))
        middle_notes = parse_list(find_value(norm_row, "middle_notes", "middle", "heart_notes", "heart"))
        base_notes = parse_list(find_value(norm_row, "base_notes", "base"))

        product = {
            "perfume_name": perfume_name,
            "cleaned_name": clean_perfume_name(perfume_name),
            "brand_name": find_value(norm_row, "brand_name", "brand", "vendor"),
            "inspired_by": find_value(norm_row, "inspired_by", "inspiration"),
            "gender": find_value(norm_row, "gender") or "unisex",
            "description": find_value(norm_row, "description", "product_description"),
            "notes": {
                "top": top_notes,
                "middle": middle_notes,
                "base": base_notes,
                "description": find_value(norm_row, "notes_description", "fragrance_description"),
            },
            "row_number": row_num,
        }
        products.append(product)

    if not products:
        raise HTTPException(status_code=400, detail="No valid products found in CSV. Ensure 'perfume_name' column exists.")

    return {
        "success": True,
        "products": products,
        "count": len(products),
        "columns": normalized_fields,
    }


@router.post("/batch-job/start")
async def batch_job_start(request: dict, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Start an async batch generation job using the pipeline orchestrator.

    Accepts:
      - products: list[dict]
      - reference_images: list[str]
      - product_dna: dict | None
      - gender_avatars: dict | None (GenderAvatarMapping)
      - inspiration_dna: dict | None (InspirationDNA)
      - config: dict | None (PerfumePipelineConfig)
      - product_indices: list[int] | None
      - aspect_ratio: str
      - api_key: str | None
    """
    from app.pipelines.perfume_pipeline import PerfumePipeline
    from app.models.schemas import GenderAvatarMapping, GenderAvatarSlot, PerfumePipelineConfig

    products = request.get("products", [])
    if not products:
        raise HTTPException(status_code=400, detail="No products provided")

    reference_images = request.get("reference_images", [])
    if not reference_images:
        raise HTTPException(status_code=400, detail="Reference images are required")

    # Parse product DNA
    p_dna_data = request.get("product_dna")
    p_dna = PerfumeProductDNA(**p_dna_data) if p_dna_data else None

    # Parse gender avatars
    ga_data = request.get("gender_avatars")
    gender_avatars = None
    if ga_data:
        gender_avatars = GenderAvatarMapping(
            male=GenderAvatarSlot(**ga_data["male"]) if ga_data.get("male") else GenderAvatarSlot(),
            female=GenderAvatarSlot(**ga_data["female"]) if ga_data.get("female") else GenderAvatarSlot(),
            unisex=GenderAvatarSlot(**ga_data["unisex"]) if ga_data.get("unisex") else GenderAvatarSlot(),
        )

    # Parse inspiration DNA
    insp_data = request.get("inspiration_dna")
    insp_dna = InspirationDNA(**insp_data) if insp_data else None

    # Parse config
    cfg_data = request.get("config")
    cfg = PerfumePipelineConfig(**cfg_data) if cfg_data else PerfumePipelineConfig(
        aspect_ratio=request.get("aspect_ratio", "1:1"),
    )

    # Product indices
    product_indices = request.get("product_indices")
    if product_indices is not None:
        product_indices = [i for i in product_indices if 0 <= i < len(products)]
        if not product_indices:
            raise HTTPException(status_code=400, detail="No valid product indices provided")

    pipeline = PerfumePipeline(api_key=request.get("api_key"))
    job_id = await pipeline.start_batch(
        products=products,
        reference_images=reference_images,
        product_dna=p_dna,
        gender_avatars=gender_avatars,
        inspiration_dna=insp_dna,
        config=cfg,
        product_indices=product_indices,
    )

    from app.pipelines.perfume_pipeline import get_job
    job = get_job(job_id)

    return {
        "success": True,
        "job_id": job_id,
        "total_products": job["total_products"] if job else 0,
        "selected_indices": product_indices or list(range(len(products))),
    }


@router.get("/batch-job/{job_id}/status")
async def batch_job_status(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Poll job progress. Returns current state, progress, and incremental results."""
    from app.pipelines.perfume_pipeline import get_job

    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job.get("progress", 0),
        "message": job.get("message", ""),
        "total_products": job["total_products"],
        "current_product": job.get("current_product", 0),
        "current_product_name": job.get("current_product_name", ""),
        "completed_count": job.get("completed_count", 0),
        "results": job.get("results", []),
        "paused": job.get("paused", False),
    }


@router.post("/batch-job/{job_id}/pause")
async def batch_job_pause(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Pause a running job. It will finish the current product then wait."""
    from app.pipelines.perfume_pipeline import PerfumePipeline

    if not PerfumePipeline.pause(job_id):
        raise HTTPException(status_code=400, detail="Job not found or already completed")
    return {"success": True, "job_id": job_id, "status": "pausing"}


@router.post("/batch-job/{job_id}/resume")
async def batch_job_resume(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Resume a paused job."""
    from app.pipelines.perfume_pipeline import PerfumePipeline

    if not PerfumePipeline.resume(job_id):
        raise HTTPException(status_code=400, detail="Job not found or already completed")
    return {"success": True, "job_id": job_id, "status": "resuming"}


@router.post("/batch-job/{job_id}/cancel")
async def batch_job_cancel(job_id: str, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Cancel a running or paused job. Already-generated images are kept."""
    from app.pipelines.perfume_pipeline import PerfumePipeline

    if not PerfumePipeline.cancel(job_id):
        raise HTTPException(status_code=400, detail="Job not found or already completed")
    return {"success": True, "job_id": job_id, "status": "cancelling"}


@router.post("/regenerate-product-set")
async def regenerate_product_set(request: dict, current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Regenerate all 7 styles for a single product.

    Expected request body:
    {
        "perfume_info": {...},
        "reference_images": [...],
        "product_dna": {...},
        "avatar_dna": {...},
        "avatar_reference_images": [...],
        "aspect_ratio": "1:1",
        "api_key": null
    }
    """
    perfume_info_data = request.get("perfume_info")
    if not perfume_info_data:
        raise HTTPException(status_code=400, detail="perfume_info is required")

    reference_images = request.get("reference_images", [])
    if not reference_images:
        raise HTTPException(status_code=400, detail="At least one reference image is required")

    product_dna_data = request.get("product_dna")
    avatar_dna_data = request.get("avatar_dna")
    avatar_ref_images = request.get("avatar_reference_images", [])
    aspect_ratio = request.get("aspect_ratio", "1:1")
    api_key = request.get("api_key")

    service = PerfumeImageService(api_key=api_key)

    from app.models.schemas import PerfumeAvatarDNA, PerfumeInfo, PerfumeNotes, PerfumeProductDNA

    # Parse perfume info
    notes_data = perfume_info_data.get("notes")
    perfume_info = PerfumeInfo(
        perfume_name=perfume_info_data.get("perfume_name", ""),
        brand_name=perfume_info_data.get("brand_name", ""),
        inspired_by=perfume_info_data.get("inspired_by", ""),
        gender=perfume_info_data.get("gender", "unisex"),
        notes=PerfumeNotes(**notes_data) if notes_data else None,
    )

    p_dna = PerfumeProductDNA(**product_dna_data) if product_dna_data else None
    a_dna = PerfumeAvatarDNA(**avatar_dna_data) if avatar_dna_data else None

    try:
        images = await service.generate_all_styles(
            perfume_info=perfume_info,
            reference_images=reference_images,
            product_dna=p_dna,
            avatar_dna=a_dna,
            avatar_reference_images=avatar_ref_images if avatar_ref_images else None,
            styles=None,  # Generate all styles
            aspect_ratio=aspect_ratio,
        )

        return {
            "success": True,
            "images": images,
            "count": len(images),
        }
    except Exception as e:
        logger.exception(f"Product set regeneration failed for {perfume_info.perfume_name}")
        raise HTTPException(status_code=500, detail=f"Regeneration failed: {str(e)}") from e


@router.get("/gallery")
async def gallery(current_user: AuthUser = Depends(get_current_user)) -> dict:
    """List all generated perfume images, grouped by product sets.

    Scans the perfume uploads directory, groups images by close timestamps
    (images generated for the same product appear within seconds of each other),
    and returns them in reverse chronological order.
    """
    if not _UPLOADS_DIR.exists():
        return {"groups": [], "total_images": 0, "total_groups": 0}

    STYLES = [
        "white_background", "flat_lay", "close_up_detail",
        "luxury_lifestyle", "model_male", "model_female", "notes_based",
    ]
    STYLE_LABELS = {
        "white_background": "White Background",
        "flat_lay": "Flat Lay",
        "close_up_detail": "Close-Up Detail",
        "luxury_lifestyle": "Luxury Lifestyle",
        "model_male": "Model (Male)",
        "model_female": "Model (Female)",
        "notes_based": "Notes-Based",
    }

    # Collect all generated images (not refs/)
    images = []
    for f in _UPLOADS_DIR.iterdir():
        if f.is_file() and f.suffix == ".png" and not f.name.startswith("."):
            # Parse style from filename: {style}-{uuid8}.png
            name_no_ext = f.stem  # e.g. "flat_lay-09863462"
            parts = name_no_ext.rsplit("-", 1)
            if len(parts) == 2 and parts[0] in STYLES:
                style = parts[0]
                mtime = f.stat().st_mtime
                size_bytes = f.stat().st_size
                images.append({
                    "filename": f.name,
                    "style": style,
                    "label": STYLE_LABELS.get(style, style),
                    "url": f"/uploads/perfume/{f.name}",
                    "mtime": mtime,
                    "size_kb": round(size_bytes / 1024),
                })

    if not images:
        return {"groups": [], "total_images": 0, "total_groups": 0}

    # Sort by mtime ascending (oldest first) for grouping
    images.sort(key=lambda x: x["mtime"])

    # Group by detecting new product sets: a new set starts when
    # we see a style that already exists in the current group
    groups: list[list[dict]] = []
    current_group: list[dict] = []
    current_styles: set[str] = set()

    for img in images:
        if img["style"] in current_styles:
            # This style already seen → start new group
            groups.append(current_group)
            current_group = [img]
            current_styles = {img["style"]}
        else:
            current_group.append(img)
            current_styles.add(img["style"])

    if current_group:
        groups.append(current_group)

    # Build response — reverse for newest first
    result_groups = []
    for idx, group in enumerate(reversed(groups)):
        group_sorted = sorted(group, key=lambda x: STYLES.index(x["style"]) if x["style"] in STYLES else 99)
        result_groups.append({
            "index": idx + 1,
            "image_count": len(group_sorted),
            "timestamp": min(img["mtime"] for img in group_sorted),
            "images": [
                {
                    "filename": img["filename"],
                    "style": img["style"],
                    "label": img["label"],
                    "url": img["url"],
                    "size_kb": img["size_kb"],
                }
                for img in group_sorted
            ],
        })

    return {
        "groups": result_groups,
        "total_images": len(images),
        "total_groups": len(result_groups),
    }


@router.post("/download-zip")
async def download_zip(request: dict, current_user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    """Create a zip file of generated images for download.

    Expected request body:
    {
        "mode": "all" | "product" | "selected",
        "product_name": "...",  // For product mode
        "image_urls": [...]  // Image URLs to include
    }
    """
    mode = request.get("mode", "all")
    image_urls = request.get("image_urls", [])
    product_name = request.get("product_name", "perfume")

    if not image_urls:
        raise HTTPException(status_code=400, detail="No images to download")

    # Create zip in memory
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for url in image_urls:
            # Convert URL to file path
            if url.startswith("/uploads/"):
                file_path = _FRONTEND_DIR / "public" / url.lstrip("/")
            elif url.startswith("http"):
                continue  # Skip external URLs
            else:
                continue

            # Strip query params
            file_path_str = str(file_path).split("?")[0]
            file_path = Path(file_path_str)

            if file_path.exists():
                # Archive name: product_name/style-xxxx.png or just style-xxxx.png
                archive_name = file_path.name
                if mode == "product" and product_name:
                    sanitized = "".join(c if c.isalnum() or c in " -_" else "_" for c in product_name)
                    archive_name = f"{sanitized}/{file_path.name}"

                zf.write(file_path, archive_name)

    buffer.seek(0)

    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in product_name)
    filename = f"{safe_name}_images.zip" if mode == "product" else "perfume_images.zip"

    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/download-batch-zip")
async def download_batch_zip(request: dict, current_user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    """Create a zip file organized by product name for batch downloads.

    Expected request body:
    {
        "batch_results": [
            {
                "perfume_name": "...",
                "images": [{"style": "...", "image_url": "..."}]
            }
        ]
    }
    """
    batch_results = request.get("batch_results", [])
    if not batch_results:
        raise HTTPException(status_code=400, detail="No batch results provided")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for product in batch_results:
            perfume_name = product.get("perfume_name", "unknown")
            safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in perfume_name)
            images = product.get("images", [])

            for img in images:
                url = img.get("image_url", "")
                if not url or url.startswith("http") or url.startswith("Error"):
                    continue

                # Convert URL to file path
                url_clean = url.split("?")[0]
                if url_clean.startswith("/uploads/"):
                    file_path = _FRONTEND_DIR / "public" / url_clean.lstrip("/")
                else:
                    continue

                if file_path.exists():
                    style = img.get("style", "image")
                    ext = file_path.suffix or ".png"
                    archive_name = f"{safe_name}/{style}{ext}"
                    zf.write(file_path, archive_name)

    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=perfume_batch_images.zip"},
    )


@router.post("/upload-avatars")
async def upload_avatars(
    files: list[UploadFile] = File(...),
    current_user: AuthUser = Depends(get_current_user),
) -> dict:
    """Upload avatar reference images. Saves to /uploads/perfume/avatars/."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    uploads_dir = _FRONTEND_DIR / "public" / "uploads" / "perfume" / "avatars"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    urls: list[str] = []
    timestamp = int(time.time())

    for f in files:
        if not f.content_type or not f.content_type.startswith("image/"):
            continue

        content = await f.read()
        if len(content) > 10 * 1024 * 1024:
            continue

        original = f.filename or "avatar.jpg"
        sanitized = "".join(c if c.isalnum() or c in ".-_" else "_" for c in original)
        filename = f"{timestamp}-{sanitized}"
        filepath = uploads_dir / filename

        with open(filepath, "wb") as out:
            out.write(content)

        url = f"/uploads/perfume/avatars/{filename}"
        urls.append(url)

    return {"urls": urls, "count": len(urls)}


@router.get("/history")
async def generation_history(current_user: AuthUser = Depends(get_current_user)) -> dict:
    """Get all pipeline job history with results."""
    from app.pipelines.perfume_pipeline import list_jobs, get_job

    jobs = list_jobs()
    history = []

    for job_summary in jobs:
        job = get_job(job_summary["job_id"])
        if not job:
            continue

        results = job.get("results", [])
        successful = [r for r in results if r.get("status") == "success"]
        total_images = sum(r.get("count", 0) for r in successful)

        history.append({
            "job_id": job["job_id"],
            "status": job["status"],
            "started_at": job.get("started_at", 0),
            "total_products": job.get("total_products", 0),
            "completed_count": job.get("completed_count", 0),
            "successful_count": len(successful),
            "total_images": total_images,
            "results": results,
        })

    # Sort by started_at descending (newest first)
    history.sort(key=lambda x: x["started_at"], reverse=True)

    return {"history": history, "total_jobs": len(history)}
