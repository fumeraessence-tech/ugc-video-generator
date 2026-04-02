"""Bulk Product Image Generator Service.

CSV-driven pipeline — 8 shots per product, each fully independent.

Content assembly follows the proven image_generator_service.py pattern:
  prompt text FIRST → scene image (Pinterest) → bottle image
  "first image" in prompt = scene, "second image" = bottle to clone.

Shot 1:     Bottle + Box hero (bottle + box refs)
Shots 2-5:  Pinterest scene replacement (one Pinterest per shot + bottle)
Shots 6-8:  Creative shots (bottle ref only, prompt creates the scene)

No chaining. No generated_parts. Max 2 images per call.
"""

import asyncio
import io
import logging
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_FRONTEND_DIR = _BACKEND_DIR.parent / "frontend"
_UPLOADS_DIR = _FRONTEND_DIR / "public" / "uploads" / "bulk-generator"

MAX_REF_IMAGE_BYTES = 500_000

MODELS_TO_TRY = [
    "gemini-2.0-flash-exp-image-generation",
    "gemini-2.5-flash-image",
    "gemini-3-pro-image-preview",
]

# ─── 8 Shot Definitions ──────────────────────────────────────────

SHOT_CONFIGS = [
    {"key": "bottle_box_hero",     "label": "Bottle + Box Hero",   "needs_pinterest": False, "needs_box": True},
    {"key": "scene_front",         "label": "Scene Front View",    "needs_pinterest": True,  "needs_box": False},
    {"key": "scene_three_quarter", "label": "Scene 3/4 Angle",     "needs_pinterest": True,  "needs_box": False},
    {"key": "scene_low_angle",     "label": "Scene Low Angle",     "needs_pinterest": True,  "needs_box": False},
    {"key": "scene_detail",        "label": "Scene Close-Up",      "needs_pinterest": True,  "needs_box": False},
    {"key": "creative_smoke",      "label": "Smoke & Mist",        "needs_pinterest": False, "needs_box": False},
    {"key": "creative_reflection", "label": "Mirror Reflection",   "needs_pinterest": False, "needs_box": False},
    {"key": "creative_lifestyle",  "label": "Lifestyle Editorial",  "needs_pinterest": False, "needs_box": False},
]

TOTAL_SHOTS = len(SHOT_CONFIGS)


# ─── Prompt Builder ───────────────────────────────────────────────

