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

# Fixed 3 variants — each with a conversion-friendly creative context
FIXED_VARIANTS = [
    {
        "label": "50ml (25% Oil Con.)",
        "size_text": "50ml | 25% Oil Concentration",
        "scene": (
            "on a sleek dark marble surface with soft golden rim lighting from the left. "
            "A compact leather travel pouch sits half-open beside it, hinting at portability. "
            "Warm moody atmosphere with a dark gradient background. "
            "The bottle appears compact and travel-friendly."
        ),
    },
    {
        "label": "100ml (25% Oil Con.)",
        "size_text": "100ml | 25% Oil Concentration",
        "scene": (
            "on a luxurious vanity surface with a draped silk cloth underneath. "
            "Warm amber backlighting creates a halo glow around the bottle. "
            "Props: a gold-rimmed mirror and a single rose petal. "
            "The full-size bottle looks premium and aspirational. Rich, warm tones."
        ),
    },
    {
        "label": "100ml (40% Oil Con.)",
        "size_text": "100ml | 40% Oil Concentration",
        "scene": (
            "on a polished obsidian surface with dramatic overhead spotlight. "
            "Fine gold dust particles shimmer in the air around the bottle. "
            "The liquid appears richer, deeper, more concentrated. "
            "A small 'INTENSE' badge or ribbon near the base. Ultra-premium, exclusive, dark luxury."
        ),
    },
]


def _pick_first_note(notes_str: str) -> str:
    """Pick the first/most prominent note from a comma-separated string."""
    if not notes_str:
        return "Aromatic"
    return notes_str.split(",")[0].strip()


# Strong bottle consistency directive — prepended to every shot prompt
_BOTTLE_LOCK = (
    "CRITICAL BOTTLE CONSISTENCY RULE: The perfume bottle MUST be an EXACT pixel-level clone of the bottle reference image. "
    "Do NOT alter, reimagine, or stylize the bottle shape in ANY way. "
    "Clone these EXACTLY from the reference: bottle silhouette/outline, cap shape and texture, glass thickness, "
    "base shape, label band position and width, overall proportions and height-to-width ratio. "
    "The ONLY things that change are: the product name text on the label, the liquid color, and optionally the label text. "
    "If the reference bottle is round, it stays round. If square, it stays square. NEVER change the bottle form factor. "
)


