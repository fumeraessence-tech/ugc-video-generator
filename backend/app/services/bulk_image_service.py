"""Bulk Product Image Generator Service.

CSV-driven pipeline for generating product images at scale.
8 shots per product, chained generation:

  Shot 1: Bottle + Box combo hero
  Shots 2-5: 4 angle shots (Pinterest + bottle ref + Shot 1 as ref)
  Shots 6-8: 3 creative/lifestyle shots (using angles as additional refs)

ALL reference images (bottle + box + Pinterest + previously generated)
are injected into EVERY generation call.
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
    # Shot 1: Bottle + Box combo
    {
        "key": "bottle_box_hero",
        "label": "Bottle + Box Hero",
        "phase": 1,
        "scene": (
            "=== SHOT: BOTTLE + BOX HERO COMBO ===\n\n"
            "Create a luxury product hero shot with BOTH the perfume bottle AND its packaging box.\n"
            "The bottle stands in front or slightly to the side of the box.\n"
            "Box is at a 3/4 angle showing front face + side, bottle slightly overlapping.\n"
            "Both items sit on a clean white/neutral surface.\n"
            "Camera: Eye level, slightly off-center for dynamic composition.\n"
            "Lighting: Soft studio key light from front-left 45°, balanced fill.\n"
            "The box gradient color should complement the bottle's liquid color.\n"
            "Framing: Both items fill 85% of frame. Bottle is the hero, box supports.\n"
            "Professional luxury perfume commercial photography. 1:1 square."
        ),
    },
    # Shots 2-5: 4 angle shots styled with Pinterest references
    {
        "key": "pinterest_front",
        "label": "Styled Front",
        "phase": 2,
        "scene": (
            "=== SHOT: STYLED FRONT — PINTEREST INSPIRED ===\n\n"
            "Using the Pinterest/inspiration reference images as STYLE GUIDE:\n"
            "Match the MOOD, LIGHTING, COLOR PALETTE, and SURFACE/BACKGROUND from the Pinterest images.\n"
            "Camera: Straight-on front view, eye level with label center.\n"
            "The bottle stands upright, label fully visible and readable.\n"
            "STYLE from Pinterest: replicate the atmosphere, surface texture, props, and lighting direction.\n"
            "The bottle itself is cloned from the bottle reference — only the environment changes.\n"
            "Framing: Bottle fills 80-85% of frame height.\n"
            "Lens: 85mm, f/4 for slight background softness.\n"
            "1:1 square format."
        ),
    },
    {
        "key": "pinterest_three_quarter",
        "label": "Styled 3/4 View",
        "phase": 2,
        "scene": (
            "=== SHOT: STYLED 3/4 VIEW — PINTEREST INSPIRED ===\n\n"
            "Using the Pinterest/inspiration reference images as STYLE GUIDE:\n"
            "Match the MOOD, LIGHTING, COLOR PALETTE, and SURFACE/BACKGROUND from the Pinterest images.\n"
            "Camera: Eye level, bottle rotated ~45° showing form and depth.\n"
            "Label partially visible, glass edge catching rim light.\n"
            "STYLE from Pinterest: replicate the atmosphere, surface texture, props arrangement.\n"
            "The bottle is cloned from the bottle reference — only environment/styling changes.\n"
            "Framing: Bottle fills 80% of frame.\n"
            "Lens: 85mm, f/4. 1:1 square."
        ),
    },
    {
        "key": "pinterest_low_angle",
        "label": "Styled Low Angle",
        "phase": 2,
        "scene": (
            "=== SHOT: STYLED LOW ANGLE — PINTEREST INSPIRED ===\n\n"
            "Using the Pinterest/inspiration reference images as STYLE GUIDE:\n"
            "Match the MOOD, LIGHTING, COLOR PALETTE from the Pinterest images.\n"
            "Camera: 25-30° below the bottle, looking up — powerful, dominant.\n"
            "The bottle towers over the viewer. Backlight creates liquid glow.\n"
            "STYLE from Pinterest: replicate the dramatic atmosphere and moody lighting.\n"
            "Gold cap rings catch overhead light brilliantly.\n"
            "Framing: Bottle fills 90% of frame.\n"
            "Lens: 85mm, f/4. 1:1 square."
        ),
    },
    {
        "key": "pinterest_detail",
        "label": "Styled Close-up",
        "phase": 2,
        "scene": (
            "=== SHOT: STYLED CLOSE-UP — PINTEREST INSPIRED ===\n\n"
            "Using the Pinterest/inspiration reference images as STYLE GUIDE:\n"
            "Match the MOOD, COLOR GRADING, and SURFACE from the Pinterest images.\n"
            "Camera: Extreme close-up on cap + label area. Macro-style.\n"
            "Focus: product name on black band = tack-sharp. Background = creamy bokeh.\n"
            "Gold cap detail: every rib/groove visible with micro-shadows.\n"
            "STYLE from Pinterest: the overall color palette and lighting mood.\n"
            "Depth of field: ultra-shallow f/2.8.\n"
            "Framing: Cap and label band fill 90% of frame.\n"
            "Lens: 100mm macro. 1:1 square."
        ),
    },
    # Shots 6-8: Creative/lifestyle shots
    {
        "key": "lifestyle_editorial",
        "label": "Lifestyle Editorial",
        "phase": 3,
        "scene": (
            "=== SHOT: LIFESTYLE EDITORIAL ===\n\n"
            "Luxury lifestyle context shot — NO human model.\n"
            "Setting: Premium marble vanity or dark wooden surface.\n"
            "Props (3-4 max): leather journal, luxury watch, silk pocket square, single flower.\n"
            "Using the Pinterest/inspiration references for STYLE and ATMOSPHERE.\n"
            "Camera: Eye level, slightly angled. Bottle is hero, props support.\n"
            "Lighting: Warm moody golden tones (3500K), Rembrandt-style side light.\n"
            "Framing: Bottle fills 50% of frame, styled context fills the rest.\n"
            "Depth of field: f/2.8 — bottle sharp, props softly blurred.\n"
            "1:1 square. Aspirational, Instagram-worthy."
        ),
    },
    {
        "key": "smoke_mood",
        "label": "Smoke & Mood",
        "phase": 3,
        "scene": (
            "=== SHOT: SMOKE & MOOD — ATMOSPHERIC ===\n\n"
            "The bottle emerges from ethereal smoke/mist at its base.\n"
            "Using the Pinterest/inspiration references for STYLE and COLOR GRADING.\n"
            "Background: Very dark, near-black. Smoke is the environment.\n"
            "Smoke: Soft white/gray wisps around the bottle base, backlit for glow.\n"
            "Smoke does NOT obscure label or brand logo.\n"
            "Lighting: Strong backlight through liquid = dramatic glow.\n"
            "Side light catches smoke particles and glass edges.\n"
            "Mood: Mysterious, deep, intoxicating.\n"
            "Framing: Bottle fills 75% of frame. 1:1 square."
        ),
    },
    {
        "key": "reflection_luxury",
        "label": "Mirror Reflection",
        "phase": 3,
        "scene": (
            "=== SHOT: MIRROR REFLECTION — LUXURY ===\n\n"
            "Bottle on a polished black mirror/glass surface.\n"
            "Using the Pinterest/inspiration references for STYLE and LIGHTING MOOD.\n"
            "The surface creates a PERFECT reflection of the bottle beneath it.\n"
            "Camera: Slightly low angle (10-15° below eye level).\n"
            "Background: Deep black gradient.\n"
            "Lighting: Single dramatic key light from front-left, rim light from behind.\n"
            "Liquid glows through the glass from backlight.\n"
            "Framing: Bottle + reflection fill 85% of frame.\n"
            "1:1 square. Ultra-luxury, sophisticated."
        ),
    },
]

SHOT_CONFIG_MAP = {s["key"]: s for s in SHOT_CONFIGS}
TOTAL_SHOTS = len(SHOT_CONFIGS)  # 8


class BulkImageService:
    """Generates product images in bulk from CSV data + reference images."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client = genai.Client(api_key=self._api_key)

    # ─── Shared Bottle Spec Template ──────────────────────────────

    @staticmethod
    def _bottle_spec_block(product_name: str, liquid: str, brand: str) -> str:
        """Shared bottle/cap/label specification — injected into every prompt."""
        return f"""
=== {brand.upper()} BOTTLE SPECIFICATIONS [MATCH REFERENCE EXACTLY] ===

┌─────────────────────────────────────────────────────────────┐
│ BOTTLE SHAPE & SIZE:                                        │
│ - Clear premium glass with dome-top rounded shoulders       │
│ - Elegant curved silhouette narrowing at neck               │
│ - 100ml, approximately 6-8 inches tall including cap        │
│ - Thick solid glass base — clear plinth below liquid        │
│ - Visible clear dip tube through center of liquid           │
│ - {liquid} perfume liquid filled to 80%                     │
│ - Premium clarity glass with light refraction               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CAP DESIGN [MATCH EXACTLY]:                                 │
│ - Tall cylindrical cap (~1.5 inches)                        │
│ - MATTE BLACK with vertical grain/ribbed texture            │
│ - POLISHED GOLD METAL RING at TOP edge                      │
│ - POLISHED GOLD METAL RING at BOTTOM edge                   │
│ - Each vertical rib individually visible                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ LABEL LAYOUT [EXACT POSITIONS]:                             │
│                                                             │
│ BLACK LABEL BAND (upper-middle, ~55-60% from base):         │
│ - '{product_name}' in WHITE SERIF ITALIC on the band        │
│                                                             │
│ BELOW THE BAND (on clear glass):                            │
│ - '{brand}' — LARGE WHITE SERIF with accent 'e' (é)        │
│   THIS IS THE LOGO — DO NOT REMOVE                          │
│ - 'ESSENCE' — small WHITE ALL-CAPS below '{brand}'          │
│                                                             │
│ ALL text is WHITE                                           │
│ ❌ DO NOT remove logo, DO NOT reverse positions              │
└─────────────────────────────────────────────────────────────┘

CHANGE ONLY: product name → '{product_name}', liquid → {liquid}
"""

    # ─── Content Assembly ─────────────────────────────────────────

    def _build_content_parts(
        self,
        prompt: str,
        bottle_parts: list[types.Part],
        box_parts: list[types.Part],
        pinterest_parts: list[types.Part],
        generated_parts: list[types.Part],
    ) -> list[types.Part]:
        """Assemble: images FIRST with labels, then prompt.

        ALL refs injected into EVERY call — bottle, box, Pinterest,
        and previously generated images for this product.
        """
        all_parts: list[types.Part] = []

        # Build reference labels
        ref_labels = []
        ref_idx = 1
        for _ in bottle_parts:
            ref_labels.append(f"Image {ref_idx}: BOTTLE reference (clone this bottle exactly)")
            ref_idx += 1
        for _ in box_parts:
            ref_labels.append(f"Image {ref_idx}: BOX/PACKAGING reference (match packaging)")
            ref_idx += 1
        for _ in pinterest_parts:
            ref_labels.append(f"Image {ref_idx}: PINTEREST/STYLE reference (match this mood, lighting, surface, styling)")
            ref_idx += 1
        for i, _ in enumerate(generated_parts):
            ref_labels.append(f"Image {ref_idx}: PREVIOUSLY GENERATED shot (maintain consistency with this)")
            ref_idx += 1

        ref_section = "\n".join(ref_labels)

        # Images FIRST (storyboard pattern)
        all_parts.extend(bottle_parts)
        all_parts.extend(box_parts)
        all_parts.extend(pinterest_parts)
        all_parts.extend(generated_parts)

        # Then prompt
        full_prompt = f"""REFERENCE IMAGES:
{ref_section}

{prompt}

OUTPUT:
- 1:1 SQUARE aspect ratio
- Ultra-photorealistic — real photograph quality
- Label text tack-sharp and legible
- ZERO text/watermarks outside bottle/box labels"""

        all_parts.append(types.Part.from_text(text=full_prompt))
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
        """Generate 8 chained shots for one product.

        Phase 1: Bottle+Box hero → output becomes ref for Phase 2
        Phase 2: 4 styled angle shots (Pinterest + bottle + Phase 1 output)
        Phase 3: 3 creative shots (Pinterest + bottle + best Phase 2 outputs)
        """
        liquid = liquid_color or "as shown in the reference"
        brand = brand_name or "Fumera"
        bottle_spec = self._bottle_spec_block(product_name, liquid, brand)
        safe_name = self._safe_name(product_name)

        # Track generated images for chaining
        generated_parts: list[types.Part] = []
        phase2_parts: list[types.Part] = []

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

            # Build shot prompt
            shot_prompt = f"""{shot['scene']}

{bottle_spec}

=== REALISM CHECKLIST ===
✓ Glass: refraction, caustics, Fresnel, dip-tube visible
✓ Liquid: {liquid}, color depth variation, 80% fill
✓ Cap: matte black ribbed + gold ring TOP + gold ring BOTTOM
✓ Label: '{product_name}' ON black band, '{brand}' BELOW, 'ESSENCE' below that
✓ ALL text WHITE"""

            # Select which generated refs to chain
            chain_parts: list[types.Part] = []
            if shot["phase"] == 2:
                # Phase 2 uses Phase 1 output
                chain_parts = generated_parts[:1]  # bottle+box hero
            elif shot["phase"] == 3:
                # Phase 3 uses Phase 1 + best Phase 2 outputs
                chain_parts = generated_parts[:3]  # hero + first 2 angles

            parts = self._build_content_parts(
                prompt=shot_prompt,
                bottle_parts=bottle_ref_parts,
                box_parts=box_ref_parts,
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

            # Load generated image for chaining into next shots
            if image_url:
                gen_ref = await self._load_images([image_url])
                if gen_ref:
                    generated_parts.extend(gen_ref)
                    if shot["phase"] == 2:
                        phase2_parts.extend(gen_ref)

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
        """Process all CSV rows with per-product Pinterest refs.

        Args:
            per_product_pinterest: {row_index_str: [pinterest_urls]} mapping
        """
        total_rows = len(rows)
        pinterest_map = per_product_pinterest or {}

        # Pre-load shared refs ONCE
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
            "message": f"Starting: {total_rows} products x {TOTAL_SHOTS} shots = {total_rows * TOTAL_SHOTS} images",
        }

        for row_idx, row in enumerate(rows):
            product_name = row.get("PRODUCT_NAME", row.get("product_name", f"Product {row_idx + 1}"))
            liquid_color = row.get("LIQUID_COLOR", row.get("liquid_color", ""))
            box_color = row.get("BOX_COLOR", row.get("box_color", ""))

            # Load per-product Pinterest refs
            pinterest_urls = pinterest_map.get(str(row_idx), [])
            pinterest_parts = await self._load_images(pinterest_urls) if pinterest_urls else []

            logger.info(
                "Row %d [%s]: %d Pinterest refs",
                row_idx, product_name, len(pinterest_parts),
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
                "message": f"Completed {product_name}",
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
                logger.warning("Bulk gen [%s]: %s returned no image", prefix, model_name)
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
            original_size = len(image_bytes)
            image_bytes, mime_type = self._compress_image(image_bytes, mime_type)
            logger.info("Loaded: %s (%s -> %s bytes)", url_path[:60], f"{original_size:,}", f"{len(image_bytes):,}")
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