def _build_prompt(shot_key: str, product_name: str, liquid: str, brand: str) -> str:
    """Short, imperative prompts (~300-400 chars). Each is compositionally unique."""

    if shot_key == "bottle_box_hero":
        # Images: bottle(1st) + box(2nd). No scene.
        return (
            f"Place the perfume bottle from the first image and the packaging box from the second image "
            f"side by side on a clean white surface. Bottle slightly in front. "
            f"The liquid is {liquid}. "
            f"On the bottle's black label band, the product name is '{product_name}' in white serif italic text. "
            f"Keep the '{brand}' logo and 'ESSENCE' text below the band exactly as shown, all white. "
            f"Clone the box design exactly from the second image — same gradient, typography, proportions. "
            f"Studio lighting, soft shadow. 1:1 square."
        )

    elif shot_key == "scene_front":
        # Images: pinterest(1st) + bottle(2nd)
        return (
            f"Remove the bottle from the first image. "
            f"Place the perfume bottle from the second image in its place, straight-on front view, label fully visible. "
            f"Keep the exact background, surface, props, and lighting from the first image. "
            f"The liquid is {liquid}. "
            f"On the black label band, the product name is '{product_name}' in white serif text. "
            f"Keep '{brand}' logo and 'ESSENCE' exactly as the second image, all white. "
            f"1:1 square."
        )

    elif shot_key == "scene_three_quarter":
        # Images: pinterest(1st) + bottle(2nd)
        return (
            f"Remove the bottle from the first image. "
            f"Place the perfume bottle from the second image rotated 45 degrees to show its 3D glass depth and curved silhouette. "
            f"Keep the background, surface, and lighting from the first image. "
            f"The liquid is {liquid}. "
            f"On the black label band: '{product_name}' in white text. "
            f"'{brand}' logo and 'ESSENCE' stay as the second image, all white. "
            f"Light refracts through the glass edge. 1:1 square."
        )

    elif shot_key == "scene_low_angle":
        # Images: pinterest(1st) + bottle(2nd)
        return (
            f"Remove the bottle from the first image. "
            f"Photograph the perfume bottle from the second image from below, camera at 30 degrees looking up. "
            f"The bottle appears tall and powerful. "
            f"Strong backlight makes the {liquid} liquid glow through the glass. "
            f"Use the mood and color palette from the first image. "
            f"On the black label band: '{product_name}' in white text. "
            f"'{brand}' logo and 'ESSENCE' as the second image, all white. 1:1 square."
        )

    elif shot_key == "scene_detail":
        # Images: pinterest(1st) + bottle(2nd)
        return (
            f"Extreme close-up of the perfume bottle from the second image. "
            f"Tight crop: cap and label fill 85% of the frame. "
            f"Use the lighting and color grading from the first image. "
            f"Shallow depth of field, f/2.8. "
            f"The label is tack-sharp: '{product_name}' on the black band, '{brand}' logo below, 'ESSENCE' underneath, all in white. "
            f"The {liquid} liquid visible through glass. 1:1 square."
        )

    elif shot_key == "creative_smoke":
        # Images: bottle(1st) only. No scene.
        return (
            f"Place the perfume bottle from the first image on a dark surface with soft ethereal smoke rising from the base. "
            f"Near-black background. Strong backlight makes the {liquid} liquid glow through the glass. "
            f"Smoke wisps around the base but does NOT obscure the label. "
            f"On the black band: '{product_name}' in white text. '{brand}' logo and 'ESSENCE' exactly as shown, all white. "
            f"Mysterious, moody. 1:1 square."
        )

    elif shot_key == "creative_reflection":
        # Images: bottle(1st) only. No scene.
        return (
            f"Place the perfume bottle from the first image on a polished black mirror surface that creates a perfect reflection beneath it. "
            f"Deep black gradient background. Dramatic key light from front-left, rim light from behind. "
            f"The {liquid} liquid glows through the glass. "
            f"On the black band: '{product_name}' in white text. '{brand}' logo and 'ESSENCE' as shown, all white. "
            f"Slightly low camera angle. 1:1 square."
        )

    elif shot_key == "creative_lifestyle":
        # Images: bottle(1st) only. No scene.
        return (
            f"Place the perfume bottle from the first image on a marble vanity with luxury props: "
            f"leather journal, wristwatch, silk pocket square. "
            f"Warm golden lighting from the side. The bottle is the hero, props support but do not compete. "
            f"The {liquid} liquid is visible through the glass. "
            f"On the black band: '{product_name}' in white text. '{brand}' logo and 'ESSENCE' as shown, all white. "
            f"No human model. 1:1 square."
        )

    else:
        return (
            f"Clone the perfume bottle from the first image. Change the product name to '{product_name}'. "
            f"Liquid color: {liquid}. All label text white. Keep '{brand}' logo. 1:1 square."
        )


