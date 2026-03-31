"""Image Generator Service.

2-step pipeline:
  Step 1 — Analyze reference/Pinterest scene with Gemini Vision (mood, layout, placement,
           lighting direction, color palette, creative opportunities).
  Step 2 — Build tailored per-shot prompts using the analysis + product refs, then generate
           images with Gemini multimodal (reference images + text prompt).

Supports separate bottle vs box reference images so each shot type uses only
the refs it needs (e.g. "with_box" uses both, "hero_replace" uses bottle only).
"""

import asyncio
import io
import json
import logging
import re
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_FRONTEND_DIR = _BACKEND_DIR.parent / "frontend"
_UPLOADS_DIR = _FRONTEND_DIR / "public" / "uploads" / "image-generator"

# Max reference image size — compress larger images to JPEG
MAX_REF_IMAGE_BYTES = 500_000

MODELS_TO_TRY = [
    "gemini-2.5-flash-image",
    "gemini-3-pro-image-preview",
    "gemini-2.0-flash-exp-image-generation",
]

# ─── Scene Analysis Prompt ────────────────────────────────────────

SCENE_ANALYSIS_PROMPT = """You are an expert product photographer and creative director.

Analyze this reference/Pinterest scene image in detail. Extract:

1. **MOOD & ATMOSPHERE**: Overall feeling (luxurious, minimal, warm, dramatic, etc.)
2. **COLOR PALETTE**: Dominant colors, accent colors, warm/cool tones
3. **LIGHTING**: Direction (left/right/top/back), type (natural/studio/golden hour), intensity, shadow style (soft/hard)
4. **COMPOSITION**: Layout type (centered, rule of thirds, diagonal), negative space, depth
5. **SURFACE & PROPS**: What surfaces, textures, props are visible (sand, stone, wood, fabric, etc.)
6. **PRODUCT PLACEMENT**: Where is the product positioned? On what? At what angle? Supported by what?
7. **BACKGROUND**: What is the background? Gradient, solid, blurred environment, bokeh?
8. **CREATIVE STYLE**: Photography style (editorial, lifestyle, studio, outdoor, macro)
9. **CAMERA**: Estimated focal length, depth of field, shooting angle (eye level, low, high, 45°)

Return ONLY valid JSON:
{
  "mood": "luxurious, warm, earthy",
  "color_palette": {"dominant": ["warm brown", "sand beige"], "accents": ["gold", "dark brown"], "temperature": "warm"},
  "lighting": {"direction": "top-right, soft diffused", "type": "studio with warm gel", "shadows": "soft, natural falloff", "highlights": "subtle golden rim on glass"},
  "composition": {"layout": "off-center right", "negative_space": "left side gradient", "depth": "shallow, product sharp, background soft"},
  "surface_props": ["fine sand surface", "weathered driftwood", "natural stone edge"],
  "product_placement": {"position": "center-left, slightly elevated on driftwood", "angle": "front-facing, slight 15° tilt", "support": "balanced on driftwood branch"},
  "background": {"type": "warm gradient", "description": "smooth warm brown to darker brown gradient"},
  "creative_style": "editorial luxury product photography",
  "camera": {"focal_length": "85-100mm", "dof": "shallow, f/2.8", "angle": "slightly below eye level"},
  "creative_opportunities": ["dramatic shadow play with driftwood", "golden rim lighting on glass bottle", "sand texture as foreground interest"]
}"""


# ─── Shot Type Definitions ────────────────────────────────────────

