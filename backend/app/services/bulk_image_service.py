"""Bulk Product Image Generator Service.

CSV-driven pipeline for generating product images at scale.
8 shots per product, chained generation with reference-based replace model.

Prompting strategy: "Replace model" — short, direct, conversational.
  "Using these reference images: clone the bottle, change only X, keep everything else."
  This works better than verbose structured prompts for Gemini image generation.

Kept as backup: PROMPT_STYLE = "detailed" for the old structured format.

Pipeline:
  Shot 1: Bottle + Box combo hero
  Shots 2-5: 4 styled angle shots (Pinterest + bottle ref + Shot 1)
  Shots 6-8: 3 creative shots (Pinterest + bottle + previous outputs)
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

# Active prompt style: "replace" (new, reference-based) or "detailed" (old, structured)
PROMPT_STYLE = "replace"


# ─── Bottle Identity Block (shared across all prompts) ────────

def _bottle_identity(product_name: str, liquid: str, brand: str) -> str:
    """Short but precise description of WHAT the Fumera bottle looks like.
    Used in every prompt so the model knows exactly what to preserve."""
    return (
        f"The {brand} bottle has these EXACT features that MUST be preserved:\n"
        f"- BOTTLE SHAPE: Clear glass, dome-top rounded shoulders, elegant curved silhouette, thick solid glass base (clear plinth visible below liquid), dip-tube visible through center.\n"
        f"- CAP: Tall cylindrical (~1.5 inches). MATTE BLACK body with visible vertical ribbed/grooved texture. POLISHED GOLD METAL RING at the TOP edge. POLISHED GOLD METAL RING at the BOTTOM edge (where cap meets bottle neck). Two gold bands framing the black ribbed body.\n"
        f"- LABEL ZONE 1 — ON THE BLACK BAND (horizontal dark band at upper-middle of bottle): The product name '{product_name}' in WHITE SERIF ITALIC text, centered on the band.\n"
        f"- LABEL ZONE 2 — BELOW THE BLACK BAND (on clear glass, over the liquid): '{brand}' in LARGE WHITE ELEGANT SERIF font with accent 'é'. This is the PRIMARY BRAND LOGO — do NOT remove or change it. Directly below: 'ESSENCE' in smaller WHITE ALL-CAPS letter-spaced text.\n"
        f"- ALL text on the bottle is WHITE.\n"
        f"- LIQUID COLOR: {liquid}, filled to approximately 80%.\n"
        f"- DO NOT remove the '{brand}' logo. DO NOT remove 'ESSENCE'. DO NOT reverse the label positions.\n"
    )


# ─── 8 Shot Definitions ──────────────────────────────────────────

SHOT_CONFIGS = [
    {"key": "bottle_box_hero", "label": "Bottle + Box Hero", "phase": 1},
    {"key": "pinterest_front", "label": "Styled Front", "phase": 2},
    {"key": "pinterest_three_quarter", "label": "Styled 3/4 View", "phase": 2},
    {"key": "pinterest_low_angle", "label": "Styled Low Angle", "phase": 2},
    {"key": "pinterest_detail", "label": "Styled Close-up", "phase": 2},
    {"key": "lifestyle_editorial", "label": "Lifestyle Editorial", "phase": 3},
    {"key": "smoke_mood", "label": "Smoke & Mood", "phase": 3},
    {"key": "reflection_luxury", "label": "Mirror Reflection", "phase": 3},
]

TOTAL_SHOTS = len(SHOT_CONFIGS)


def _build_replace_prompt(
    shot_key: str,
    product_name: str,
    liquid: str,
    brand: str,
    has_pinterest: bool,
    has_box: bool,
    has_generated: bool,
) -> str:
    """SHORT prompt (~400-600 chars). Let the reference images do the heavy lifting."""

    if shot_key == "bottle_box_hero":
        return (
            f"Using these reference images: "
            f"Place a {brand} perfume bottle (same exact shape, glass, and cap as the bottle reference image) "
            f"and the {brand} packaging box (same exact design as the box reference image) side by side. "
            f"The perfume liquid should be {liquid}. "
            f"On the bottle's black label band, replace the product name with '{product_name}' in white serif text. "
            f"Keep '{brand}' logo and 'ESSENCE' text exactly as shown on the bottle reference, all text white. "
            f"Clone the box exactly — same gradient, typography, proportions. "
            f"Bottle slightly in front, box beside it, clean white surface. "
            f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
        )

    elif shot_key == "pinterest_front":
        return (
            f"Using these reference images: "
            f"Take the background setting, surface, props, and lighting from the Pinterest/style reference image. "
            f"Remove the existing bottle. "
            f"Place a {brand} perfume bottle (same exact shape, glass, and cap as the bottle reference image) in its place. "
            f"The perfume liquid should be {liquid}. "
            f"On the bottle's black label band, replace the product name with '{product_name}' using white serif typography. "
            f"Keep '{brand}' logo and 'ESSENCE' text exactly as shown on the bottle reference, all text white. "
            f"Camera: straight-on front view, label fully visible and readable. "
            f"Maintain the same lighting, mood, and composition from the Pinterest reference. "
            f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
        )

    elif shot_key == "pinterest_three_quarter":
        return (
            f"Using these reference images: "
            f"Take the background setting, surface, props, and lighting from the Pinterest/style reference image. "
            f"Remove the existing bottle. "
            f"Place a {brand} perfume bottle (same exact shape as the bottle reference image) "
            f"rotated ~45° to show its 3D form and glass depth. "
            f"The perfume liquid should be {liquid}. "
            f"On the bottle's black label band, replace the product name with '{product_name}' in white text. "
            f"Keep '{brand}' logo and 'ESSENCE' text exactly as shown on the bottle reference, all text white. "
            f"Rim light from the side creates a highlight on the glass edge. "
            f"Maintain the same mood and atmosphere from the Pinterest reference. "
            f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
        )

    elif shot_key == "pinterest_low_angle":
        return (
            f"Using these reference images: "
            f"Take the lighting mood and atmosphere from the Pinterest/style reference image. "
            f"Place a {brand} perfume bottle (same exact shape, glass, and cap as the bottle reference image) "
            f"and photograph it from a LOW ANGLE — camera below the bottle looking up at ~30°. "
            f"The bottle appears powerful and towering. "
            f"The perfume liquid should be {liquid}. "
            f"Strong backlight makes the liquid glow through the glass. "
            f"On the bottle's black label band, replace the product name with '{product_name}' in white text. "
            f"Keep '{brand}' logo and 'ESSENCE' text exactly as shown, all text white. "
            f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
        )

    elif shot_key == "pinterest_detail":
        return (
            f"Using these reference images: "
            f"Create an extreme close-up/macro shot of the {brand} perfume bottle from the bottle reference image. "
            f"The perfume liquid should be {liquid}. "
            f"Tight crop on the cap and label area — cap fills the top, black label band in the middle. "
            f"On the black label band, the product name '{product_name}' and '{brand}' logo must be tack-sharp "
            f"and clearly readable — all in white text. "
            f"Keep the exact same bottle shape, cap (gold ring at top + gold ring at bottom + black ribbed body), "
            f"and label band design from the bottle reference. "
            f"Shallow depth of field — label sharp, edges soft. Bottle fills 90%+ of frame. "
            f"Professional luxury perfume macro photography. 1:1 aspect ratio."
        )

    elif shot_key == "lifestyle_editorial":
        return (
            f"Using these reference images: "
            f"Place a {brand} perfume bottle (same exact shape, glass, and cap as the bottle reference image) "
            f"on a premium marble vanity with luxury props — leather journal, watch, silk pocket square, single flower. "
            f"The perfume liquid should be {liquid}. "
            f"On the bottle's black label band, replace the product name with '{product_name}' in white text. "
            f"Keep '{brand}' logo and 'ESSENCE' text exactly as shown, all text white. "
            f"The bottle is the hero — props support but don't compete. "
            f"Warm moody golden lighting, Rembrandt-style side light. Shallow depth of field. "
            f"No human model. "
            f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
        )

    elif shot_key == "smoke_mood":
        return (
            f"Using these reference images: "
            f"Place a {brand} perfume bottle (same exact shape, glass, and cap as the bottle reference image) "
            f"emerging from soft ethereal smoke/mist at its base. "
            f"The perfume liquid should be {liquid}. "
            f"Background: very dark, near-black. Smoke wisps around the base, backlit. "
            f"The smoke does NOT obscure the label or logo. "
            f"Strong backlight makes the liquid glow through the glass dramatically. "
            f"On the bottle's black label band, replace the product name with '{product_name}' in white text. "
            f"Keep '{brand}' logo and 'ESSENCE' text exactly as shown, all text white. "
            f"Mood: mysterious, intoxicating. "
            f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
        )

    elif shot_key == "reflection_luxury":
        return (
            f"Using these reference images: "
            f"Place a {brand} perfume bottle (same exact shape, glass, and cap as the bottle reference image) "
            f"on a polished black mirror/glass surface that creates a perfect reflection beneath it. "
            f"The perfume liquid should be {liquid}. "
            f"Camera: slightly low angle. Background: deep black gradient. "
            f"Dramatic key light from front-left, rim light from behind creating a luminous edge. "
            f"The liquid glows through the glass from the backlight. "
            f"On the bottle's black label band, replace the product name with '{product_name}' in white text. "
            f"Keep '{brand}' logo and 'ESSENCE' text exactly as shown, all text white. "
            f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
        )

    else:
        return (
            f"Using these reference images: clone the {brand} bottle exactly. "
            f"Change only the product name to '{product_name}' and liquid color to {liquid}. "
            f"Keep everything else identical. 1:1 square. Ultra-photorealistic.\n\n"
            f"{identity}"
        )


# ─── Old detailed prompt style (kept as backup) ──────────────────

def _build_detailed_prompt(
    shot_key: str,
    product_name: str,
    liquid: str,
    brand: str,
    has_pinterest: bool,
    has_box: bool,
    has_generated: bool,
) -> str:
    """Old structured prompt format with ASCII box specs. Kept as PROMPT_STYLE='detailed' fallback."""

    identity_block = f"""