class BulkImageService:
    """Generates product images in bulk from CSV data + reference images."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client = genai.Client(api_key=self._api_key)

    # ─── Content Assembly (proven pattern) ────────────────────────

    @staticmethod
    def _build_content_parts(
        prompt: str,
        scene_parts: list[types.Part],
        bottle_parts: list[types.Part],
        box_parts: list[types.Part],
    ) -> list[types.Part]:
        """Assemble: prompt FIRST → scene → bottle → box.

        Matches the working image_generator_service.py pattern:
        text instruction first, then images in order.
        "first image" = scene (or bottle if no scene), "second image" = bottle (or box).
        """
        all_parts: list[types.Part] = []
        all_parts.append(types.Part.from_text(text=prompt))
        if scene_parts:
            all_parts.extend(scene_parts)
        all_parts.extend(bottle_parts)
        all_parts.extend(box_parts)
        return all_parts

    # ─── Per-Row Generation (independent shots) ───────────────────

    async def generate_for_row(
        self,
        product_name: str,
        liquid_color: str,
        brand_name: str,
        bottle_ref_parts: list[types.Part],
        box_ref_parts: list[types.Part],
        pinterest_ref_parts: list[types.Part],
        box_color: str = "",
    ) -> AsyncGenerator[dict, None]:
        """Generate 8 independent shots for one product. No chaining."""
        liquid = liquid_color or "as shown in the bottle reference"
        brand = brand_name or "Fumera"
        safe_name = self._safe_name(product_name)
        has_pinterest = len(pinterest_ref_parts) > 0

        for shot_idx, shot in enumerate(SHOT_CONFIGS):
            # Skip Pinterest shots if no Pinterest refs provided
            if shot["needs_pinterest"] and not has_pinterest:
                yield {
                    "event": "skipped",
                    "product_name": product_name,
                    "angle": shot["key"],
                    "label": shot["label"],
                    "message": f"Skipped {shot['label']} — no Pinterest reference provided",
                    "index": shot_idx,
                    "total": TOTAL_SHOTS,
                }
                continue

            yield {
                "event": "generating",
                "product_name": product_name,
                "angle": shot["key"],
                "label": shot["label"],
                "message": f"Generating {shot['label']} for {product_name}...",
                "index": shot_idx,
                "total": TOTAL_SHOTS,
            }

            prompt = _build_prompt(shot["key"], product_name, liquid, brand)

            # Select scene image: one Pinterest per shot (rotate through available)
            scene_parts: list[types.Part] = []
            if shot["needs_pinterest"] and pinterest_ref_parts:
                # Shots 2-5 (indices 1-4) → use different Pinterest images if available
                pinterest_idx = shot_idx - 1  # shot 1=scene_front → pinterest[0], etc.
                pi = min(pinterest_idx, len(pinterest_ref_parts) - 1)
                scene_parts = [pinterest_ref_parts[pi]]

            box_parts = box_ref_parts if shot["needs_box"] else []

            parts = self._build_content_parts(
                prompt=prompt,
                scene_parts=scene_parts,
                bottle_parts=bottle_ref_parts,
                box_parts=box_parts,
            )

            logger.info(
                "Shot %s [%s]: %d scene + %d bottle + %d box = %d total parts, prompt=%d chars",
                shot["key"], product_name,
                len(scene_parts), len(bottle_ref_parts), len(box_parts),
                len(parts), len(prompt),
            )

            try:
                image_url = await self._generate_image(parts, f"{shot['key']}-{safe_name}")
            except Exception as e:
                logger.exception("Shot %s failed for %s", shot["key"], product_name)
                yield {
                    "event": "error",
                    "product_name": product_name,
                    "angle": shot["key"],
                    "label": shot["label"],
                    "message": str(e),
                    "index": shot_idx,
                    "total": TOTAL_SHOTS,
                }
                continue

            yield {
                "event": "image",
                "product_name": product_name,
                "angle": shot["key"],
                "label": shot["label"],
                "image_url": image_url or "",
                "index": shot_idx,
                "total": TOTAL_SHOTS,
            }

    # ─── Bulk Streaming ───────────────────────────────────────────

    async def generate_bulk_streaming(
        self,
        rows: list[dict],
        reference_image_urls: list[str],
        brand_name: str,
        box_reference_urls: list[str] | None = None,
        per_product_pinterest: dict[str, list[str]] | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Process all CSV rows with per-product Pinterest refs."""
        total_rows = len(rows)
        pinterest_map = per_product_pinterest or {}

        bottle_ref_parts = await self._load_images(reference_image_urls)
        if not bottle_ref_parts:
            yield {"event": "error", "message": "No bottle reference images could be loaded"}
            return

        box_ref_parts = await self._load_images(box_reference_urls or [])

        logger.info(
            "Bulk gen: %d bottle refs, %d box refs, %d products, %d with Pinterest",
            len(bottle_ref_parts), len(box_ref_parts), total_rows, len(pinterest_map),
        )

        yield {
            "event": "started",
            "total_rows": total_rows,
            "total_images": total_rows * TOTAL_SHOTS,
            "message": f"Starting: {total_rows} products x {TOTAL_SHOTS} shots",
        }

        for row_idx, row in enumerate(rows):
            product_name = row.get("PRODUCT_NAME", row.get("product_name", f"Product {row_idx + 1}"))
            liquid_color = row.get("LIQUID_COLOR", row.get("liquid_color", ""))
            box_color = row.get("BOX_COLOR", row.get("box_color", ""))

            pinterest_urls = pinterest_map.get(str(row_idx), [])
            pinterest_parts = await self._load_images(pinterest_urls) if pinterest_urls else []

            logger.info(
                "Row %d [%s]: %d Pinterest images loaded from %d URLs",
                row_idx, product_name, len(pinterest_parts), len(pinterest_urls),
            )

            yield {
                "event": "row_start",
                "row_index": row_idx,
                "total_rows": total_rows,
                "product_name": product_name,
                "pinterest_count": len(pinterest_parts),
                "message": f"Processing {product_name} ({row_idx + 1}/{total_rows})",
            }

            async for event in self.generate_for_row(
                product_name=product_name,
                liquid_color=liquid_color,
                brand_name=brand_name,
                bottle_ref_parts=bottle_ref_parts,
                box_ref_parts=box_ref_parts,
                pinterest_ref_parts=pinterest_parts,
                box_color=box_color,
            ):
                event["row_index"] = row_idx
                event["total_rows"] = total_rows
                yield event

            yield {
                "event": "row_complete",
                "row_index": row_idx,
                "total_rows": total_rows,
                "product_name": product_name,
            }

        yield {"event": "complete", "message": f"All {total_rows} products generated"}

    # ─── Image Generation ─────────────────────────────────────────

    async def _generate_image(self, parts: list[types.Part], prefix: str) -> str:
        for model_name in MODELS_TO_TRY:
            try:
                logger.info("Bulk gen [%s]: trying %s (%d parts)", prefix, model_name, len(parts))
                config = types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                    image_config=types.ImageConfig(aspect_ratio="1:1"),
                )
                response = await asyncio.to_thread(
                    self._client.models.generate_content,
                    model=model_name,
                    contents=[types.Content(role="user", parts=parts)],
                    config=config,
                )
                image_url = self._extract_and_save(response, prefix)
                if image_url:
                    return image_url
            except Exception as e:
                logger.warning("Bulk gen [%s]: %s failed: %s", prefix, model_name, e)
                continue
        return ""

    # ─── Image Loading ────────────────────────────────────────────

    async def _load_images(self, urls: list[str]) -> list[types.Part]:
        parts: list[types.Part] = []
        for url in urls:
            img_data = await self._load_single_image(url)
            if img_data:
                parts.append(types.Part.from_bytes(data=img_data["bytes"], mime_type=img_data["mime_type"]))
        return parts

    async def _load_single_image(self, url_path: str) -> dict | None:
        image_bytes: bytes | None = None
        mime_type: str = "image/jpeg"
        try:
            if url_path.startswith("/uploads/"):
                file_path = _FRONTEND_DIR / "public" / url_path.lstrip("/")
                if file_path.exists():
                    image_bytes = file_path.read_bytes()
                    ext = file_path.suffix.lower()
                    mime_type = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}.get(ext, "image/jpeg")
                else:
                    logger.warning("Image not found: %s", file_path)
                    return None
            elif url_path.startswith("http"):
                import httpx
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.get(url_path)
                    resp.raise_for_status()
                    mime_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                    image_bytes = resp.content
            else:
                file_path = Path(url_path)
                if file_path.exists():
                    image_bytes = file_path.read_bytes()
                else:
                    return None
            if image_bytes is None:
                return None
            image_bytes, mime_type = self._compress_image(image_bytes, mime_type)
            return {"bytes": image_bytes, "mime_type": mime_type}
        except Exception as e:
            logger.warning("Failed to load %s: %s", url_path, e)
            return None

    @staticmethod
    def _compress_image(image_bytes: bytes, mime_type: str, max_bytes: int = MAX_REF_IMAGE_BYTES) -> tuple[bytes, str]:
        if len(image_bytes) <= max_bytes:
            return image_bytes, mime_type
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(image_bytes))
            if max(img.size) > 2048:
                img.thumbnail((2048, 2048), Image.LANCZOS)
            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")
            for q in (85, 75, 60, 45, 30):
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=q, optimize=True)
                if buf.tell() <= max_bytes:
                    return buf.getvalue(), "image/jpeg"
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=30, optimize=True)
            return buf.getvalue(), "image/jpeg"
        except Exception as e:
            logger.warning("Compression failed: %s", e)
            return image_bytes, mime_type

    def _extract_and_save(self, response: types.GenerateContentResponse, prefix: str) -> str:
        if not response.candidates:
            return ""
        candidate = response.candidates[0]
        if not candidate.content or not candidate.content.parts:
            return ""
        for part in candidate.content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                image_bytes = part.inline_data.data
                if image_bytes:
                    return self._save_image(image_bytes, prefix)
        return ""

    def _save_image(self, image_bytes: bytes, prefix: str) -> str:
        _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{prefix}-{uuid.uuid4().hex[:8]}.png"
        filepath = _UPLOADS_DIR / filename
        with open(filepath, "wb") as f:
            f.write(image_bytes)
        url = f"/uploads/bulk-generator/{filename}"
        logger.info("Saved: %s (%d bytes)", url, len(image_bytes))
        return url

    @staticmethod
    def _safe_name(name: str) -> str:
        return "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:30].lower()