def _build_prompt(
    shot_key: str,
    product_name: str,
    liquid: str,
    brand: str,
    row_data: dict | None = None,
    row_idx: int = 0,
) -> str:
    """Short imperative prompts with bottle consistency enforcement."""
    row = row_data or {}

    if shot_key == "bottle_box_hero":
        return (
            f"{_BOTTLE_LOCK}"
            f"Place the perfume bottle from the first image and the packaging box from the second image "
            f"side by side on a clean white surface. Bottle slightly in front. "
            f"The bottle shape, cap, glass, and proportions MUST be identical to the first image — do NOT change the bottle form. "
            f"The liquid is {liquid}. "
            f"On the bottle's black label band, the product name is '{product_name}' in white serif italic text. "
            f"Keep the '{brand}' logo and 'ESSENCE' text below the band exactly as shown, all white. "
            f"Clone the box design exactly from the second image. "
            f"Studio lighting, soft shadow. 1:1 square."
        )

    elif shot_key == "scene_pinterest":
        return (
            f"{_BOTTLE_LOCK}"
            f"Remove the bottle from the first image. "
            f"Place the perfume bottle from the second image and the packaging box from the third image in its place. "
            f"The bottle MUST keep the EXACT same shape, cap, and proportions as shown in the second image — do NOT change the bottle design. "
            f"Bottle slightly in front of the box. "
            f"Keep the exact background, surface, props, and lighting from the first image. "
            f"The liquid is {liquid}. "
            f"On the black label band: '{product_name}' in white text. Keep '{brand}' logo and 'ESSENCE', all white. "
            f"1:1 square."
        )

    elif shot_key == "styled_product":
        return (
            f"{_BOTTLE_LOCK}"
            f"IMAGE EDITING TASK — NOT new generation. "
            f"The first image is a styled SCENE with a bottle in it. The second image is the BOTTLE REFERENCE showing the exact bottle design to use. "
            f"Remove whatever bottle exists in the first image. "
            f"Paste the EXACT bottle from the second image into the scene — same shape, same cap, same glass, same proportions, same label band width. "
            f"Do NOT redesign, reimagine, or stylize the bottle. Clone it pixel-for-pixel from the second image. "
            f"Only change the label text: '{product_name}' in white on the black band. '{brand}' logo and 'ESSENCE' below, all white. "
            f"The liquid is {liquid}. "
            f"Keep the background, surface, props, and lighting from the first image EXACTLY. "
            f"1:1 square."
        )

    elif shot_key == "key_notes":
        # Images: notes_reference(1st) → pinterest(2nd) → bottle(3rd)
        # Or: notes_reference(1st) → bottle(2nd) if no pinterest
        # Or: bottle(1st) only if no notes ref
        top = _pick_first_note(row.get("TOP_NOTES", ""))
        mid = _pick_first_note(row.get("MIDDLE_NOTES", ""))
        base = _pick_first_note(row.get("BASE_NOTES", ""))
        has_notes_ref = row.get("_has_notes_ref", False)
        has_pinterest_for_notes = row.get("_has_pinterest_for_notes", False)

        # Build image reference instructions based on what's available
        if has_notes_ref and has_pinterest_for_notes:
            img_ref = (
                "The first image is the LAYOUT REFERENCE — follow its exact card placement, text positioning, and structure. "
                "The second image is the SCENE/MOOD REFERENCE — use its background atmosphere, color palette, and props to inspire the background. "
                "The third image is the BOTTLE REFERENCE — use this exact bottle design. "
            )
        elif has_notes_ref:
            img_ref = (
                "The first image is the LAYOUT REFERENCE — follow its card placement, text positioning, and structure. "
                "The second image is the BOTTLE REFERENCE — use this exact bottle design. "
            )
        else:
            img_ref = (
                "The first image is the BOTTLE REFERENCE — use this exact bottle design. "
            )

        return (
            f"{_BOTTLE_LOCK}"
            f"Create a perfume 'Key Notes' infographic image. "
            f"{img_ref}"
            f"LAYOUT STRUCTURE (inspired by the layout reference, not a pixel clone — each product should look unique): "
            f"— TOP-RIGHT CORNER: '{product_name}' in large white bold serif text, with 'Key Notes' in smaller white italic text directly below it. "
            f"— LEFT SIDE: Three SQUARE white cards with rounded corners, stacked vertically with even spacing. "
            f"  Card 1: Label 'Top Note' in white text ABOVE the card. Inside the card: a detailed, realistic, richly painted illustration of '{top}' "
            f"(full-color detailed realistic illustration like a botanical/ingredient painting — NOT a line icon, NOT an outline drawing). "
            f"The ingredient name '{top}' in dark text below the illustration inside the card. "
            f"  Card 2: Label 'Mid Note' in white text ABOVE the card. Inside: a detailed realistic painted illustration of '{mid}'. Name '{mid}' below. "
            f"  Card 3: Label 'Base Note' in white text ABOVE the card. Inside: a detailed realistic painted illustration of '{base}'. Name '{base}' below. "
            f"— CENTER-RIGHT: The perfume bottle placed elegantly in the scene (inspired by the mood reference background — could be among rocks, fabric, nature elements, etc.). "
            f"  On the bottle's black band: '{product_name}' in white text. '{brand}' logo and 'ESSENCE', all white. "
            f"  The liquid is {liquid}. "
            f"— BACKGROUND: Atmospheric scene inspired by the mood reference — NOT a plain solid color. Use textures, props, gradients that complement {liquid}. "
            f"All three note cards must be the SAME size squares. Overall style: clean, modern, luxury. 1:1 square."
        )

    elif shot_key == "avatar_bottle":
        # Images: avatar(1st) → bottle(2nd). REPLACE METHOD: pixel-clone person, only swap bottle.
        return (
            f"{_BOTTLE_LOCK}"
            f"BOTTLE REPLACEMENT TASK — This is an image editing task, NOT a new image generation. "
            f"Take the first image as the BASE. This image shows a person holding a perfume bottle. "
            f"Your job: ONLY replace the bottle they are holding. Everything else stays PIXEL-IDENTICAL. "
            f"DO NOT change the person's face, skin tone, hair, expression, pose, body, hands, fingers, outfit, or accessories. "
            f"DO NOT change the background, lighting, shadows, color grading, or camera angle. "
            f"DO NOT regenerate or reimagine the person — clone them exactly from the first image. "
            f"ONLY swap the perfume bottle in their hand with the bottle from the second image. "
            f"The replacement bottle has {liquid} liquid. On the black label band: '{product_name}' in white text. "
            f"'{brand}' logo and 'ESSENCE' below, all white. Label facing camera. "
            f"The bottle size should match the hand grip naturally. "
            f"Keep EVERYTHING else from the first image untouched — same person, same scene, same mood. "
            f"1:1 square."
        )

    elif shot_key == "creative_dynamic":
        style_idx = row_idx % len(CREATIVE_STYLES)
        style_name, style_desc = CREATIVE_STYLES[style_idx]
        return (
            f"{_BOTTLE_LOCK}"
            f"Place the perfume bottle from the first image {style_desc} "
            f"The bottle shape, cap, glass, and proportions MUST be identical to the reference — only the scene around it changes. "
            f"The liquid is {liquid}. "
            f"On the black band: '{product_name}' in white text. '{brand}' logo and 'ESSENCE' as shown, all white. "
            f"1:1 square."
        )

    elif shot_key.startswith("variant_"):
        v_scene = row.get("_variant_scene", "on a premium dark surface with elegant lighting")
        v_size_text = row.get("_variant_size_text", "100ml")
        return (
            f"{_BOTTLE_LOCK}"
            f"Product photography for e-commerce conversion. "
            f"Place the perfume bottle from the first image {v_scene} "
            f"The liquid is {liquid}. "
            f"On the black band: '{product_name}' in white text. '{brand}' logo and 'ESSENCE' as shown, all white. "
            f"IMPORTANT: Do NOT use a plain white or solid-color background. The scene must have depth, atmosphere, and props. "
            f"Display the text '{v_size_text}' elegantly integrated into the composition — "
            f"as a clean semi-transparent dark gradient bar at the bottom with white text, or as a floating label. "
            f"This is a premium conversion-optimized product image. Rich textures, dramatic lighting, luxury feel. "
            f"1:1 square."
        )

    else:
        return (
            f"{_BOTTLE_LOCK}"
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
        notes_ref_parts: list[types.Part] | None = None,
        shot_filter: str | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Generate 9 shots for one product. If shot_filter is set, only generate that shot."""
        liquid = liquid_color or "as shown in the bottle reference"
        brand = brand_name or "Fumera"
        safe_name = self._safe_name(product_name)
        has_pinterest = len(pinterest_ref_parts) > 0
        has_avatar = len(avatar_ref_parts) > 0
        has_notes_ref = bool(notes_ref_parts)

        total_shots = 6 + len(FIXED_VARIANTS)  # 6 core + 3 fixed variants = 9
        shot_idx = 0

        def _should_gen(angle: str) -> bool:
            return shot_filter is None or shot_filter == angle

        # Track Shot 3 output for chaining into Shot 4
        shot3_parts: list[types.Part] = []

        # ── Shot 1: Bottle + Box Hero ──
        if _should_gen("bottle_box_hero"):
            yield {"event": "generating", "product_name": product_name, "angle": "bottle_box_hero", "label": "Bottle + Box Hero", "index": shot_idx, "total": total_shots}
            prompt = _build_prompt("bottle_box_hero", product_name, liquid, brand)
            parts = self._build_content_parts(prompt, bottle_ref_parts, box_ref_parts)
            url = await self._safe_generate(parts, f"bottle_box_hero-{safe_name}")
            yield {"event": "image", "product_name": product_name, "angle": "bottle_box_hero", "label": "Bottle + Box Hero", "image_url": url, "index": shot_idx, "total": total_shots}
        shot_idx += 1

        # ── Shot 2: Pinterest Scene + Box ──
        if _should_gen("scene_pinterest"):
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
        if _should_gen("styled_product") or (_should_gen("key_notes") and not has_notes_ref):
            if has_pinterest:
                yield {"event": "generating", "product_name": product_name, "angle": "styled_product", "label": "Styled Product", "index": shot_idx, "total": total_shots}
                prompt = _build_prompt("styled_product", product_name, liquid, brand)
                pi = min(1, len(pinterest_ref_parts) - 1)
                scene = [pinterest_ref_parts[pi]]
                parts = self._build_content_parts(prompt, scene, bottle_ref_parts)
                url = await self._safe_generate(parts, f"styled_product-{safe_name}")
                yield {"event": "image", "product_name": product_name, "angle": "styled_product", "label": "Styled Product", "image_url": url, "index": shot_idx, "total": total_shots}
                if url:
                    shot3_parts = await self._load_images([url])
            else:
                yield {"event": "skipped", "product_name": product_name, "angle": "styled_product", "label": "Styled Product", "message": "No Pinterest ref", "index": shot_idx, "total": total_shots}
        shot_idx += 1

        # ── Shot 4: Key Notes Infographic ──
        if _should_gen("key_notes"):
            yield {"event": "generating", "product_name": product_name, "angle": "key_notes", "label": "Key Notes", "index": shot_idx, "total": total_shots}
            # Build row_data flags for prompt
            row_for_notes = {
                **row_data,
                "_has_notes_ref": has_notes_ref,
                "_has_pinterest_for_notes": has_pinterest,
            }
            prompt = _build_prompt("key_notes", product_name, liquid, brand, row_for_notes)

            # Image order: notes_ref (layout) → pinterest (mood) → bottle
            image_groups: list[list[types.Part]] = []
            if has_notes_ref:
                image_groups.append(notes_ref_parts)
            if has_pinterest:
                # Use first pinterest as mood reference for background
                pi = min(1, len(pinterest_ref_parts) - 1)
                image_groups.append([pinterest_ref_parts[pi]])
            image_groups.append(bottle_ref_parts)

            parts = self._build_content_parts(prompt, *image_groups)
            url = await self._safe_generate(parts, f"key_notes-{safe_name}")
            yield {"event": "image", "product_name": product_name, "angle": "key_notes", "label": "Key Notes", "image_url": url, "index": shot_idx, "total": total_shots}
        shot_idx += 1

        # ── Shot 5: Avatar + Bottle ──
        if _should_gen("avatar_bottle"):
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
        if _should_gen("creative_dynamic"):
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
            if _should_gen(v_key):
                yield {"event": "generating", "product_name": product_name, "angle": v_key, "label": label, "index": shot_idx, "total": total_shots}
                row_with_variant = {**row_data, "_variant_scene": variant["scene"], "_variant_size_text": variant["size_text"]}
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
        notes_reference_urls: list[str] | None = None,
    ) -> AsyncGenerator[dict, None]:
        total_rows = len(rows)
        pinterest_map = per_product_pinterest or {}
        avatar_map = per_product_avatar or {}

        bottle_ref_parts = await self._load_images(reference_image_urls)
        if not bottle_ref_parts:
            yield {"event": "error", "message": "No bottle reference images could be loaded"}
            return

        box_ref_parts = await self._load_images(box_reference_urls or [])
        notes_ref_parts = await self._load_images(notes_reference_urls or [])

        logger.info(
            "Bulk gen: %d bottle, %d box, %d notes_ref, %d products",
            len(bottle_ref_parts), len(box_ref_parts), len(notes_ref_parts), total_rows,
        )

        yield {"event": "started", "total_rows": total_rows, "total_images": total_rows * 9, "message": f"Starting: {total_rows} products x 9 shots"}

        for row_idx, row in enumerate(rows):
            product_name = row.get("PRODUCT_NAME", f"Product {row_idx + 1}")
            liquid_color = row.get("LIQUID_COLOR", "")

            pinterest_urls = pinterest_map.get(str(row_idx), [])
            pinterest_parts = await self._load_images(pinterest_urls) if pinterest_urls else []

            avatar_urls = avatar_map.get(str(row_idx), [])
            avatar_parts = await self._load_images(avatar_urls) if avatar_urls else []

            logger.info("Row %d [%s]: %d pinterest, %d avatar, %d notes_ref", row_idx, product_name, len(pinterest_parts), len(avatar_parts), len(notes_ref_parts))

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
                notes_ref_parts=notes_ref_parts if notes_ref_parts else None,
            ):
                event["row_index"] = row_idx
                event["total_rows"] = total_rows
                yield event

            yield {"event": "row_complete", "row_index": row_idx, "total_rows": total_rows, "product_name": product_name}

        yield {"event": "complete", "message": f"All {total_rows} products generated"}

    # ─── Single-Shot Regeneration ─────────────────────────────────
    async def regenerate_single_shot(
        self,
        product_name: str,
        liquid_color: str,
        brand_name: str,
        shot_angle: str,
        reference_image_urls: list[str],
        box_reference_urls: list[str] | None = None,
        pinterest_urls: list[str] | None = None,
        avatar_urls: list[str] | None = None,
        notes_reference_urls: list[str] | None = None,
        row_data: dict | None = None,
        row_idx: int = 0,
    ) -> AsyncGenerator[dict, None]:
        """Regenerate a single shot for one product."""
        bottle_ref_parts = await self._load_images(reference_image_urls)
        if not bottle_ref_parts:
            yield {"event": "error", "message": "No bottle reference images could be loaded"}
            return

        box_ref_parts = await self._load_images(box_reference_urls or [])
        pinterest_parts = await self._load_images(pinterest_urls or [])
        avatar_parts = await self._load_images(avatar_urls or [])
        notes_ref_parts = await self._load_images(notes_reference_urls or [])

        async for event in self.generate_for_row(
            product_name=product_name,
            liquid_color=liquid_color or "",
            brand_name=brand_name,
            bottle_ref_parts=bottle_ref_parts,
            box_ref_parts=box_ref_parts,
            pinterest_ref_parts=pinterest_parts,
            avatar_ref_parts=avatar_parts,
            row_data=row_data or {},
            row_idx=row_idx,
            notes_ref_parts=notes_ref_parts if notes_ref_parts else None,
            shot_filter=shot_angle,
        ):
            yield event

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