=== {brand.upper()} BOTTLE SPECIFICATIONS [MATCH REFERENCE EXACTLY] ===

┌─────────────────────────────────────────────────────────────┐
│ BOTTLE: Clear glass, dome-top, curved, thick glass base     │
│ CAP: Matte black ribbed + gold ring TOP + gold ring BOTTOM  │
│ LABEL BAND: '{product_name}' in WHITE SERIF ITALIC           │
│ BELOW BAND: '{brand}' (LARGE WHITE SERIF) + 'ESSENCE'      │
│ ALL TEXT: WHITE. LIQUID: {liquid} at 80%                     │
│ ❌ DO NOT remove logo. DO NOT reverse positions.             │
└─────────────────────────────────────────────────────────────┘
"""

    shot_descriptions = {
        "bottle_box_hero": f"Bottle + Box hero on white surface. Clone both from references. Change only product name and liquid. {identity_block}",
        "pinterest_front": f"Styled front view. Match Pinterest mood/lighting. Label fully visible. {identity_block}",
        "pinterest_three_quarter": f"Styled 3/4 angle. Match Pinterest mood. Glass refraction visible. {identity_block}",
        "pinterest_low_angle": f"Low angle hero. Match Pinterest mood. Liquid glows from backlight. {identity_block}",
        "pinterest_detail": f"Macro close-up on cap and label. f/2.8 bokeh. Match Pinterest color grading. {identity_block}",
        "lifestyle_editorial": f"Luxury vanity still-life. No human. Marble surface, luxury props. Warm moody light. {identity_block}",
        "smoke_mood": f"Atmospheric smoke/mist. Dark background. Backlit liquid glow. Mysterious mood. {identity_block}",
        "reflection_luxury": f"Black mirror surface reflection. Dramatic lighting. Ultra-luxury. {identity_block}",
    }

    return shot_descriptions.get(shot_key, identity_block)


class BulkImageService:
    """Generates product images in bulk from CSV data + reference images."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client = genai.Client(api_key=self._api_key)

    # ─── Content Assembly ─────────────────────────────────────────

    def _build_content_parts(
        self,
        prompt: str,
        bottle_parts: list[types.Part],
        box_parts: list[types.Part],
        pinterest_parts: list[types.Part],
        generated_parts: list[types.Part],
    ) -> list[types.Part]:
        """Assemble: text prompt FIRST, then images in order.

        This follows the working image_generator_service pattern:
        text instruction first → model reads the task → then interprets images.
        """
        all_parts: list[types.Part] = []

        # Text FIRST (working pattern from image_generator_service)
        all_parts.append(types.Part.from_text(text=prompt))

        # Then images in order: bottle → box → pinterest → generated
        all_parts.extend(bottle_parts)
        all_parts.extend(box_parts)
        all_parts.extend(pinterest_parts)
        all_parts.extend(generated_parts)

        return all_parts

    # ─── Per-Row Generation (chained) ─────────────────────────────

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
        """Generate 8 chained shots for one product."""
        liquid = liquid_color or "as shown in the bottle reference"
        brand = brand_name or "Fumera"
        safe_name = self._safe_name(product_name)
        has_pinterest = len(pinterest_ref_parts) > 0
        has_box = len(box_ref_parts) > 0

        generated_parts: list[types.Part] = []

        for shot_idx, shot in enumerate(SHOT_CONFIGS):
            yield {
                "event": "generating",
                "product_name": product_name,
                "angle": shot["key"],
                "label": shot["label"],
                "message": f"Generating {shot['label']} for {product_name}...",
                "index": shot_idx,
                "total": TOTAL_SHOTS,
            }

            has_generated = len(generated_parts) > 0

            # Build prompt based on active style
            if PROMPT_STYLE == "replace":
                prompt = _build_replace_prompt(
                    shot["key"], product_name, liquid, brand,
                    has_pinterest, has_box, has_generated,
                )
            else:
                prompt = _build_detailed_prompt(
                    shot["key"], product_name, liquid, brand,
                    has_pinterest, has_box, has_generated,
                )

            # Select chain refs based on phase
            chain_parts: list[types.Part] = []
            if shot["phase"] == 2:
                chain_parts = generated_parts[:1]  # Phase 1 output
            elif shot["phase"] == 3:
                chain_parts = generated_parts[:3]  # Phase 1 + first 2 angles

            parts = self._build_content_parts(
                prompt=prompt,
                bottle_parts=bottle_ref_parts,
                box_parts=box_ref_parts if shot["key"] == "bottle_box_hero" or shot["phase"] >= 2 else [],
                pinterest_parts=pinterest_ref_parts,
                generated_parts=chain_parts,
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

            # Chain: load generated image as ref for next shots
            if image_url:
                gen_ref = await self._load_images([image_url])
                if gen_ref:
                    generated_parts.extend(gen_ref)

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
            "Bulk gen [%s style]: %d bottle refs, %d box refs, %d products, %d with Pinterest",
            PROMPT_STYLE, len(bottle_ref_parts), len(box_ref_parts), total_rows, len(pinterest_map),
        )

        yield {
            "event": "started",
            "total_rows": total_rows,
            "total_images": total_rows * TOTAL_SHOTS,
            "message": f"Starting: {total_rows} products x {TOTAL_SHOTS} shots = {total_rows * TOTAL_SHOTS} images",
        }

        for row_idx, row in enumerate(rows):
            product_name = row.get("PRODUCT_NAME", row.get("product_name", f"Product {row_idx + 1}"))
            liquid_color = row.get("LIQUID_COLOR", row.get("liquid_color", ""))
            box_color = row.get("BOX_COLOR", row.get("box_color", ""))

            pinterest_urls = pinterest_map.get(str(row_idx), [])
            pinterest_parts = await self._load_images(pinterest_urls) if pinterest_urls else []

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
                    logger.info("Bulk gen [%s]: %s succeeded", prefix, model_name)
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
