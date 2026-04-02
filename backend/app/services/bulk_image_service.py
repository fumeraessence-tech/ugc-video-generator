"""Bulk Product Image Generator Service.

9-shot pipeline per product:
  1. Bottle + Box Hero          (bottle + box)
  2. Pinterest Scene + Box      (pinterest + bottle + box)
  3. Pinterest Styled           (pinterest + bottle) → feeds Shot 4
  4. Key Notes Infographic      (shot3_output + bottle) — uses CSV notes data
  5. Avatar + Bottle            (avatar + bottle) — per-product avatar
  6. Creative Dynamic           (bottle only) — rotates styles per product
  7-9. Variant Sizes            (bottle only) — 3 size variants from CSV
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

CREATIVE_STYLES = [
    ("smoke_mist", "on a dark surface with soft ethereal smoke rising from the base. Near-black background. Strong backlight makes the liquid glow. Smoke around base, NOT obscuring label. Mysterious, moody."),
    ("mirror_reflection", "on a polished black mirror surface creating a perfect reflection beneath. Deep black gradient background. Dramatic key light from front-left, rim light from behind. Slightly low angle."),
    ("lifestyle_vanity", "on a marble vanity with luxury props: leather journal, wristwatch, silk pocket square. Warm golden side lighting. Bottle is hero, props support. No human model."),
    ("macro_detail", "extreme close-up. Tight crop: cap and label fill 85% of frame. Shallow depth of field f/2.8. Label tack-sharp, edges bokeh."),
    ("low_angle_hero", "from below, camera at 30 degrees looking up. Bottle appears tall and powerful. Strong backlight makes liquid glow. Dramatic."),
    ("flat_lay", "from directly above, bottle lying on white marble with scattered flower petals, silk ribbon, and small gold accents. Soft overhead light."),
]

# Fixed 3 variants — same for every product
FIXED_VARIANTS = [
    {"label": "50ml (25% Oil Con.)", "desc": "elegant 50ml mid-size bottle with 25% oil concentration, classic proportions", "size_text": "50ml | 25% Oil Concentration"},
    {"label": "100ml (25% Oil Con.)", "desc": "full-size 100ml premium bottle with 25% oil concentration, substantial and luxurious", "size_text": "100ml | 25% Oil Concentration"},
    {"label": "100ml (40% Oil Con.)", "desc": "full-size 100ml premium bottle with 40% oil concentration — the most intense, darkest liquid tone", "size_text": "100ml | 40% Oil Concentration"},
]


def _pick_first_note(notes_str: str) -> str:
    """Pick the first/most prominent note from a comma-separated string."""
    if not notes_str:
        return "Aromatic"
    return notes_str.split(",")[0].strip()


def _build_prompt(
    shot_key: str,
    product_name: str,
    liquid: str,
    brand: str,
    row_data: dict | None = None,
    row_idx: int = 0,
) -> str:
    """Short imperative prompts. Each compositionally unique."""
    row = row_data or {}

    if shot_key == "bottle_box_hero":
        return (
            f"Place the perfume bottle from the first image and the packaging box from the second image "
            f"side by side on a clean white surface. Bottle slightly in front. "
            f"The liquid is {liquid}. "
            f"On the bottle's black label band, the product name is '{product_name}' in white serif italic text. "
            f"Keep the '{brand}' logo and 'ESSENCE' text below the band exactly as shown, all white. "
            f"Clone the box design exactly from the second image. "
            f"Studio lighting, soft shadow. 1:1 square."
        )

    elif shot_key == "scene_pinterest":
        return (
            f"Remove the bottle from the first image. "
            f"Place the perfume bottle from the second image and the packaging box from the third image in its place. "
            f"Bottle slightly in front of the box. "
            f"Keep the exact background, surface, props, and lighting from the first image. "
            f"The liquid is {liquid}. "
            f"On the black label band: '{product_name}' in white text. Keep '{brand}' logo and 'ESSENCE', all white. "
            f"1:1 square."
        )

    elif shot_key == "styled_product":
        return (
            f"Remove the bottle from the first image. "
            f"Place the perfume bottle from the second image in its place, elegant composition. "
            f"Keep the background, surface, and lighting from the first image. "
            f"The liquid is {liquid}. "
            f"On the black label band: '{product_name}' in white text. "
            f"Keep '{brand}' logo and 'ESSENCE' exactly as the second image, all white. "
            f"1:1 square."
        )

    elif shot_key == "key_notes":
        top = _pick_first_note(row.get("TOP_NOTES", ""))
        mid = _pick_first_note(row.get("MIDDLE_NOTES", ""))
        base = _pick_first_note(row.get("BASE_NOTES", ""))
        return (
            f"Using these reference images: "
            f"Create a perfume key notes infographic image. "
            f"RIGHT SIDE: The perfume bottle from the first image — with '{product_name}' on the black band "
            f"and '{brand}' logo below, held by a hand or standing prominently. "
            f"TOP RIGHT: Large text '{product_name}' and below it 'Key Notes' as a subtitle. "
            f"LEFT SIDE: Three white rounded cards stacked vertically, each with a small illustrated icon and label: "
            f"1) 'Top Note' with label '{top}' and a matching illustration (e.g. fruit/flower). "
            f"2) 'Mid Note' with label '{mid}' and a matching illustration. "
            f"3) 'Base Note' with label '{base}' and a matching illustration. "
            f"Background color palette should complement the {liquid} liquid color. "
            f"Style: clean, modern, luxury perfume marketing. 1:1 square."
        )

    elif shot_key == "avatar_bottle":
        gender = row.get("GENDER", "For Him")
        if "her" in gender.lower():
            pose = "elegant female model holding the bottle near her collarbone with a soft smile, silk dress, natural makeup"
        elif "unisex" in gender.lower():
            pose = "stylish model in minimal outfit holding the bottle at chest height, confident pose"
        else:
            pose = "confident male model in tailored suit holding the bottle at chest height, direct eye contact"
        return (
            f"Using these reference images: "
            f"The first image shows a person/avatar. The second image shows the perfume bottle. "
            f"Create a lifestyle portrait: {pose}. "
            f"The person holds the perfume bottle (cloned from the second image) — label facing camera. "
            f"The liquid is {liquid}. On the black band: '{product_name}' in white text. "
            f"Keep '{brand}' logo and 'ESSENCE' as the second image, all white. "
            f"EXACTLY 5 fingers on each hand. Natural grip. "
            f"Shallow depth of field, warm cinematic lighting. 1:1 square."
        )

    elif shot_key == "creative_dynamic":
        style_idx = row_idx % len(CREATIVE_STYLES)
        style_name, style_desc = CREATIVE_STYLES[style_idx]
        return (
            f"Place the perfume bottle from the first image {style_desc} "
            f"The liquid is {liquid}. "
            f"On the black band: '{product_name}' in white text. '{brand}' logo and 'ESSENCE' as shown, all white. "
            f"1:1 square."
        )

    elif shot_key.startswith("variant_"):
        v_desc = row.get("_variant_desc", "full-size bottle")
        v_size_text = row.get("_variant_size_text", "100ml")
        return (
            f"Create a product shot of the perfume bottle from the first image as a {v_desc}. "
            f"The liquid is {liquid}. "
            f"On the black band: '{product_name}' in white text. '{brand}' logo and 'ESSENCE' as shown, all white. "
            f"At the bottom of the image, display '{v_size_text}' as a clean, elegant, clearly visible text label "
            f"integrated into the design — prominent but not clashing with the bottle. "
            f"White/neutral background, professional product photography. 1:1 square."
        )

    else:
        return (
            f"Clone the perfume bottle from the first image. Change product name to '{product_name}'. "
            f"Liquid: {liquid}. All text white. Keep '{brand}' logo. 1:1 square."
        )


class BulkImageService:
    """Generates product images in bulk — 9 shots per product."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client = genai.Client(api_key=self._api_key)

    @staticmethod
    def _build_content_parts(
        prompt: str,
        *image_groups: list[types.Part],
    ) -> list[types.Part]:
        """Prompt FIRST, then images in order. Variable number of image groups."""
        all_parts: list[types.Part] = [types.Part.from_text(text=prompt)]
        for group in image_groups:
            all_parts.extend(group)
        return all_parts

    async def generate_for_row(
        self,
        product_name: str,
        liquid_color: str,
        brand_name: str,
        bottle_ref_parts: list[types.Part],
        box_ref_parts: list[types.Part],
        pinterest_ref_parts: list[types.Part],
        avatar_ref_parts: list[types.Part],
        row_data: dict,
        row_idx: int = 0,
    ) -> AsyncGenerator[dict, None]:
        """Generate 9 shots for one product."""
        liquid = liquid_color or "as shown in the bottle reference"
        brand = brand_name or "Fumera"
        safe_name = self._safe_name(product_name)
        has_pinterest = len(pinterest_ref_parts) > 0
        has_avatar = len(avatar_ref_parts) > 0

        total_shots = 6 + len(FIXED_VARIANTS)  # 6 core + 3 fixed variants = 9
        shot_idx = 0

        # Track Shot 3 output for chaining into Shot 4
        shot3_parts: list[types.Part] = []

        # ── Shot 1: Bottle + Box Hero ──
        yield {"event": "generating", "product_name": product_name, "angle": "bottle_box_hero", "label": "Bottle + Box Hero", "index": shot_idx, "total": total_shots}
        prompt = _build_prompt("bottle_box_hero", product_name, liquid, brand)
        parts = self._build_content_parts(prompt, bottle_ref_parts, box_ref_parts)
        url = await self._safe_generate(parts, f"bottle_box_hero-{safe_name}")
        yield {"event": "image", "product_name": product_name, "angle": "bottle_box_hero", "label": "Bottle + Box Hero", "image_url": url, "index": shot_idx, "total": total_shots}
        shot_idx += 1

        # ── Shot 2: Pinterest Scene + Box ──
        if has_pinterest:
            yield {"event": "generating", "product_name": product_name, "angle": "scene_pinterest", "label": "Pinterest Scene", "index": shot_idx, "total": total_shots}
            prompt = _build_prompt("scene_pinterest", product_name, liquid, brand)
            scene = [pinterest_ref_parts[0]]
            parts = self._build_content_parts(prompt, scene, bottle_ref_parts, box_ref_parts)
            url = await self._safe_generate(parts, f"scene_pinterest-{safe_name}")
            yield {"event": "image", "product_name": product_name, "angle": "scene_pinterest", "label": "Pinterest Scene", "image_url": url, "index": shot_idx, "total": total_shots}
        else:
            yield {"event": "skipped", "product_name": product_name, "angle": "scene_pinterest", "label": "Pinterest Scene", "message": "No Pinterest ref", "index": shot_idx, "total": total_shots}
        shot_idx += 1

        # ── Shot 3: Pinterest Styled (feeds Shot 4) ──
        if has_pinterest:
            yield {"event": "generating", "product_name": product_name, "angle": "styled_product", "label": "Styled Product", "index": shot_idx, "total": total_shots}
            prompt = _build_prompt("styled_product", product_name, liquid, brand)
            pi = min(1, len(pinterest_ref_parts) - 1)
            scene = [pinterest_ref_parts[pi]]
            parts = self._build_content_parts(prompt, scene, bottle_ref_parts)
            url = await self._safe_generate(parts, f"styled_product-{safe_name}")
            yield {"event": "image", "product_name": product_name, "angle": "styled_product", "label": "Styled Product", "image_url": url, "index": shot_idx, "total": total_shots}
            # Load for chaining into Shot 4
            if url:
                shot3_parts = await self._load_images([url])
        else:
            yield {"event": "skipped", "product_name": product_name, "angle": "styled_product", "label": "Styled Product", "message": "No Pinterest ref", "index": shot_idx, "total": total_shots}
        shot_idx += 1

        # ── Shot 4: Key Notes Infographic ──
        yield {"event": "generating", "product_name": product_name, "angle": "key_notes", "label": "Key Notes", "index": shot_idx, "total": total_shots}
        prompt = _build_prompt("key_notes", product_name, liquid, brand, row_data)
        base_ref = shot3_parts if shot3_parts else bottle_ref_parts  # fallback to bottle if no Shot 3
        parts = self._build_content_parts(prompt, base_ref, bottle_ref_parts)
        url = await self._safe_generate(parts, f"key_notes-{safe_name}")
        yield {"event": "image", "product_name": product_name, "angle": "key_notes", "label": "Key Notes", "image_url": url, "index": shot_idx, "total": total_shots}
        shot_idx += 1

        # ── Shot 5: Avatar + Bottle ──
        if has_avatar:
            yield {"event": "generating", "product_name": product_name, "angle": "avatar_bottle", "label": "Avatar + Bottle", "index": shot_idx, "total": total_shots}
            prompt = _build_prompt("avatar_bottle", product_name, liquid, brand, row_data)
            parts = self._build_content_parts(prompt, avatar_ref_parts, bottle_ref_parts)
            url = await self._safe_generate(parts, f"avatar_bottle-{safe_name}")
            yield {"event": "image", "product_name": product_name, "angle": "avatar_bottle", "label": "Avatar + Bottle", "image_url": url, "index": shot_idx, "total": total_shots}
        else:
            yield {"event": "skipped", "product_name": product_name, "angle": "avatar_bottle", "label": "Avatar + Bottle", "message": "No avatar ref", "index": shot_idx, "total": total_shots}
        shot_idx += 1

        # ── Shot 6: Creative Dynamic ──
        yield {"event": "generating", "product_name": product_name, "angle": "creative_dynamic", "label": "Creative Dynamic", "index": shot_idx, "total": total_shots}
        prompt = _build_prompt("creative_dynamic", product_name, liquid, brand, row_data, row_idx)
        parts = self._build_content_parts(prompt, bottle_ref_parts)
        url = await self._safe_generate(parts, f"creative_dynamic-{safe_name}")
        yield {"event": "image", "product_name": product_name, "angle": "creative_dynamic", "label": "Creative Dynamic", "image_url": url, "index": shot_idx, "total": total_shots}
        shot_idx += 1

        # ── Shots 7-9: Fixed Variant Sizes ──
        for v_idx, variant in enumerate(FIXED_VARIANTS):
            v_key = f"variant_{v_idx}"
            label = f"Variant {variant['label']}"
            yield {"event": "generating", "product_name": product_name, "angle": v_key, "label": label, "index": shot_idx, "total": total_shots}
            row_with_variant = {**row_data, "_variant_desc": variant["desc"], "_variant_size_text": variant["size_text"]}
            prompt = _build_prompt("variant_", product_name, liquid, brand, row_with_variant)
            parts = self._build_content_parts(prompt, bottle_ref_parts)
            url = await self._safe_generate(parts, f"variant_{v_idx}-{safe_name}")
            yield {"event": "image", "product_name": product_name, "angle": v_key, "label": label, "image_url": url, "index": shot_idx, "total": total_shots}
            shot_idx += 1

    async def _safe_generate(self, parts: list[types.Part], prefix: str) -> str:
        """Generate with error handling — returns empty string on failure."""
        try:
            return await self._generate_image(parts, prefix)
        except Exception as e:
            logger.exception("Generation failed for %s: %s", prefix, e)
            return ""

    # ─── Bulk Streaming ───────────────────────────────────────────

    async def generate_bulk_streaming(
        self,
        rows: list[dict],
        reference_image_urls: list[str],
        brand_name: str,
        box_reference_urls: list[str] | None = None,
        per_product_pinterest: dict[str, list[str]] | None = None,
        per_product_avatar: dict[str, list[str]] | None = None,
    ) -> AsyncGenerator[dict, None]:
        total_rows = len(rows)
        pinterest_map = per_product_pinterest or {}
        avatar_map = per_product_avatar or {}

        bottle_ref_parts = await self._load_images(reference_image_urls)
        if not bottle_ref_parts:
            yield {"event": "error", "message": "No bottle reference images could be loaded"}
            return

        box_ref_parts = await self._load_images(box_reference_urls or [])

        logger.info("Bulk gen: %d bottle, %d box, %d products", len(bottle_ref_parts), len(box_ref_parts), total_rows)

        yield {"event": "started", "total_rows": total_rows, "total_images": total_rows * 9, "message": f"Starting: {total_rows} products x 9 shots"}

        for row_idx, row in enumerate(rows):
            product_name = row.get("PRODUCT_NAME", f"Product {row_idx + 1}")
            liquid_color = row.get("LIQUID_COLOR", "")

            pinterest_urls = pinterest_map.get(str(row_idx), [])
            pinterest_parts = await self._load_images(pinterest_urls) if pinterest_urls else []

            avatar_urls = avatar_map.get(str(row_idx), [])
            avatar_parts = await self._load_images(avatar_urls) if avatar_urls else []

            logger.info("Row %d [%s]: %d pinterest, %d avatar", row_idx, product_name, len(pinterest_parts), len(avatar_parts))

            yield {"event": "row_start", "row_index": row_idx, "total_rows": total_rows, "product_name": product_name}

            async for event in self.generate_for_row(
                product_name=product_name,
                liquid_color=liquid_color,
                brand_name=brand_name,
                bottle_ref_parts=bottle_ref_parts,
                box_ref_parts=box_ref_parts,
                pinterest_ref_parts=pinterest_parts,
                avatar_ref_parts=avatar_parts,
                row_data=row,
                row_idx=row_idx,
            ):
                event["row_index"] = row_idx
                event["total_rows"] = total_rows
                yield event

            yield {"event": "row_complete", "row_index": row_idx, "total_rows": total_rows, "product_name": product_name}

        yield {"event": "complete", "message": f"All {total_rows} products generated"}

    # ─── Image Generation ─────────────────────────────────────────

    async def _generate_image(self, parts: list[types.Part], prefix: str) -> str:
        for model_name in MODELS_TO_TRY:
            try:
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
                url = self._extract_and_save(response, prefix)
                if url:
                    return url
            except Exception as e:
                logger.warning("Bulk gen [%s]: %s failed: %s", prefix, model_name, e)
                continue
        return ""

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
                fp = _FRONTEND_DIR / "public" / url_path.lstrip("/")
                if fp.exists():
                    image_bytes = fp.read_bytes()
                    mime_type = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}.get(fp.suffix.lower(), "image/jpeg")
                else:
                    return None
            elif url_path.startswith("http"):
                import httpx
                async with httpx.AsyncClient(timeout=30) as c:
                    r = await c.get(url_path)
                    r.raise_for_status()
                    mime_type = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                    image_bytes = r.content
            else:
                fp = Path(url_path)
                if fp.exists():
                    image_bytes = fp.read_bytes()
                else:
                    return None
            if image_bytes is None:
                return None
            image_bytes, mime_type = self._compress_image(image_bytes, mime_type)
            return {"bytes": image_bytes, "mime_type": mime_type}
        except Exception as e:
            logger.warning("Load failed %s: %s", url_path, e)
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
        except Exception:
            return image_bytes, mime_type

    def _extract_and_save(self, response: types.GenerateContentResponse, prefix: str) -> str:
        if not response.candidates:
            return ""
        candidate = response.candidates[0]
        if not candidate.content or not candidate.content.parts:
            return ""
        for part in candidate.content.parts:
            if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
                return self._save_image(part.inline_data.data, prefix)
        return ""

    def _save_image(self, image_bytes: bytes, prefix: str) -> str:
        _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{prefix}-{uuid.uuid4().hex[:8]}.png"
        filepath = _UPLOADS_DIR / filename
        filepath.write_bytes(image_bytes)
        url = f"/uploads/bulk-generator/{filename}"
        return url

    @staticmethod
    def _safe_name(name: str) -> str:
        return "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:30].lower()
