"""Product Studio batch pipeline orchestrator.

Two independent batch operations:
1. White-background generation (1 image per product)
2. Inspiration-based styled generation (N angles per product)

Each supports pause/resume/cancel with 2-second frontend polling.
"""

import asyncio
import logging
import time
import uuid
from typing import Any

from app.services.product_studio_service import ProductStudioService, STYLED_ANGLES

logger = logging.getLogger(__name__)

# In-memory job storage (separate from perfume pipeline)
_jobs: dict[str, dict[str, Any]] = {}


def get_job(job_id: str) -> dict[str, Any] | None:
    return _jobs.get(job_id)


def list_jobs() -> list[dict[str, Any]]:
    return [
        {
            "job_id": j["job_id"],
            "job_type": j["job_type"],
            "status": j["status"],
            "progress": j.get("progress", 0),
            "total_products": j.get("total_products", 0),
            "completed_count": j.get("completed_count", 0),
            "started_at": j.get("started_at", 0),
        }
        for j in _jobs.values()
    ]


class ProductStudioPipeline:
    """Orchestrates batch image generation for Product Studio."""

    def __init__(self, api_key: str | None = None) -> None:
        self._service = ProductStudioService(api_key=api_key)

    # ─── White-BG Batch ───────────────────────────────────────────

    async def start_white_bg_batch(
        self,
        products: list[dict],
        bottle_images: dict[int, str],
        brand_name: str = "",
        logo_url: str | None = None,
        aspect_ratio: str = "1:1",
        product_indices: list[int] | None = None,
    ) -> str:
        """Start white-background generation for selected products."""
        job_id = str(uuid.uuid4())[:8]

        if product_indices is None:
            product_indices = list(range(len(products)))
        else:
            product_indices = [i for i in product_indices if 0 <= i < len(products)]

        job: dict[str, Any] = {
            "job_id": job_id,
            "job_type": "white_bg",
            "status": "running",
            "progress": 0,
            "message": "Starting white-background generation...",
            "products": products,
            "bottle_images": bottle_images,
            "brand_name": brand_name,
            "logo_url": logo_url,
            "aspect_ratio": aspect_ratio,
            "product_indices": product_indices,
            "total_products": len(product_indices),
            "completed_count": 0,
            "current_product_name": "",
            "results": [],
            "paused": False,
            "cancel": False,
            "started_at": time.time(),
        }
        _jobs[job_id] = job
        asyncio.create_task(self._run_white_bg(job_id))
        logger.info("White-bg job %s: %d products", job_id, len(product_indices))
        return job_id

    async def _run_white_bg(self, job_id: str) -> None:
        job = _jobs[job_id]
        products = job["products"]
        indices = job["product_indices"]
        bottle_images = job["bottle_images"]
        total = len(indices)

        for loop_idx, prod_idx in enumerate(indices):
            if job.get("cancel"):
                job["status"] = "cancelled"
                job["message"] = f"Cancelled after {loop_idx} products"
                return

            while job.get("paused"):
                job["status"] = "paused"
                await asyncio.sleep(0.5)
                if job.get("cancel"):
                    job["status"] = "cancelled"
                    return

            job["status"] = "running"
            product = products[prod_idx]
            name = product.get("cleaned_name") or product.get("perfume_name", f"Product {prod_idx + 1}")
            job["current_product_name"] = name
            job["progress"] = int((loop_idx / total) * 100)
            job["message"] = f"Generating white-bg for {name} ({loop_idx + 1}/{total})"

            bottle_path = bottle_images.get(prod_idx) or bottle_images.get(str(prod_idx))

            try:
                image_url = await self._service.generate_white_bg(
                    product_name=name,
                    brand_name=product.get("brand_name") or job["brand_name"],
                    bottle_image_path=bottle_path,
                    logo_url=job.get("logo_url"),
                    aspect_ratio=job["aspect_ratio"],
                )
                job["results"].append({
                    "product_index": prod_idx,
                    "perfume_name": name,
                    "status": "success",
                    "image_url": image_url,
                })
            except Exception as e:
                logger.exception("White-bg failed for %s", name)
                job["results"].append({
                    "product_index": prod_idx,
                    "perfume_name": name,
                    "status": "error",
                    "error": str(e),
                    "image_url": "",
                })

            job["completed_count"] = loop_idx + 1

        job["status"] = "completed"
        job["progress"] = 100
        job["message"] = f"Complete: {total} products processed"
        logger.info("White-bg job %s completed", job_id)

    # ─── Inspiration/Styled Batch ─────────────────────────────────

    async def start_inspiration_batch(
        self,
        products: list[dict],
        white_bg_images: dict[int, str],
        inspiration_images: list[str],
        angles_per_product: int = 5,
        aspect_ratio: str = "1:1",
        product_indices: list[int] | None = None,
    ) -> str:
        """Start inspiration-based styled generation for selected products."""
        job_id = str(uuid.uuid4())[:8]

        if product_indices is None:
            product_indices = list(range(len(products)))
        else:
            product_indices = [i for i in product_indices if 0 <= i < len(products)]

        job: dict[str, Any] = {
            "job_id": job_id,
            "job_type": "inspiration",
            "status": "running",
            "progress": 0,
            "message": "Starting styled generation...",
            "products": products,
            "white_bg_images": white_bg_images,
            "inspiration_images": inspiration_images,
            "angles_per_product": min(angles_per_product, len(STYLED_ANGLES)),
            "aspect_ratio": aspect_ratio,
            "product_indices": product_indices,
            "total_products": len(product_indices),
            "completed_count": 0,
            "current_product_name": "",
            "results": [],
            "paused": False,
            "cancel": False,
            "started_at": time.time(),
        }
        _jobs[job_id] = job
        asyncio.create_task(self._run_inspiration(job_id))
        logger.info("Inspiration job %s: %d products, %d angles", job_id, len(product_indices), job["angles_per_product"])
        return job_id

    async def _run_inspiration(self, job_id: str) -> None:
        job = _jobs[job_id]
        products = job["products"]
        indices = job["product_indices"]
        white_bg_images = job["white_bg_images"]
        inspiration_images = job["inspiration_images"]
        angles = STYLED_ANGLES[:job["angles_per_product"]]
        total = len(indices)

        for loop_idx, prod_idx in enumerate(indices):
            if job.get("cancel"):
                job["status"] = "cancelled"
                job["message"] = f"Cancelled after {loop_idx} products"
                return

            while job.get("paused"):
                job["status"] = "paused"
                await asyncio.sleep(0.5)
                if job.get("cancel"):
                    job["status"] = "cancelled"
                    return

            job["status"] = "running"
            product = products[prod_idx]
            name = product.get("cleaned_name") or product.get("perfume_name", f"Product {prod_idx + 1}")
            job["current_product_name"] = name
            job["progress"] = int((loop_idx / total) * 100)
            job["message"] = f"Generating styled images for {name} ({loop_idx + 1}/{total})"

            white_bg_path = white_bg_images.get(prod_idx) or white_bg_images.get(str(prod_idx))

            product_images: list[dict] = []
            for angle in angles:
                if job.get("cancel"):
                    break
                try:
                    result = await self._service.generate_styled_angle(
                        product_name=name,
                        brand_name=product.get("brand_name", ""),
                        white_bg_image_path=white_bg_path,
                        inspiration_images=inspiration_images,
                        angle=angle,
                        aspect_ratio=job["aspect_ratio"],
                    )
                    product_images.append(result)
                except Exception as e:
                    logger.warning("Styled %s failed for %s: %s", angle["key"], name, e)
                    product_images.append({
                        "style": angle["key"],
                        "label": angle["label"],
                        "image_url": f"Error: {e}",
                    })

            success_count = sum(1 for img in product_images if img.get("image_url") and not img["image_url"].startswith("Error"))
            job["results"].append({
                "product_index": prod_idx,
                "perfume_name": name,
                "status": "success" if success_count > 0 else "error",
                "images": product_images,
                "count": success_count,
            })
            job["completed_count"] = loop_idx + 1

        job["status"] = "completed"
        job["progress"] = 100
        job["message"] = f"Complete: {total} products processed"
        logger.info("Inspiration job %s completed", job_id)

    # ─── Job Controls ─────────────────────────────────────────────

    @staticmethod
    def pause(job_id: str) -> bool:
        job = _jobs.get(job_id)
        if not job or job["status"] in ("completed", "cancelled"):
            return False
        job["paused"] = True
        return True

    @staticmethod
    def resume(job_id: str) -> bool:
        job = _jobs.get(job_id)
        if not job or job["status"] in ("completed", "cancelled"):
            return False
        job["paused"] = False
        return True

    @staticmethod
    def cancel(job_id: str) -> bool:
        job = _jobs.get(job_id)
        if not job or job["status"] == "completed":
            return False
        job["cancel"] = True
        job["paused"] = False
        return True