SHOT_TYPES = [
    {
        "key": "hero_replace",
        "label": "Hero Shot",
        "uses_box": False,
        "description": "Direct bottle replacement — keep the reference scene exactly as-is, only swap the bottle.",
    },
    {
        "key": "with_box",
        "label": "With Box",
        "uses_box": True,
        "description": "Bottle + packaging box together in the scene, positioned naturally side by side.",
    },
    {
        "key": "single_shot",
        "label": "Single Shot",
        "uses_box": False,
        "description": "Clean single bottle hero shot — product is the sole subject on a complementary surface.",
    },
    {
        "key": "dynamic_angle",
        "label": "Dynamic Angle",
        "uses_box": False,
        "description": "Bottle at a dramatic/dynamic angle — tilted, leaning, or laying down for visual interest.",
    },
    {
        "key": "detail_closeup",
        "label": "Detail Close-up",
        "uses_box": False,
        "description": "Macro/close-up focusing on bottle label, cap, liquid, and material details.",
    },
]

SHOT_TYPE_MAP = {s["key"]: s for s in SHOT_TYPES}


def _extract_json(text: str) -> dict:
    """Robustly extract JSON from Gemini response."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strip markdown fences
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Brace extraction
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last > first:
        # Fix trailing commas
        raw = text[first:last + 1]
        raw = re.sub(r",\s*([}\]])", r"\1", raw)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not parse JSON from response: {text[:300]}")


class ImageGeneratorService:
    """Generates product images using scene analysis + replace technique."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client = genai.Client(api_key=self._api_key)

    # ─── Public: Streaming Generation ─────────────────────────────

    async def generate_all_shots_streaming(
        self,
        product_images: list[str],
        reference_images: list[str],
        product_name: str,
        brand_name: str = "",
        liquid_color: str = "",
        product_dna: dict | None = None,
        shot_types: list[str] | None = None,
        bottle_images: list[str] | None = None,
        box_images: list[str] | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Generate shots sequentially with SSE streaming.

        Pipeline:
          1. Pre-load all images (bottle, box, reference)
          2. Analyze the reference scene with Gemini Vision
          3. Per shot: build tailored prompt from analysis, generate image
        """
        shots = shot_types or [s["key"] for s in SHOT_TYPES]

        # Determine bottle refs: explicit bottle_images > product_images fallback
        bottle_urls = bottle_images if bottle_images else product_images
        box_urls = box_images or []

        # Pre-load all images
        bottle_parts = await self._load_images(bottle_urls)
        box_parts = await self._load_images(box_urls) if box_urls else []
        reference_parts = await self._load_images(reference_images)

        if not reference_parts:
            yield {
                "event": "error",
                "shot_type": "",
                "message": "No reference images could be loaded",
            }
            return

        if not bottle_parts:
            yield {
                "event": "error",
                "shot_type": "",
                "message": "No bottle/product images could be loaded",
            }
            return

        # Step 1: Analyze reference scene with Gemini Vision
        yield {
            "event": "analyzing",
            "message": "Analyzing reference scene — extracting mood, layout, lighting...",
        }

        scene_analysis = await self._analyze_reference_scene(reference_images[0])
        if scene_analysis:
            logger.info("Scene analysis complete: %s", json.dumps(scene_analysis, indent=2)[:500])
            yield {
                "event": "analysis_complete",
                "analysis": scene_analysis,
                "message": "Scene analysis complete",
            }
        else:
            logger.warning("Scene analysis failed — proceeding with generic prompts")
            scene_analysis = {}

        # Step 2: Generate each shot type
        for idx, shot_key in enumerate(shots):
            shot_info = SHOT_TYPE_MAP.get(shot_key)
            if not shot_info:
                continue

            try:
                # Select reference images for this shot type
                shot_product_parts = bottle_parts[:]
                if shot_info["uses_box"] and box_parts:
                    shot_product_parts.extend(box_parts)

                prompt = self._build_shot_prompt(
                    shot_info=shot_info,
                    product_name=product_name,
                    brand_name=brand_name,
                    liquid_color=liquid_color,
                    product_dna=product_dna,
                    scene_analysis=scene_analysis,
                    has_box_refs=bool(box_parts) and shot_info["uses_box"],
                    num_bottle_refs=len(bottle_parts),
                    num_box_refs=len(box_parts) if shot_info["uses_box"] else 0,
                )

                image_url = await self._generate_with_references(
                    reference_parts=reference_parts,
                    product_parts=shot_product_parts,
                    prompt=prompt,
                    shot_key=shot_key,
                )

                yield {
                    "event": "image",
                    "shot_type": shot_key,
                    "label": shot_info["label"],
                    "image_url": image_url,
                    "prompt": prompt,
                    "index": idx,
                    "total": len(shots),
                }
            except Exception as e:
                logger.exception("Failed to generate %s", shot_key)
                yield {
                    "event": "error",
                    "shot_type": shot_key,
                    "label": shot_info["label"],
                    "message": str(e),
                    "index": idx,
                    "total": len(shots),
                }

    # ─── Public: Single Shot Regeneration ─────────────────────────

    async def generate_single_shot(
        self,
        shot_type: str,
        product_images: list[str],
        reference_images: list[str],
        product_name: str,
        brand_name: str = "",
        liquid_color: str = "",
        product_dna: dict | None = None,
        bottle_images: list[str] | None = None,
        box_images: list[str] | None = None,
    ) -> dict:
        """Generate a single shot (for regeneration)."""
        shot_info = SHOT_TYPE_MAP.get(shot_type)
        if not shot_info:
            raise ValueError(f"Unknown shot type: {shot_type}")

        bottle_urls = bottle_images if bottle_images else product_images
        box_urls = box_images or []

        bottle_parts = await self._load_images(bottle_urls)
        box_parts = await self._load_images(box_urls) if box_urls else []
        reference_parts = await self._load_images(reference_images)

        if not reference_parts:
            raise ValueError("No reference images could be loaded")

        # Analyze scene for this regeneration too
        scene_analysis = await self._analyze_reference_scene(reference_images[0])

        shot_product_parts = bottle_parts[:]
        if shot_info["uses_box"] and box_parts:
            shot_product_parts.extend(box_parts)

        prompt = self._build_shot_prompt(
            shot_info=shot_info,
            product_name=product_name,
            brand_name=brand_name,
            liquid_color=liquid_color,
            product_dna=product_dna,
            scene_analysis=scene_analysis or {},
            has_box_refs=bool(box_parts) and shot_info["uses_box"],
            num_bottle_refs=len(bottle_parts),
            num_box_refs=len(box_parts) if shot_info["uses_box"] else 0,
        )

        image_url = await self._generate_with_references(
            reference_parts=reference_parts,
            product_parts=shot_product_parts,
            prompt=prompt,
            shot_key=shot_type,
        )

        return {
            "shot_type": shot_type,
            "label": shot_info["label"],
            "image_url": image_url,
            "prompt": prompt,
        }

    # ─── Step 1: Scene Analysis ───────────────────────────────────

    async def _analyze_reference_scene(self, image_url: str) -> dict | None:
        """Analyze a reference/Pinterest image with Gemini Vision to extract
        mood, lighting, composition, placement, and creative opportunities."""
        try:
            img_data = await self._load_single_image(image_url)
            if not img_data:
                logger.warning("Could not load reference image for analysis: %s", image_url)
                return None

            image_part = types.Part.from_bytes(
                data=img_data["bytes"],
                mime_type=img_data["mime_type"],
            )

            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model="gemini-2.5-flash",
                contents=[image_part, SCENE_ANALYSIS_PROMPT],
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=2048,
                    response_mime_type="application/json",
                ),
            )

            text = (response.text or "").strip()
            if not text:
                return None

            analysis = _extract_json(text)
            return analysis

        except Exception as e:
            logger.warning("Scene analysis failed (non-fatal): %s", e)
            return None

    # ─── Step 2: Prompt Building (scene-aware) ────────────────────

    def _build_shot_prompt(
        self,
        shot_info: dict,
        product_name: str,
        brand_name: str,
        liquid_color: str,
        product_dna: dict | None,
        scene_analysis: dict,
        has_box_refs: bool,
        num_bottle_refs: int,
        num_box_refs: int,
    ) -> str:
        """Build a highly specific prompt for a shot type, informed by scene analysis."""

        shot_key = shot_info["key"]

        # ── Image labeling section (tells the model what each image is) ──
        image_labels = []
        img_idx = 1

        # Reference scene images come first
        image_labels.append(
            f"Image {img_idx}: REFERENCE SCENE — This is the scene setup to preserve. "
            f"Keep the EXACT background, lighting, shadows, props, surface, and camera angle."
        )
        img_idx += 1

        # Bottle reference images
        for i in range(num_bottle_refs):
            image_labels.append(
                f"Image {img_idx}: BOTTLE REFERENCE #{i+1} — This shows the EXACT bottle to place in the scene. "
                f"Clone this bottle precisely: shape, proportions, glass, cap, label typography, label layout."
            )
            img_idx += 1

        # Box reference images (only for with_box shots)
        if has_box_refs:
            for i in range(num_box_refs):
                image_labels.append(
                    f"Image {img_idx}: BOX/PACKAGING REFERENCE #{i+1} — This shows the product's packaging box. "
                    f"Clone the box design, gradient colors, typography, and proportions exactly."
                )
                img_idx += 1

        image_labels_text = "\n".join(image_labels)

        # ── Scene analysis context ──
        scene_context = ""
        if scene_analysis:
            mood = scene_analysis.get("mood", "")
            lighting = scene_analysis.get("lighting", {})
            composition = scene_analysis.get("composition", {})
            surface = scene_analysis.get("surface_props", [])
            bg = scene_analysis.get("background", {})
            camera = scene_analysis.get("camera", {})
            placement = scene_analysis.get("product_placement", {})
            creative = scene_analysis.get("creative_opportunities", [])

            scene_parts = ["SCENE ANALYSIS (extracted from reference — preserve these qualities):"]

            if mood:
                scene_parts.append(f"- Mood: {mood}")
            if lighting:
                light_str = ", ".join(f"{k}: {v}" for k, v in lighting.items() if v) if isinstance(lighting, dict) else str(lighting)
                scene_parts.append(f"- Lighting: {light_str}")
            if composition:
                comp_str = ", ".join(f"{k}: {v}" for k, v in composition.items() if v) if isinstance(composition, dict) else str(composition)
                scene_parts.append(f"- Composition: {comp_str}")
            if surface:
                surf_str = ", ".join(surface) if isinstance(surface, list) else str(surface)
                scene_parts.append(f"- Surfaces & Props: {surf_str}")
            if bg:
                bg_str = bg.get("description", str(bg)) if isinstance(bg, dict) else str(bg)
                scene_parts.append(f"- Background: {bg_str}")
            if camera:
                cam_str = ", ".join(f"{k}: {v}" for k, v in camera.items() if v) if isinstance(camera, dict) else str(camera)
                scene_parts.append(f"- Camera: {cam_str}")
            if placement:
                place_str = ", ".join(f"{k}: {v}" for k, v in placement.items() if v) if isinstance(placement, dict) else str(placement)
                scene_parts.append(f"- Product Placement: {place_str}")
            if creative:
                creative_str = ", ".join(creative) if isinstance(creative, list) else str(creative)
                scene_parts.append(f"- Creative Opportunities: {creative_str}")

            scene_context = "\n".join(scene_parts)

        # ── Product identity section ──
        product_details = []
        product_details.append(f"BRAND NAME: {brand_name}")
        product_details.append(f"  → '{brand_name}' is the BRAND (e.g., 'Fuméra' — the company/house name)")
        product_details.append(f"  → This appears on the label as the brand identity/logo")
        product_details.append(f"PRODUCT NAME: {product_name}")
        product_details.append(f"  → '{product_name}' is the PRODUCT/VARIANT name (e.g., 'Tuscan Noir' — the specific fragrance)")
        product_details.append(f"  → This appears on the label above or below the brand name")

        if liquid_color:
            product_details.append(f"LIQUID COLOR: {liquid_color}")

        product_details.append("")
        product_details.append("LABEL TEXT RULES (CRITICAL — ZERO TOLERANCE):")
        product_details.append("- ALL label text MUST be in WHITE color — no gold, no black, no cream, PURE WHITE")
        product_details.append(f"- The brand name '{brand_name}' and product name '{product_name}' must BOTH appear on the label")
        product_details.append("- Copy the EXACT typography/font style from the bottle reference images")
        product_details.append("- DO NOT invent new fonts — match the reference precisely")
        product_details.append(f"- '{brand_name}' is the BRAND LOGO — preserve its exact design, do NOT treat it as a product name")
        product_details.append(f"- '{product_name}' is the PRODUCT TITLE — it should appear as the variant/fragrance name")
        product_details.append("- If the reference has sub-text like 'ESSENCE', 'EAU DE PARFUM', etc. — preserve it exactly")

        # Product DNA details
        if product_dna:
            product_details.append("")
            product_details.append("PRODUCT PHYSICAL ATTRIBUTES (from analysis):")
            if product_dna.get("shape"):
                product_details.append(f"- Bottle shape: {product_dna['shape']}")
            if product_dna.get("colors"):
                colors = product_dna["colors"]
                if isinstance(colors, dict):
                    color_str = ", ".join(f"{k}: {v}" for k, v in colors.items() if v)
                    product_details.append(f"- Colors: {color_str}")
            if product_dna.get("materials"):
                mats = product_dna["materials"]
                if isinstance(mats, list):
                    product_details.append(f"- Materials: {', '.join(mats)}")
            if product_dna.get("texture"):
                product_details.append(f"- Texture: {product_dna['texture']}")
            if product_dna.get("distinctive_features"):
                feats = product_dna["distinctive_features"]
                if isinstance(feats, list):
                    product_details.append(f"- Distinctive features: {', '.join(feats)}")
            if product_dna.get("branding_text"):
                texts = product_dna["branding_text"]
                if isinstance(texts, list):
                    product_details.append(f"- Reference label text elements: {', '.join(texts)}")

        product_identity = "\n".join(product_details)

        # ── Shot-type-specific creative direction ──
        shot_direction = self._get_shot_direction(
            shot_key=shot_key,
            scene_analysis=scene_analysis,
            has_box_refs=has_box_refs,
            product_name=product_name,
            brand_name=brand_name,
        )

        # ── Assemble final prompt ──
        prompt = f"""REFERENCE IMAGES PROVIDED:
{image_labels_text}

════════════════════════════════════════════════════════
TASK: Generate a photorealistic product photograph.
════════════════════════════════════════════════════════

{scene_context}

════════════════════════════════════════════════════════
PRODUCT IDENTITY (READ CAREFULLY)
════════════════════════════════════════════════════════
{product_identity}

════════════════════════════════════════════════════════
SHOT TYPE: {shot_info['label'].upper()}
════════════════════════════════════════════════════════
{shot_direction}

════════════════════════════════════════════════════════
MANDATORY RULES (ZERO TOLERANCE)
════════════════════════════════════════════════════════
1. KEEP the reference scene EXACTLY as-is: same background, lighting direction, shadows, surface texture, props, camera angle
2. ONLY replace the bottle/product — everything else stays IDENTICAL to the reference scene
3. Clone the bottle shape, proportions, glass clarity, cap design, and label layout EXACTLY from the bottle reference images
4. ALL label text must be WHITE — not gold, not cream, not black — PURE WHITE
5. The brand logo/name '{brand_name}' must be preserved EXACTLY as it appears on the reference bottle — same font, same size, same position
6. The product name '{product_name}' must appear on the label — same typography style as reference
7. Maintain realistic lighting, reflections, and shadows that match the scene's lighting direction
8. Product proportions must be physically correct — match the reference bottle's height-to-width ratio
9. Glass transparency and liquid level must match the reference bottle
10. 1:1 aspect ratio output

ANTI-AI ARTIFACTS:
- Natural shadow softness matching scene lighting
- Realistic glass reflections and refractions
- No text distortion, warping, or font changes
- No plastic/waxy surface textures
- Subtle depth-of-field matching the reference scene
- No over-sharpening or over-saturation

Generate the image now."""

        return prompt

    def _get_shot_direction(
        self,
        shot_key: str,
        scene_analysis: dict,
        has_box_refs: bool,
        product_name: str,
        brand_name: str,
    ) -> str:
        """Return shot-type-specific creative direction, enhanced by scene analysis."""

        placement = scene_analysis.get("product_placement", {})
        lighting = scene_analysis.get("lighting", {})
        mood = scene_analysis.get("mood", "")
        creative = scene_analysis.get("creative_opportunities", [])
        surface = scene_analysis.get("surface_props", [])

        placement_desc = ""
        if isinstance(placement, dict):
            placement_desc = placement.get("position", "") + ", " + placement.get("support", "")

        lighting_desc = ""
        if isinstance(lighting, dict):
            lighting_desc = lighting.get("direction", "") + ", " + lighting.get("type", "")

        creative_desc = ""
        if isinstance(creative, list) and creative:
            creative_desc = " | ".join(creative[:3])

        surface_desc = ", ".join(surface) if isinstance(surface, list) else ""

        if shot_key == "hero_replace":
            return f"""HERO REPLACEMENT SHOT — Direct bottle swap in the reference scene.

WHAT TO DO:
- Remove the existing bottle/product from the reference scene
- Place the NEW bottle (from bottle reference images) in the EXACT same position
- The bottle should sit on the SAME surface/prop at the SAME angle
- Match the reference scene's lighting on the new bottle (reflections, shadows, highlights)
- Preserve ALL scene elements: {surface_desc or 'background, props, surfaces'}

POSITION: {placement_desc or 'Same as the original product in the reference scene'}
LIGHTING: {lighting_desc or 'Match the reference scene exactly'}
CREATIVE NOTES: {creative_desc or 'Preserve the editorial quality of the reference'}

DO NOT include any packaging box — this is a BOTTLE-ONLY shot.
The bottle with brand '{brand_name}' and product '{product_name}' label replaces the original product."""

        elif shot_key == "with_box":
            box_instruction = ""
            if has_box_refs:
                box_instruction = """- Clone the box design EXACTLY from the box reference images
- Preserve the box's gradient, typography, and proportions
- The box should display the brand name and product details clearly"""
            else:
                box_instruction = f"""- Create a packaging box that matches the bottle's design language
- The box should show '{brand_name}' prominently with '{product_name}' as the variant
- Match the color scheme from the bottle label"""

            return f"""WITH BOX SHOT — Bottle + packaging box together in the scene.

WHAT TO DO:
- Remove the existing product from the reference scene
- Place the NEW bottle AND its packaging box side by side
- Bottle should be slightly in front of or next to the box
- The box should be standing upright, angled ~15-30° from the bottle
- Both items should sit naturally on the scene's surface
{box_instruction}

POSITION: {placement_desc or 'Bottle center-left, box to the right, both on the scene surface'}
LIGHTING: {lighting_desc or 'Match the reference scene — ensure both bottle and box are lit consistently'}
MOOD: {mood or 'Match the reference scene atmosphere'}

The bottle label must show '{product_name}' in WHITE text with '{brand_name}' logo.
The box must also show '{brand_name}' branding — clone it from reference if provided."""

        elif shot_key == "single_shot":
            return f"""SINGLE BOTTLE SHOT — Clean, isolated hero product photograph.

WHAT TO DO:
- Use the reference scene's lighting mood, color palette, and atmosphere
- But ISOLATE the bottle as the sole subject — remove any other products/clutter
- Place the bottle on a clean surface that matches the scene's material palette
- Allow the bottle to breathe with ample negative space
- The bottle should command the entire frame — centered or rule-of-thirds

SURFACE: {surface_desc or 'Clean surface matching the reference scene mood'}
LIGHTING: {lighting_desc or 'Adopt the reference lighting direction and warmth'}
MOOD: {mood or 'Editorial, clean, luxurious'}

DO NOT include any packaging box — this is a BOTTLE-ONLY shot.
The bottle label must show '{product_name}' and '{brand_name}' in WHITE text.
Product should fill 60-70% of the frame — not too small, not cropped."""

        elif shot_key == "dynamic_angle":
            return f"""DYNAMIC ANGLE SHOT — Dramatic perspective with visual interest.

WHAT TO DO:
- Place the bottle at an interesting angle: tilted ~30-45°, leaning against a prop, or laying down
- Keep the reference scene's background and lighting direction
- The tilt should look INTENTIONAL and artistic, not accidental
- Gravity must make sense — the bottle should be supported/propped naturally
- If the reference has driftwood/stone/props, use them to support the tilted bottle

POSITION: Bottle tilted/angled, supported by {surface_desc or 'scene props'}
LIGHTING: {lighting_desc or 'Match reference — ensure dynamic shadows from the tilt angle'}
CREATIVE: {creative_desc or 'Dramatic angle with strong shadow play and depth'}

DO NOT include any packaging box — this is a BOTTLE-ONLY shot.
The label must remain readable even at the angle — '{product_name}' and '{brand_name}' in WHITE.
Ensure the liquid inside shifts naturally with gravity at the tilted angle."""

        elif shot_key == "detail_closeup":
            return f"""DETAIL CLOSE-UP SHOT — Macro photography of bottle details.

WHAT TO DO:
- Extreme close-up of the bottle: label, cap, glass texture, liquid
- Use the reference scene's color palette and lighting direction
- The label text should be SHARP and fully readable
- Show glass material quality: transparency, reflections, light play
- Focus on craftsmanship: cap texture (ribbed/smooth), label embossing, glass clarity
- Shallow depth of field — sharp on label, soft falloff on edges

FRAMING: Product fills 85%+ of the frame — tight crop on mid-section and label
LIGHTING: {lighting_desc or 'Use reference lighting — create beautiful highlight on glass'}
FOCUS: Tack-sharp on the label showing '{product_name}' and '{brand_name}'

The label text MUST be perfectly sharp and WHITE.
Show the liquid color ({brand_name}'s signature color) through the glass.
Every text character must be legible — '{product_name}' and '{brand_name}' brand logo."""

        return shot_info["description"]

    # ─── Image Generation ─────────────────────────────────────────

    async def _generate_with_references(
        self,
        reference_parts: list[types.Part],
        product_parts: list[types.Part],
        prompt: str,
        shot_key: str,
    ) -> str:
        """Call Gemini with reference + product images and the prompt."""
        # Order: reference scene first, then product images, then text
        all_parts = reference_parts + product_parts + [types.Part.from_text(text=prompt)]

        for model_name in MODELS_TO_TRY:
            try:
                logger.info("Image gen [%s]: trying %s", shot_key, model_name)
                config = types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                    image_config=types.ImageConfig(aspect_ratio="1:1"),
                )
                response = await asyncio.to_thread(
                    self._client.models.generate_content,
                    model=model_name,
                    contents=[types.Content(role="user", parts=all_parts)],
                    config=config,
                )
                image_url = self._extract_and_save(response, shot_key)
                if image_url:
                    logger.info("Image gen [%s]: %s succeeded", shot_key, model_name)
                    return image_url
                logger.warning("Image gen [%s]: %s returned no image", shot_key, model_name)
            except Exception as e:
                logger.warning("Image gen [%s]: %s failed: %s", shot_key, model_name, e)
                continue

        # Fallback to Imagen text-only
        return await self._imagen_fallback(prompt, shot_key)

    # ─── Image Loading ────────────────────────────────────────────

    async def _load_images(self, urls: list[str]) -> list[types.Part]:
        """Load images from local paths, compress large ones, return as Gemini Parts."""
        parts: list[types.Part] = []
        for url in urls:
            img_data = await self._load_single_image(url)
            if img_data:
                parts.append(
                    types.Part.from_bytes(data=img_data["bytes"], mime_type=img_data["mime_type"])
                )
        return parts

    async def _load_single_image(self, url_path: str) -> dict | None:
        """Load image bytes from a local uploads path or URL, compressing if needed."""
        image_bytes: bytes | None = None
        mime_type: str = "image/jpeg"

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

        # Compress large images
        original_size = len(image_bytes)
        image_bytes, mime_type = self._compress_image(image_bytes, mime_type)
        logger.info(
            "Loaded: %s (%s → %s bytes, %s)",
            url_path[:60], f"{original_size:,}", f"{len(image_bytes):,}", mime_type,
        )
        return {"bytes": image_bytes, "mime_type": mime_type}

    @staticmethod
    def _compress_image(image_bytes: bytes, mime_type: str, max_bytes: int = MAX_REF_IMAGE_BYTES) -> tuple[bytes, str]:
        """Compress an image to JPEG if it exceeds max_bytes."""
        if len(image_bytes) <= max_bytes:
            return image_bytes, mime_type
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(image_bytes))

            # Resize if very large
            max_dim = 2048
            if max(img.size) > max_dim:
                img.thumbnail((max_dim, max_dim), Image.LANCZOS)

            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")

            for q in (85, 75, 60, 45, 30):
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=q, optimize=True)
                if buf.tell() <= max_bytes:
                    compressed = buf.getvalue()
                    logger.info(
                        "Compressed ref image: %s → %s bytes (JPEG q=%d, %dx%d)",
                        f"{len(image_bytes):,}", f"{len(compressed):,}", q, img.size[0], img.size[1],
                    )
                    return compressed, "image/jpeg"

            # Last resort — use lowest quality
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=30, optimize=True)
            return buf.getvalue(), "image/jpeg"

        except Exception as e:
            logger.warning("Compression failed, using original: %s", e)
            return image_bytes, mime_type

    # ─── Save / Extract ───────────────────────────────────────────

    def _extract_and_save(self, response: types.GenerateContentResponse, prefix: str) -> str:
        """Extract image from Gemini response and save to disk."""
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
        """Save image bytes to the uploads directory."""
        _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{prefix}-{uuid.uuid4().hex[:8]}.png"
        filepath = _UPLOADS_DIR / filename
        with open(filepath, "wb") as f:
            f.write(image_bytes)
        url = f"/uploads/image-generator/{filename}"
        logger.info("Saved: %s (%d bytes)", url, len(image_bytes))
        return url

    async def _imagen_fallback(self, prompt: str, prefix: str) -> str:
        """Fallback to Imagen text-to-image when Gemini image gen fails."""
        try:
            response = await asyncio.to_thread(
                self._client.models.generate_images,
                model="imagen-4.0-fast-generate-001",
                prompt=prompt,
                config=types.GenerateImagesConfig(number_of_images=1, aspect_ratio="1:1"),
            )
            if response.generated_images:
                image = response.generated_images[0]
                if hasattr(image, "image") and image.image and hasattr(image.image, "image_bytes") and image.image.image_bytes:
                    return self._save_image(image.image.image_bytes, f"{prefix}-imagen")
        except Exception as e:
            logger.exception("Imagen fallback failed: %s", e)
        return ""
