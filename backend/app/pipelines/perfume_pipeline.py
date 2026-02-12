"""Perfume image generation pipeline orchestrator.

Follows the same step-based pattern as video_pipeline.py:
  - Named steps with progress percentages
  - Pause/resume/cancel between products during generation
  - Incremental results (each product immediately available)
  - Full pipeline state tracking
"""

import asyncio
import logging
import time
import uuid
from typing import Any

from app.models.schemas import (
    GenderAvatarMapping,
    GenderAvatarSlot,
    InspirationDNA,
    PerfumeAvatarDNA,
    PerfumeInfo,
    PerfumeNotes,
    PerfumePipelineConfig,
    PerfumeProductDNA,
)
from app.services.perfume_image_service import PerfumeImageService

logger = logging.getLogger(__name__)

# Pipeline steps with progress percentages
STEPS: list[tuple[str, int, str]] = [
    ("upload_refs", 5, "Reference images uploaded"),
    ("product_dna", 10, "Extracting product DNA..."),
    ("csv_parse", 15, "CSV parsed and names cleaned"),
    ("avatar_dna", 25, "Extracting avatar DNA..."),
    ("inspiration", 35, "Analyzing inspiration images..."),
    ("configure", 40, "Configuration ready"),
    ("generate", 80, "Generating images..."),
    ("complete", 100, "Pipeline complete!"),
]

# In-memory job storage
_pipeline_jobs: dict[str, dict[str, Any]] = {}


def get_job(job_id: str) -> dict[str, Any] | None:
    """Get a pipeline job by ID."""
    return _pipeline_jobs.get(job_id)


def list_jobs() -> list[dict[str, Any]]:
    """List all jobs with summary info."""
    return [
        {
            "job_id": j["job_id"],
            "status": j["status"],
            "current_step": j.get("current_step", ""),
            "progress": j.get("progress", 0),
            "total_products": j.get("total_products", 0),
            "completed_count": j.get("completed_count", 0),
            "started_at": j.get("started_at", 0),
        }
        for j in _pipeline_jobs.values()
    ]


