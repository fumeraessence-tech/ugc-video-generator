"""Bulk Product Image Generator Service.

CSV-driven pipeline for generating product images at scale.
12 shot types per product: 10 product shots + 2 human model shots.

Key architecture:
  - ALL reference images (bottle + box) are injected into EVERY generation call
  - Reference images are labeled (Image 1: BOTTLE, Image 2: BOX, etc.)
  - Shared bottle/cap/label spec template is embedded in every prompt
  - Each shot type has a detailed, photography-specific scene description
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

# ─── 12 Shot Type Definitions ────────────────────────────────────

SHOT_CONFIGS = [
    # ── PRODUCT SHOTS (10) ───────────────────────────────────────
    {
        "key": "hero_front",
        "label": "Hero Front",
        "category": "product",
        "scene": (
            "=== SHOT: HERO FRONT — E-COMMERCE MARKETPLACE READY ===\n\n"
            "Camera: Straight-on front view, eye level with the label center.\n"
            "Framing: Bottle perfectly centered, filling 85-90% of frame height.\n"
            "Background: Clean white to off-white seamless (#F5F5F5), zero distractions.\n"
            "Surface: Clean white surface with very subtle natural shadow beneath bottle.\n"
            "Lighting: Soft diffused key light from front-left 45°, balanced fill from right.\n"
            "Even illumination ensuring label text is fully readable on both sides.\n"
            "Purpose: Amazon/Sephora listing quality — clean, sharp, professional.\n"
            "Lens: 120mm macro, f/8 for full bottle sharpness front-to-back.\n"
            "Label must be 100% visible and every character perfectly legible."
        ),
    },
    {
        "key": "three_quarter_left",
        "label": "3/4 Left View",
        "category": "product",
        "scene": (
            "=== SHOT: THREE-QUARTER LEFT VIEW — FORM & DEPTH ===\n\n"
            "Camera: Eye level, bottle rotated ~45° to the LEFT from center.\n"
            "Framing: Bottle fills 85% of frame, slightly off-center to the right.\n"
            "Background: Clean white/neutral seamless background.\n"
            "Lighting: Key light from front-right creating a bright highlight along the right glass edge.\n"
            "Strong rim light from the LEFT side creating a glowing edge separation.\n"
            "The black label band is partially visible, showing the bottle's 3D curvature.\n"
            "The brand logo below the band is partially visible at this angle.\n"
            "Gold cap rings catch light differently — top ring more visible from this angle.\n"
            "Purpose: Show bottle form, glass depth, and three-dimensionality.\n"
            "Lens: 100mm, f/5.6 for slight background softness."
        ),
    },
    {
        "key": "three_quarter_right",
        "label": "3/4 Right View",
        "category": "product",
        "scene": (
            "=== SHOT: THREE-QUARTER RIGHT VIEW — ALTERNATE ANGLE ===\n\n"
            "Camera: Eye level, bottle rotated ~45° to the RIGHT from center.\n"
            "Framing: Bottle fills 85% of frame, slightly off-center to the left.\n"
            "Background: Clean white/neutral seamless background.\n"
            "Lighting: Key light from front-left, rim light from RIGHT creating edge glow.\n"
            "Label band and logo partially visible from this reverse angle.\n"
            "The glass refracts light differently at this angle — visible caustic patterns shift.\n"
            "Cap ribbed texture reveals different groove shadows from this perspective.\n"
            "Purpose: Complementary angle to 3/4 left — shows the other side.\n"
            "Lens: 100mm, f/5.6."
        ),
    },
    {
        "key": "low_angle_hero",
        "label": "Low Angle Hero",
        "category": "product",
        "scene": (
            "=== SHOT: LOW ANGLE HERO — POWER & DOMINANCE ===\n\n"
            "Camera: Positioned 30° BELOW the bottle, looking UP at it.\n"
            "The bottle appears powerful, towering, and dominant.\n"
            "Framing: Bottle fills 90% of frame, cap prominent at the top.\n"
            "Background: Gradient from dark at top to lighter at bottom, dramatic.\n"
            "Lighting: Strong backlight creating a luminous halo around the bottle silhouette.\n"
            "The perfume liquid GLOWS — backlight passes through the colored liquid creating\n"
            "a beautiful translucent glow effect. This is the hero lighting moment.\n"
            "Gold cap rings shine brilliantly from this angle — catching overhead light.\n"
            "The thick glass base is prominently visible from below.\n"
            "Purpose: Premium positioning, power, luxury authority.\n"
            "Lens: 85mm, f/4, slight vignette."
        ),
    },
    {
        "key": "macro_detail",
        "label": "Macro Detail",
        "category": "product",
        "scene": (
            "=== SHOT: MACRO DETAIL — CAP & LABEL CLOSE-UP ===\n\n"
            "Camera: Extreme close-up focusing on the cap and upper label area.\n"
            "Framing: Tight crop — cap and black label band fill 90% of the frame.\n"
            "The focus area: gold cap rings, black ribbed texture, and product name on band.\n"
            "Depth of field: ULTRA-SHALLOW — f/2.8 aperture.\n"
            "Focus point: the product name text on the black band = tack-sharp.\n"
            "The gold ring below the cap: razor-sharp metallic detail with specular highlights.\n"
            "Each individual rib/groove on the cap body: visible with micro-shadows.\n"
            "Behind the focus plane: the bottle body and liquid softly blur into beautiful bokeh.\n"
            "Background: Completely blurred out, creamy bokeh.\n"
            "Lighting: Soft side light emphasizing texture and material detail.\n"
            "Purpose: Communicate craftsmanship, premium materials, attention to detail.\n"
            "Lens: 100mm macro at 1:2 magnification ratio."
        ),
    },
    {
        "key": "reflection_shot",
        "label": "Mirror Reflection",
        "category": "product",
        "scene": (
            "=== SHOT: MIRROR REFLECTION — LUXURY ELEGANCE ===\n\n"
            "Camera: Slightly low angle (10-15° below eye level).\n"
            "Surface: Polished black mirror/glass surface creating a PERFECT reflection\n"
            "of the bottle beneath it. The reflection is crisp and clear, nearly symmetrical.\n"
            "Framing: Bottle fills 60% of frame, reflection visible below — total composition\n"
            "including reflection fills 85% of frame.\n"
            "Background: Deep black gradient fading from dark sides to slightly lighter center.\n"
            "Lighting: Dramatic — single key light from front-left creating strong glass highlights.\n"
            "Rim light from behind creating luminous edge on the glass silhouette.\n"
            "The liquid glows through the glass from the backlight.\n"
            "The reflection on the mirror surface doubles the visual impact.\n"
            "Gold cap rings reflect on the black surface below.\n"
            "Purpose: Ultra-luxury positioning, sophistication, visual elegance.\n"
            "Lens: 85mm, f/5.6."
        ),
    },
    {
        "key": "smoke_atmospheric",
        "label": "Smoke & Mist",
        "category": "product",
        "scene": (
            "=== SHOT: SMOKE & MIST — MYSTERIOUS ATMOSPHERE ===\n\n"
            "Camera: Straight-on to slightly low angle.\n"
            "The bottle emerges from a soft cloud of smoke/mist at its base.\n"
            "Framing: Bottle fills 75% of frame, smoke wisps filling the remaining space.\n"
            "Background: Very dark, near-black — the smoke is the environment.\n"
            "Smoke: Soft, ethereal wisps of white/gray smoke drifting around the bottle base\n"
            "and lower body. The smoke is backlit, creating luminous edges on each wisp.\n"
            "The smoke does NOT obscure the label or brand logo — it stays around the base.\n"
            "Lighting: Strong backlight making the liquid glow dramatically through the smoke.\n"
            "Side light catching the smoke particles and glass edges.\n"
            "The overall mood: mysterious, deep, intoxicating.\n"
            "Gold cap rings gleam against the dark, smoky backdrop.\n"
            "Purpose: Mystery, allure, depth — editorial fragrance advertising.\n"
            "Lens: 85mm, f/4."
        ),
    },
    {
        "key": "ingredients_editorial",
        "label": "Ingredients Editorial",
        "category": "product",
        "scene": (
            "=== SHOT: INGREDIENTS EDITORIAL — FRAGRANCE STORY ===\n\n"
            "Camera: Slightly elevated angle (15-20° above eye level), looking down.\n"
            "The bottle is positioned center-left, surrounded by raw fragrance ingredients.\n"
            "Framing: Bottle fills 50% of frame, ingredients artfully scattered around it.\n"
            "Ingredients around the bottle (arranged artistically, NOT cluttered):\n"
            "  - Fresh citrus slices (bergamot, orange) with visible juice droplets\n"
            "  - Vanilla beans, whole and split showing seeds inside\n"
            "  - Small amber resin pieces with warm golden translucency\n"
            "  - Fresh green leaves and herbs (vetiver, rosemary sprigs)\n"
            "  - A few flower petals (jasmine, rose) scattered delicately\n"
            "  - Raw wood shavings or sandalwood pieces\n"
            "Surface: Weathered oak wood or natural stone slab — organic, tactile texture.\n"
            "Cap removed and placed beside the bottle at an aesthetic angle, showing the nozzle.\n"
            "Lighting: Warm golden natural light from the side (golden hour quality, 4000K).\n"
            "Gentle shadows from ingredients creating depth and dimension.\n"
            "Purpose: Storytelling — what does this fragrance smell like? Visual scent narrative.\n"
            "Lens: 50mm, f/4 for natural perspective with moderate depth."
        ),
    },
    {
        "key": "luxury_lifestyle",
        "label": "Luxury Lifestyle",
        "category": "product",
        "scene": (
            "=== SHOT: LUXURY LIFESTYLE — VANITY STILL-LIFE ===\n\n"
            "Camera: Eye level, slightly angled (10-15° off-center).\n"
            "NO HUMAN MODEL in this shot — pure product styling.\n"
            "Setting: Premium marble vanity surface (white marble with subtle gray veining).\n"
            "Framing: Bottle fills 45-50% of frame, luxury props filling context.\n"
            "Props (carefully curated, NOT cluttered — 3-4 items max):\n"
            "  - A folded silk pocket square or scarf in complementary color\n"
            "  - A luxury wristwatch with leather strap\n"
            "  - A single-stem fresh flower (rose or peony) in a small vase\n"
            "  - A leather-bound journal or book with gold-edged pages\n"
            "The bottle is the HERO — props support but don't compete.\n"
            "Lighting: Warm moody golden tones (3500-4000K). Rembrandt-style with\n"
            "dramatic side light creating deep shadows and rich metallic reflections.\n"
            "Gold cap rings reflect the warm light beautifully.\n"
            "Background: Softly blurred luxury interior — warm, intimate, aspirational.\n"
            "Purpose: Aspirational lifestyle, Instagram-worthy, premium context.\n"
            "Lens: 50mm, f/2.8 for shallow depth isolating the product."
        ),
    },
    {
        "key": "flat_lay",
        "label": "Flat Lay Top-Down",
        "category": "product",
        "scene": (
            "=== SHOT: FLAT LAY — TOP-DOWN COMPOSITION ===\n\n"
            "Camera: PERFECT overhead/bird's-eye view — 90° straight down.\n"
            "Framing: Bottle lying on its side or standing upright viewed from directly above.\n"
            "Surface: Pristine white marble with subtle gray veining.\n"
            "The bottle is positioned using rule-of-thirds — NOT dead center.\n"
            "Cap removed and placed at an aesthetic angle beside the bottle.\n"
            "Curated props arranged in golden-ratio flow around the bottle:\n"
            "  - Dried flower petals scattered delicately\n"
            "  - A silk ribbon in a complementary color\n"
            "  - 2-3 small accent items (a pearl, a gold ring, a small stone)\n"
            "Props create visual flow — the eye follows a natural path from top-left to bottle.\n"
            "Lighting: Soft overhead diffused light with gentle shadows — afternoon window quality.\n"
            "Shadows fall naturally from the slight angle of the ambient light source.\n"
            "All text on the bottle visible from above (product name on band, brand logo below).\n"
            "Purpose: Instagram-worthy, storytelling, organized luxury aesthetic.\n"
            "Lens: 35mm, f/5.6 for overhead sharpness across the composition."
        ),
    },
    # ── HUMAN MODEL SHOTS (2) ────────────────────────────────────
    {
        "key": "model_male",
        "label": "Male Model",
        "category": "human",
        "scene": (
            "=== SHOT: MALE MODEL LIFESTYLE — MASCULINE SOPHISTICATION ===\n\n"
            "A REAL, photorealistic male model (age 28-35) holding the perfume bottle.\n"
            "Setting: Modern luxury apartment, floor-to-ceiling windows, city skyline at dusk.\n"
            "Warm ambient light mixing with cool blue twilight from outside.\n\n"
            "MODEL DETAILS:\n"
            "- Male, age 28-35, well-groomed, confident expression\n"
            "- Wardrobe: tailored charcoal suit, crisp white shirt, top button undone\n"
            "- Minimalist silver/steel wristwatch visible\n"
            "- Natural skin texture — visible pores, slight stubble shadow, real skin\n"
            "- Pose: standing, three-quarter body shot from waist up\n"
            "- Holding the bottle naturally in his right hand at chest height\n"
            "- Direct eye contact with camera, subtle confident expression\n\n"
            "HAND PHYSICS [CRITICAL]:\n"
            "- EXACTLY 5 fingers on each visible hand — no more, no less\n"
            "- Natural grip: thumb and index finger visible on front, remaining fingers\n"
            "  wrapped behind the bottle naturally\n"
            "- Hand proportions realistic — correct knuckle spacing, natural nail beds\n"
            "- The bottle's label is FACING THE CAMERA — the product name and brand\n"
            "  logo must be readable in the shot\n\n"
            "BOTTLE IN SCENE:\n"
            "- The bottle is held so the label faces the camera — ALL label text visible\n"
            "- The bottle is proportionally correct to the hand (100ml bottle, ~6 inches tall)\n"
            "- Glass catches ambient light and window reflections naturally\n"
            "- Gold cap rings visible and reflecting the warm interior light\n\n"
            "Framing: Model fills 80% of frame, bottle prominent at chest level.\n"
            "Lighting: Warm interior 3500K key light from right, cool 6500K fill from window.\n"
            "Depth of field: f/2.0 — model and bottle sharp, background beautifully blurred.\n"
            "Purpose: Target male demographic, aspirational masculine lifestyle.\n"
            "Lens: 85mm portrait lens."
        ),
    },
    {
        "key": "model_female",
        "label": "Female Model",
        "category": "human",
        "scene": (
            "=== SHOT: FEMALE MODEL LIFESTYLE — FEMININE ELEGANCE ===\n\n"
            "A REAL, photorealistic female model (age 25-33) with the perfume bottle.\n"
            "Setting: Parisian-style apartment, ornate gilded mirror, morning light through\n"
            "sheer white curtains creating soft diffused illumination.\n\n"
            "MODEL DETAILS:\n"
            "- Female, age 25-33, elegant, natural beauty\n"
            "- Wardrobe: silk champagne/cream slip dress, delicate gold necklace,\n"
            "  small stud earrings\n"
            "- Natural makeup — dewy skin, soft lip color, defined but natural brows\n"
            "- Hair: styled but effortless — loose waves or soft updo\n"
            "- Natural skin texture — visible pores, natural skin tone variation, real skin\n"
            "- Pose: seated at vanity or standing near window\n"
            "- Applying perfume to inner wrist with eyes slightly closed, peaceful expression\n"
            "  OR holding bottle delicately near collarbone with a soft smile\n\n"
            "HAND PHYSICS [CRITICAL]:\n"
            "- EXACTLY 5 fingers on each visible hand\n"
            "- Elegant fingertip grip or delicate palm hold\n"
            "- Slender feminine hands with natural nails (short, clean, natural or soft pink)\n"
            "- The bottle label FACES THE CAMERA — product name and brand logo visible\n\n"
            "BOTTLE IN SCENE:\n"
            "- Bottle held at wrist/collarbone level — label facing camera, text readable\n"
            "- Proportionally correct to the hand and body\n"
            "- Glass catches the soft morning window light beautifully\n"
            "- Gold cap rings gleam softly in the diffused light\n\n"
            "Framing: Model fills 75% of frame, intimate portrait from shoulders up.\n"
            "Lighting: Soft natural window light from the left (5500K), golden bounce fill.\n"
            "Depth of field: f/1.8 — face and bottle sharp, environment dreamy blur.\n"
            "Purpose: Target female demographic, feminine aspiration, intimate luxury.\n"
            "Lens: 85mm portrait lens."
        ),
    },
]

SHOT_CONFIG_MAP = {s["key"]: s for s in SHOT_CONFIGS}


class BulkImageService:
    """Generates product images in bulk from CSV data + reference images."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client = genai.Client(api_key=self._api_key)

    # ─── Shared Bottle Spec Template ──────────────────────────────

    @staticmethod
    def _bottle_spec_block(product_name: str, liquid: str, brand: str) -> str:
        """Shared bottle/cap/label specification block — injected into every prompt."""
        return f"""
=== {brand.upper()} BOTTLE SPECIFICATIONS [MATCH REFERENCE EXACTLY] ===

REFERENCE IMAGES PROVIDED:
- The BOTTLE reference image(s) show the exact bottle to reproduce
- The BOX reference image(s) (if provided) show the packaging — for context only in bottle shots
- Clone the bottle from the reference images EXACTLY — do NOT invent a new design

┌─────────────────────────────────────────────────────────────┐
│ BOTTLE SHAPE & SIZE:                                        │
│ - Clear premium glass with dome-top rounded shoulders       │
│ - Elegant curved silhouette narrowing at neck               │
│ - SIZE: 100ml bottle, approximately 6-8 inches (15-20cm)    │
│   tall including cap                                        │
│ - Thick solid glass base with visible weight and quality    │
│   — clear glass plinth visible below the liquid line        │
│ - Visible clear dip tube running through center of liquid   │
│ - {liquid} perfume liquid filled to 80% level               │
│ - Premium clarity glass with beautiful light refraction     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CAP DESIGN [CRITICAL - MATCH EXACTLY]:                      │
│ - Tall cylindrical cap (approximately 1.5 inches tall)      │
│ - MATTE BLACK with visible vertical grain/ribbed texture    │
│ - Natural dark matte appearance, NOT glossy                 │
│ - POLISHED GOLD METAL RING at TOP edge of cap               │
│ - POLISHED GOLD METAL RING at BOTTOM edge of cap            │
│   (where cap meets bottle neck)                             │
│ - Two gold bands create elegant contrast against matte      │
│   black textured body                                       │
│ - Each vertical rib/groove individually visible             │
│ - Gold rings: polished metallic with specular highlights    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ LABEL LAYOUT [CRITICAL - EXACT POSITIONS]:                  │
│                                                             │
│ ZONE 1 — BLACK LABEL BAND (upper-middle of bottle):         │
│ - Black/dark matte horizontal band wrapping around bottle   │
│   at approximately 55-60% height from the base              │
│ - Band width: approximately 12-15% of bottle height         │
│ - ON this band: '{product_name}' in WHITE SERIF ITALIC      │
│ - Product name centered horizontally on the black band      │
│                                                             │
│ ZONE 2 — BELOW THE BLACK BAND (on clear glass):            │
│ - '{brand}' — LARGE WHITE SERIF with accent 'é'            │
│   THIS IS THE PRIMARY BRAND LOGO — DO NOT REMOVE            │
│ - '{brand}' is LARGER than the product name                 │
│ - Directly below: 'ESSENCE' in small WHITE ALL-CAPS         │
│   with wide letter-spacing                                  │
│                                                             │
│ ALL label text is WHITE — product name, brand logo, ESSENCE │
│                                                             │
│ ❌ DO NOT place '{brand}' ON the black band                  │
│ ❌ DO NOT place product name BELOW the band                  │
│ ❌ DO NOT remove '{brand}' logo or 'ESSENCE'                │
│ ❌ DO NOT change any font, color, or position                │
└─────────────────────────────────────────────────────────────┘

WHAT TO CHANGE (ONLY THESE):
- Product name on black band: '{product_name}' (WHITE serif italic)
- Liquid color: {liquid}
- Everything else: CLONE EXACTLY from reference images
"""

    # ─── Content Assembly (storyboard pattern) ────────────────────

    def _build_content_parts(
        self,
        prompt: str,
        bottle_parts: list[types.Part],
        box_parts: list[types.Part],
    ) -> list[types.Part]:
        """Assemble content parts: reference images FIRST with labels, then prompt text.

        Follows the storyboard pipeline pattern where reference images come before
        the text prompt, with explicit labels telling the model what each image is.
        """
        all_parts: list[types.Part] = []

        # Reference image labels
        ref_labels = []
        ref_idx = 1
        for i in range(len(bottle_parts)):
            ref_labels.append(f"Image {ref_idx}: BOTTLE reference (clone this bottle exactly — shape, cap, label, glass)")
            ref_idx += 1
        for i in range(len(box_parts)):
            ref_labels.append(f"Image {ref_idx}: BOX/PACKAGING reference (match the packaging design)")
            ref_idx += 1

        ref_section = "\n".join(ref_labels)

        # Images FIRST (storyboard pattern — model sees images before instructions)
        all_parts.extend(bottle_parts)
        all_parts.extend(box_parts)

        # Then the full prompt with reference labels
        full_prompt = f"""REFERENCE IMAGES:
{ref_section}

{prompt}

OUTPUT REQUIREMENTS:
- Aspect ratio: 1:1 SQUARE
- Ultra-photorealistic — must pass as a real photograph
- Correct glass physics: refraction, caustics, Fresnel effect
- Label text TACK-SHARP and legible
- ZERO text, watermarks, or captions outside the bottle/box label
- NO AI artifacts, no extra fingers, no distorted hands"""

        all_parts.append(types.Part.from_text(text=full_prompt))

        return all_parts

    # ─── Per-Row Generation ───────────────────────────────────────

    async def generate_for_row(
        self,
        product_name: str,
        liquid_color: str,
        brand_name: str,
        bottle_ref_parts: list[types.Part],
        box_ref_parts: list[types.Part],
        box_color: str = "",
        extra_fields: dict | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Generate all 12 shots + optional box shot for a single CSV row.

        ALL reference images are injected into EVERY generation call.
        """
        liquid = liquid_color or "as shown in the reference"
        brand = brand_name or "Fumera"
        has_box = len(box_ref_parts) > 0
        total_images = len(SHOT_CONFIGS) + (1 if has_box else 0)  # 12 + optional box

        bottle_spec = self._bottle_spec_block(product_name, liquid, brand)

        for shot_idx, shot in enumerate(SHOT_CONFIGS):
            yield {
                "event": "generating",
                "product_name": product_name,
                "stage": shot["category"],
                "angle": shot["key"],
                "label": shot["label"],
                "message": f"Generating {shot['label']} for {product_name}...",
            }

            # Build shot-specific prompt with shared bottle spec
            shot_prompt = f"""{shot['scene']}

{bottle_spec}

=== ULTRA-REALISM CHECKLIST ===
✓ Glass: refraction, caustics, Fresnel, dip-tube visible, thick base
✓ Liquid: {liquid}, color depth variation, transparent, 80% fill
✓ Cap: matte black ribbed + gold ring TOP + gold ring BOTTOM
✓ Label: product name ON black band, '{brand}' logo BELOW band, 'ESSENCE' below logo
✓ ALL text WHITE
✓ Indistinguishable from a real Hasselblad photograph"""

            # ALL refs injected into every shot
            parts = self._build_content_parts(
                prompt=shot_prompt,
                bottle_parts=bottle_ref_parts,
                box_parts=box_ref_parts,
            )

            try:
                image_url = await self._generate_image(parts, f"{shot['key']}-{self._safe_name(product_name)}")
            except Exception as e:
                logger.exception("Shot %s failed for %s", shot["key"], product_name)
                yield {
                    "event": "error",
                    "product_name": product_name,
                    "stage": shot["category"],
                    "angle": shot["key"],
                    "label": shot["label"],
                    "message": str(e),
                    "index": shot_idx,
                    "total": total_images,
                }
                continue

            yield {
                "event": "image",
                "product_name": product_name,
                "stage": shot["category"],
                "angle": shot["key"],
                "label": shot["label"],
                "image_url": image_url or "",
                "index": shot_idx,
                "total": total_images,
            }

        # Box shot (if box refs provided)
        if has_box:
            yield {
                "event": "generating",
                "product_name": product_name,
                "stage": "box",
                "angle": "box",
                "label": "Packaging Box",
                "message": f"Generating box for {product_name}...",
            }

            box_prompt = self._build_box_prompt(product_name, brand, box_color)
            box_parts_assembled = self._build_content_parts(
                prompt=box_prompt,
                bottle_parts=bottle_ref_parts,
                box_parts=box_ref_parts,
            )

            try:
                box_url = await self._generate_image(box_parts_assembled, f"box-{self._safe_name(product_name)}")
            except Exception as e:
                logger.exception("Box shot failed for %s", product_name)
                yield {
                    "event": "error",
                    "product_name": product_name,
                    "stage": "box",
                    "angle": "box",
                    "label": "Packaging Box",
                    "message": str(e),
                    "index": len(SHOT_CONFIGS),
                    "total": total_images,
                }
                box_url = None

            if box_url:
                yield {
                    "event": "image",
                    "product_name": product_name,
                    "stage": "box",
                    "angle": "box",
                    "label": "Packaging Box",
                    "image_url": box_url,
                    "index": len(SHOT_CONFIGS),
                    "total": total_images,
                }

    # ─── Bulk Streaming ───────────────────────────────────────────

    async def generate_bulk_streaming(
        self,
        rows: list[dict],
        reference_image_urls: list[str],
        brand_name: str,
        box_reference_urls: list[str] | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Process all CSV rows, yielding progress. Pre-loads all refs once."""
        total_rows = len(rows)

        # Pre-load ALL reference images ONCE (shared across all rows)
        bottle_ref_parts = await self._load_images(reference_image_urls)
        if not bottle_ref_parts:
            yield {"event": "error", "message": "No bottle reference images could be loaded"}
            return

        box_ref_parts = await self._load_images(box_reference_urls or [])
        has_box = len(box_ref_parts) > 0
        images_per_row = len(SHOT_CONFIGS) + (1 if has_box else 0)

        logger.info(
            "Bulk gen: loaded %d bottle refs, %d box refs — %d shots per product",
            len(bottle_ref_parts), len(box_ref_parts), images_per_row,
        )

        yield {
            "event": "started",
            "total_rows": total_rows,
            "total_images": total_rows * images_per_row,
            "message": f"Starting bulk generation: {total_rows} products x {images_per_row} shots = {total_rows * images_per_row} images",
        }

        for row_idx, row in enumerate(rows):
            product_name = row.get("PRODUCT_NAME", row.get("product_name", f"Product {row_idx + 1}"))
            liquid_color = row.get("LIQUID_COLOR", row.get("liquid_color", ""))
            box_color = row.get("BOX_COLOR", row.get("box_color", ""))

            yield {
                "event": "row_start",
                "row_index": row_idx,
                "total_rows": total_rows,
                "product_name": product_name,
                "message": f"Processing {product_name} ({row_idx + 1}/{total_rows})",
            }

            async for event in self.generate_for_row(
                product_name=product_name,
                liquid_color=liquid_color,
                brand_name=brand_name,
                bottle_ref_parts=bottle_ref_parts,
                box_ref_parts=box_ref_parts,
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

    # ─── Box Prompt ───────────────────────────────────────────────

    def _build_box_prompt(self, product_name: str, brand_name: str, box_color: str = "") -> str:
        brand = brand_name or "Fumera"
        color_instruction = (
            f"Change ONLY the gradient color scheme to: {box_color} tones (dark at top and bottom, the {box_color} color in the middle, fading naturally)."
            if box_color
            else "Keep the EXACT same gradient color scheme as the reference box."
        )

        return f"""=== SHOT: PACKAGING BOX — CLONE WITH COLOR CHANGE ONLY ===

Using the BOX reference image: clone this box EXACTLY. Preserve EVERY detail.

┌─────────────────────────────────────────────────────────────┐
│ BOX STRUCTURE [CLONE EXACTLY]:                              │
│ - Rectangular box — same proportions and dimensions         │
│ - Same 3/4 view angle showing front face + right side       │
│ - Box lid: tuck-in flap visible at top edge                 │
│ - Material: matte/semi-matte cardboard, smooth finish       │
│ - Edges: crisp, clean, luxury quality                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ FRONT FACE [CLONE EXACTLY — DO NOT REARRANGE]:              │
│ - TOP: '{brand}' wordmark — WHITE elegant serif with 'é'   │
│ - BELOW: 'ESSENCE' — WHITE small caps, letter-spaced       │
│ - BOTTOM: 'EAU DE PARFUM' — WHITE small text               │
│ - BELOW: '100 ml | 3.39 fl. oz.' — WHITE small text        │
│ - ALL text is WHITE                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ RIGHT SIDE FACE [CLONE EXACTLY]:                            │
│ - Large vertical '{brand}' text bottom-to-top              │
│ - WHITE/light, semi-transparent watermark style             │
│ - Same font, size, position as reference                    │
└─────────────────────────────────────────────────────────────┘

GRADIENT COLOR:
{color_instruction}

BOX REALISM:
✓ Subtle satin sheen finish, natural light interaction
✓ Slightly rounded cardboard fold edges — not CGI razor-sharp
✓ Natural soft shadow beneath and beside
✓ Text printed on surface — not floating
✓ Clean white/neutral background and surface

❌ NO removed text elements
❌ NO changed fonts or positions
❌ NO missing 'ESSENCE' or volume text"""

    # ─── Image Generation ─────────────────────────────────────────

    async def _generate_image(self, parts: list[types.Part], prefix: str) -> str:
        """Try multiple models to generate the image."""
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
                parts.append(
                    types.Part.from_bytes(data=img_data["bytes"], mime_type=img_data["mime_type"])
                )
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
                    mime_type = {
                        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                        ".png": "image/png", ".webp": "image/webp",
                    }.get(ext, "image/jpeg")
                else:
                    logger.warning("Image not found: %s", file_path)
                    return None
            elif url_path.startswith("http"):
                import httpx
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.get(url_path)
                    resp.raise_for_status()
                    content_type = resp.headers.get("content-type", "image/jpeg")
                    mime_type = content_type.split(";")[0].strip()
                    image_bytes = resp.content
            else:
                file_path = Path(url_path)
                if file_path.exists():
                    image_bytes = file_path.read_bytes()
                else:
                    logger.warning("Image not found: %s", url_path)
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
            max_dim = 2048
            if max(img.size) > max_dim:
                img.thumbnail((max_dim, max_dim), Image.LANCZOS)
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

    # ─── Save / Extract ───────────────────────────────────────────

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