class PerfumePipeline:
    """Orchestrates the perfume image generation pipeline."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key
        self._service = PerfumeImageService(api_key=api_key)

    async def start_batch(
        self,
        products: list[dict],
        reference_images: list[str],
        product_dna: PerfumeProductDNA | None = None,
        gender_avatars: GenderAvatarMapping | None = None,
        inspiration_dna: InspirationDNA | None = None,
        config: PerfumePipelineConfig | None = None,
        product_indices: list[int] | None = None,
    ) -> str:
        """Start a new batch generation job.

        Returns job_id for tracking.
        """
        cfg = config or PerfumePipelineConfig()
        job_id = str(uuid.uuid4())[:8]

        if product_indices is None:
            product_indices = list(range(len(products)))
        else:
            product_indices = [i for i in product_indices if 0 <= i < len(products)]

        job: dict[str, Any] = {
            "job_id": job_id,
            "status": "running",
            "current_step": "generate",
            "progress": 40,
            "message": "Starting image generation...",
            "products": products,
            "product_indices": product_indices,
            "total_products": len(product_indices),
            "current_product": 0,
            "current_product_name": "",
            "completed_count": 0,
            "results": [],
            "reference_images": reference_images,
            "product_dna": product_dna,
            "gender_avatars": gender_avatars,
            "inspiration_dna": inspiration_dna,
            "config": cfg,
            "paused": False,
            "cancel": False,
            "started_at": time.time(),
        }

        _pipeline_jobs[job_id] = job

        # Fire background task
        asyncio.create_task(self._run_generation(job_id))

        logger.info(
            "Pipeline job %s started: %d products, %d images/product",
            job_id, len(product_indices), cfg.images_per_product,
        )
        return job_id

    async def _run_generation(self, job_id: str) -> None:
        """Background coroutine: generate images for each product with pause/cancel."""
        job = _pipeline_jobs[job_id]
        products = job["products"]
        product_indices = job["product_indices"]
        reference_images = job["reference_images"]
        product_dna = job["product_dna"]
        gender_avatars = job["gender_avatars"]
        inspiration_dna = job["inspiration_dna"]
        cfg: PerfumePipelineConfig = job["config"]

        total = len(product_indices)

        for loop_idx, product_idx in enumerate(product_indices):
            # Cancel check
            if job.get("cancel"):
                job["status"] = "cancelled"
                job["message"] = f"Cancelled after {loop_idx} products"
                logger.info("Job %s cancelled at product %d/%d", job_id, loop_idx, total)
                return

            # Pause check
            while job.get("paused"):
                job["status"] = "paused"
                job["message"] = f"Paused at product {loop_idx + 1}/{total}"
                await asyncio.sleep(0.5)
                if job.get("cancel"):
                    job["status"] = "cancelled"
                    return

            job["status"] = "running"
            product = products[product_idx]
            perfume_name = product.get("cleaned_name") or product.get("perfume_name", f"Product {product_idx + 1}")
            job["current_product"] = loop_idx + 1
            job["current_product_name"] = perfume_name

            # Calculate progress within the generate step (40-95%)
            progress = 40 + int((loop_idx / total) * 55)
            job["progress"] = progress
            job["message"] = f"Generating {perfume_name} ({loop_idx + 1}/{total})"

            logger.info("Job %s [%d/%d] Generating: %s", job_id, loop_idx + 1, total, perfume_name)

            # Build PerfumeInfo
            notes_data = product.get("notes", {})
            perfume_info = PerfumeInfo(
                perfume_name=perfume_name,
                brand_name=product.get("brand_name", ""),
                inspired_by=product.get("inspired_by", ""),
                gender=product.get("gender", "unisex"),
                cleaned_name=product.get("cleaned_name", ""),
                notes=PerfumeNotes(**notes_data) if notes_data else None,
            )

            try:
                images = await self._service.generate_styled_images(
                    perfume_info=perfume_info,
                    reference_images=reference_images,
                    product_dna=product_dna,
                    gender_avatars=gender_avatars,
                    inspiration_dna=inspiration_dna,
                    images_per_product=cfg.images_per_product,
                    aspect_ratio=cfg.aspect_ratio,
                )
                job["results"].append({
                    "perfume_name": perfume_name,
                    "brand_name": product.get("brand_name", ""),
                    "product_index": product_idx,
                    "status": "success",
                    "images": images,
                    "count": len(images),
                })
            except Exception as e:
                logger.exception("Job %s failed for %s", job_id, perfume_name)
                job["results"].append({
                    "perfume_name": perfume_name,
                    "brand_name": product.get("brand_name", ""),
                    "product_index": product_idx,
                    "status": "error",
                    "error": str(e),
                    "images": [],
                    "count": 0,
                })

            job["completed_count"] = loop_idx + 1

        job["status"] = "completed"
        job["progress"] = 100
        job["current_step"] = "complete"
        job["message"] = f"Complete: {len(job['results'])} products processed"
        logger.info("Job %s completed: %d products", job_id, len(job["results"]))

    @staticmethod
    def pause(job_id: str) -> bool:
        """Pause a running job."""
        job = _pipeline_jobs.get(job_id)
        if not job or job["status"] in ("completed", "cancelled"):
            return False
        job["paused"] = True
        return True

    @staticmethod
    def resume(job_id: str) -> bool:
        """Resume a paused job."""
        job = _pipeline_jobs.get(job_id)
        if not job or job["status"] in ("completed", "cancelled"):
            return False
        job["paused"] = False
        return True

    @staticmethod
    def cancel(job_id: str) -> bool:
        """Cancel a running or paused job."""
        job = _pipeline_jobs.get(job_id)
        if not job or job["status"] == "completed":
            return False
        job["cancel"] = True
        job["paused"] = False
        return True
