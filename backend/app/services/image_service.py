"""Image generation service using Imagen 4 with reference images for consistency."""

import logging
import uuid
from pathlib import Path

from google import genai
from google.genai import types

from app.models.schemas import AvatarDNA, Script, ScriptScene
from app.config import settings

logger = logging.getLogger(__name__)

# Imagen 4 model - use fast for speed, regular for quality
IMAGEN_MODEL = "imagen-4.0-fast-generate-001"


class ImageService:
    """Generate storyboard images using Imagen 4 with avatar + product reference images."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)

    async def generate_storyboard(
        self,
        script: Script,
        avatar_dna: AvatarDNA | None = None,
        avatar_reference_images: list[str] | None = None,
        product_name: str | None = None,
        product_images: list[str] | None = None,
        aspect_ratio: str = "9:16",
    ) -> list[dict[str, str]]:
        """Generate storyboard images with avatar + product reference images.

        Args:
            script: The video script with scenes.
            avatar_dna: Character DNA for detailed prompts.
            avatar_reference_images: Avatar/character reference images for consistency.
            product_name: Product name for the prompt.
            product_images: Product reference images for consistency.
            aspect_ratio: Target aspect ratio ("9:16", "16:9", "1:1", "4:5"). Default: "9:16"

        Returns:
            List of dicts with scene_number, image_url, prompt.
        """
        if self._client is None:
            logger.warning("No Gemini API key -- returning mock storyboard")
            return self._mock_storyboard(script)

        avatar_reference_images = avatar_reference_images or []
        product_images = product_images or []

        logger.info(f"🎬 Starting storyboard generation for {len(script.scenes)} scenes")
        logger.info(f"   Avatar DNA provided: {avatar_dna is not None}")
        if avatar_dna:
            logger.info(f"   Avatar DNA details:")
            logger.info(f"     - Gender: {getattr(avatar_dna, 'gender', 'N/A')}")
            logger.info(f"     - Face: {(avatar_dna.face or 'N/A')[:50]}...")
            logger.info(f"     - Ethnicity: {getattr(avatar_dna, 'ethnicity', 'N/A')}")
        logger.info(f"   Avatar reference images: {len(avatar_reference_images)}")
        for i, url in enumerate(avatar_reference_images[:3]):
            logger.info(f"     - Ref {i+1}: {url[:60]}...")
        logger.info(f"   Product images: {len(product_images)}")
        logger.info(f"   Product name: {product_name}")
        logger.info(f"   Aspect ratio: {aspect_ratio}")

        # Load all reference images once
        avatar_images_loaded = await self._load_all_images(avatar_reference_images[:2])
        product_images_loaded = await self._load_all_images(product_images[:3])

        logger.info(f"✅ Loaded {len(avatar_images_loaded)} avatar images, {len(product_images_loaded)} product images")

        results: list[dict[str, str]] = []

        for scene in script.scenes:
            try:
                # Build comprehensive prompt for this scene
                prompt = self._build_comprehensive_prompt(
                    scene=scene,
                    avatar_dna=avatar_dna,
                    product_name=product_name,
                    style_notes=script.style_notes,
                    aspect_ratio=aspect_ratio,
                )

                # Generate image with reference images
                image_url = await self._generate_scene_image(
                    scene_number=scene.scene_number,
                    prompt=prompt,
                    avatar_images=avatar_images_loaded,
                    product_images=product_images_loaded,
                    aspect_ratio=aspect_ratio,
                )

                results.append({
                    "scene_number": str(scene.scene_number),
                    "image_url": image_url or "",
                    "prompt": prompt,
                })

                logger.info(f"✅ Scene {scene.scene_number} generated: {image_url}")

            except Exception as e:
                logger.exception(f"❌ Scene {scene.scene_number} failed: {e}")
                results.append({
                    "scene_number": str(scene.scene_number),
                    "image_url": "",
                    "prompt": f"Error: {e}",
                })

        return results

    async def _generate_scene_image(
        self,
        scene_number: int,
        prompt: str,
        avatar_images: list[dict],
        product_images: list[dict],
        aspect_ratio: str = "9:16",
    ) -> str:
        """Generate a single scene image using Imagen with reference images."""

        logger.info(f"🎨 Generating scene {scene_number} with {len(avatar_images)} avatar refs, {len(product_images)} product refs, aspect: {aspect_ratio}")

        # Build reference image parts for the prompt
        reference_parts = []

        # Add avatar reference images
        for i, img_data in enumerate(avatar_images):
            if img_data.get("bytes"):
                ref_part = types.Part.from_bytes(
                    data=img_data["bytes"],
                    mime_type=img_data["mime_type"]
                )
                reference_parts.append(ref_part)
                logger.info(f"   Added avatar reference {i+1}")

        # Add product reference images
        for i, img_data in enumerate(product_images):
            if img_data.get("bytes"):
                ref_part = types.Part.from_bytes(
                    data=img_data["bytes"],
                    mime_type=img_data["mime_type"]
                )
                reference_parts.append(ref_part)
                logger.info(f"   Added product reference {i+1}")

        # If we have reference images, use Gemini's multimodal generation
        if reference_parts:
            return await self._generate_with_references(
                scene_number=scene_number,
                prompt=prompt,
                reference_parts=reference_parts,
                num_avatar_refs=len(avatar_images),
                num_product_refs=len(product_images),
                aspect_ratio=aspect_ratio,
            )
        else:
            # No reference images - use text-only Imagen
            return await self._generate_text_only(
                scene_number=scene_number,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
            )

    async def _generate_with_references(
        self,
        scene_number: int,
        prompt: str,
        reference_parts: list,
        num_avatar_refs: int = 0,
        num_product_refs: int = 0,
        aspect_ratio: str = "9:16",
    ) -> str:
        """Generate image using Gemini with reference images for character/product consistency.

        Uses gemini-2.5-flash-image which supports:
        - Up to 14 reference images total
        - Up to 5 human reference images for character consistency
        - Up to 6 object reference images for product fidelity
        """

        # Get aspect ratio dimensions and description
        aspect_info = self._get_aspect_ratio_info(aspect_ratio)

        # Build explicit character identity anchoring
        character_anchor = ""
        if num_avatar_refs > 0:
            character_anchor = f"""
╔══════════════════════════════════════════════════════════════════╗
║  ⚠️  CRITICAL: CHARACTER IDENTITY LOCK - READ THIS FIRST  ⚠️      ║
╠══════════════════════════════════════════════════════════════════╣
║  The first {num_avatar_refs} image(s) show THE EXACT PERSON who   ║
║  MUST appear in your generated image.                            ║
║                                                                    ║
║  THIS IS THE SAME HUMAN BEING - NOT A SIMILAR PERSON              ║
║  Copy their face EXACTLY: same eyes, nose, lips, bone structure   ║
║  Copy their skin EXACTLY: same tone, texture, any marks/features  ║
║  Copy their hair EXACTLY: same color, style, texture, length      ║
║  Copy their ethnicity EXACTLY: do not change their race/heritage  ║
║                                                                    ║
║  If the reference shows a specific person, generate THAT PERSON   ║
║  Do NOT create a "similar looking" person - it must be THEM       ║
╚══════════════════════════════════════════════════════════════════╝
"""

        # Build the prompt with explicit reference image roles
        ref_instructions = []
        ref_idx = 1

        if num_avatar_refs > 0:
            ref_instructions.append("CHARACTER REFERENCE IMAGES (IDENTITY SOURCE):")
            for i in range(num_avatar_refs):
                ref_instructions.append(f"  • Image {ref_idx}: This is THE PERSON to generate. Clone their exact appearance.")
                ref_idx += 1
            ref_instructions.append("")

        if num_product_refs > 0:
            ref_instructions.append("PRODUCT REFERENCE IMAGES:")
            for i in range(num_product_refs):
                ref_instructions.append(f"  • Image {ref_idx}: Product reference - match exact shape, colors, branding, details")
                ref_idx += 1
            ref_instructions.append("")

        ref_section = "\n".join(ref_instructions) if ref_instructions else "No reference images provided."

        generation_prompt = f"""{character_anchor}
###########################################
# 🎯 TASK: Generate storyboard frame with EXACT character match
###########################################

{ref_section}

###########################################
# CHARACTER CONSISTENCY - HIGHEST PRIORITY
###########################################
The generated image MUST show THE EXACT SAME PERSON from the reference images.

FACE IDENTITY (CRITICAL - DO NOT DEVIATE):
✓ SAME facial bone structure (jawline, cheekbones, forehead shape)
✓ SAME eyes (exact shape, color, spacing, eyelid type)
✓ SAME nose (bridge width, tip shape, nostril size)
✓ SAME lips (exact shape, fullness, proportions)
✓ SAME eyebrows (shape, thickness, arch)
✓ SAME skin tone and undertone (warm/cool)
✓ SAME any distinctive features (moles, freckles, dimples)

THIS IS NOT A SUGGESTION - IT IS A REQUIREMENT:
- Do NOT generate a "similar looking" person
- Do NOT "improve" or "idealize" their features
- Do NOT change their ethnicity, age, or gender
- Do NOT smooth out their skin texture or features
- The person in output must be RECOGNIZABLE as the same individual

###########################################
# PRODUCT CONSISTENCY
###########################################
The product MUST match the product reference images EXACTLY:
✓ Same shape, proportions, and form factor
✓ Same colors (exact hex values, not similar)
✓ Same branding, logos, and text placement
✓ Same materials (glass, plastic, metal textures)
✓ Correct scale relative to human hands

###########################################
# SCENE DETAILS
###########################################
{prompt}

###########################################
# PHYSICAL REALISM REQUIREMENTS
###########################################
NATURAL OBJECT HANDLING:
✓ Products held with natural, secure grip
✓ Fingers wrap around objects realistically
✓ Weight is visually apparent in how items are held
✓ No floating, flying, or magically suspended objects
✓ Hands have exactly 5 fingers with correct proportions

###########################################
# IMAGE SPECIFICATIONS
###########################################
DIMENSIONS (MUST FOLLOW):
✓ Aspect ratio: EXACTLY {aspect_info['ratio']}
✓ Orientation: {aspect_info['orientation']}
✓ Dimensions: {aspect_info['width']}x{aspect_info['height']} pixels
✓ Platform: {aspect_info['platform']}

QUALITY:
✓ Photorealistic - NOT illustrated, cartoon, or stylized
✓ Professional UGC video frame aesthetic
✓ Cinematic lighting with natural shadows
✓ Natural skin texture with visible pores

###########################################
# 🚫 ABSOLUTE PROHIBITION: NO TEXT 🚫
###########################################
Generate ZERO text, words, letters, numbers, captions, or watermarks.
The image must be completely text-free.

###########################################
# FINAL REMINDER: CHARACTER IDENTITY
###########################################
Before generating, verify:
→ Is this THE SAME PERSON from the reference images?
→ Would someone recognize this as the same individual?
→ Are all facial features IDENTICAL (not similar)?

Generate the image now - same person, same product, zero text."""

        # Try multiple image generation models in order of preference
        models_to_try = [
            "gemini-2.5-flash-image",           # Best for speed + character consistency
            "gemini-3-pro-image-preview",       # Best for quality + complex instructions
            "gemini-2.0-flash-exp-image-generation",  # Fallback
        ]

        for model_name in models_to_try:
            try:
                logger.info(f"🎨 Trying {model_name} for scene {scene_number} with {len(reference_parts)} reference images")

                # Build content with reference images first, then prompt
                content_parts = reference_parts + [types.Part.from_text(text=generation_prompt)]

                # Configure with aspect ratio and person generation
                config = types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                    image_config=types.ImageConfig(
                        aspect_ratio=aspect_ratio,
                        person_generation="ALLOW_ALL",
                    ),
                )

                response = self._client.models.generate_content(
                    model=model_name,
                    contents=[types.Content(role="user", parts=content_parts)],
                    config=config,
                )

                # Extract generated image from response
                if response.candidates and len(response.candidates) > 0:
                    candidate = response.candidates[0]
                    if candidate.content and candidate.content.parts:
                        for part in candidate.content.parts:
                            if hasattr(part, 'inline_data') and part.inline_data:
                                image_bytes = part.inline_data.data
                                if image_bytes:
                                    logger.info(f"✅ {model_name} generated {len(image_bytes)} bytes for scene {scene_number}")
                                    return await self._save_image_bytes(image_bytes, scene_number, aspect_ratio)

                logger.warning(f"❌ {model_name} returned no image for scene {scene_number}")

            except Exception as e:
                logger.warning(f"❌ {model_name} failed: {e}")
                continue

        # All models failed, fall back to text-only Imagen
        logger.warning(f"All Gemini models failed for scene {scene_number}, falling back to Imagen")
        return await self._generate_text_only(scene_number, prompt, aspect_ratio)

    async def _generate_text_only(
        self,
        scene_number: int,
        prompt: str,
        aspect_ratio: str = "9:16",
    ) -> str:
        """Generate image using Imagen text-to-image (no reference images)."""

        logger.info(f"🎨 Using Imagen text-only for scene {scene_number} with aspect ratio {aspect_ratio}")

        try:
            response = self._client.models.generate_images(
                model=IMAGEN_MODEL,
                prompt=prompt,
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    aspect_ratio=aspect_ratio,
                ),
            )

            if response.generated_images and len(response.generated_images) > 0:
                image = response.generated_images[0]
                if hasattr(image, 'image') and image.image:
                    if hasattr(image.image, 'image_bytes') and image.image.image_bytes:
                        logger.info(f"✅ Imagen generated {len(image.image.image_bytes)} bytes")
                        return await self._save_image_bytes(image.image.image_bytes, scene_number, aspect_ratio)

            logger.warning(f"Imagen returned no images for scene {scene_number}")
            return ""

        except Exception as e:
            logger.exception(f"Imagen failed for scene {scene_number}: {e}")
            return ""

    def _get_aspect_ratio_info(self, aspect_ratio: str) -> dict:
        """Get detailed info for aspect ratio to include in prompts."""
        aspect_ratios = {
            "9:16": {
                "ratio": "9:16",
                "width": 1080,
                "height": 1920,
                "orientation": "VERTICAL PORTRAIT (tall and narrow)",
                "platform": "Instagram Reels, TikTok, YouTube Shorts",
                "description": "The height is approximately 1.78x the width - a tall vertical format",
            },
            "16:9": {
                "ratio": "16:9",
                "width": 1920,
                "height": 1080,
                "orientation": "HORIZONTAL LANDSCAPE (wide)",
                "platform": "YouTube, Desktop viewing",
                "description": "The width is approximately 1.78x the height - a wide horizontal format",
            },
            "1:1": {
                "ratio": "1:1",
                "width": 1080,
                "height": 1080,
                "orientation": "SQUARE (equal width and height)",
                "platform": "Instagram Feed, Facebook",
                "description": "Width equals height - a perfect square format",
            },
            "4:5": {
                "ratio": "4:5",
                "width": 1080,
                "height": 1350,
                "orientation": "VERTICAL PORTRAIT (slightly tall)",
                "platform": "Instagram Feed (portrait)",
                "description": "Slightly taller than wide - optimized for Instagram feed",
            },
            "4:3": {
                "ratio": "4:3",
                "width": 1440,
                "height": 1080,
                "orientation": "HORIZONTAL (traditional TV)",
                "platform": "Traditional displays",
                "description": "Classic 4:3 television format",
            },
        }
        return aspect_ratios.get(aspect_ratio, aspect_ratios["9:16"])

    def _build_comprehensive_prompt(
        self,
        scene: ScriptScene,
        avatar_dna: AvatarDNA | None,
        product_name: str | None,
        style_notes: str | None,
        aspect_ratio: str = "9:16",
    ) -> str:
        """Build a highly detailed prompt including all character, product, camera, lighting details."""

        # Get aspect ratio info for the prompt
        aspect_info = self._get_aspect_ratio_info(aspect_ratio)

        parts = [
            "Generate a photorealistic storyboard frame for a professional UGC video advertisement.",
            "",
            "########################################",
            "# ABSOLUTE PROHIBITIONS - NEVER GENERATE",
            "########################################",
            "❌ NEVER add ANY text, words, letters, numbers, captions, subtitles, titles, or watermarks",
            "❌ NEVER add speech bubbles, dialogue boxes, or text overlays of any kind",
            "❌ NEVER add timestamps, logos, brand names as text, or any written content",
            "❌ NEVER add closed captions, subtitles, or transcription text",
            "❌ NEVER render the dialogue/speech as visible text in the image",
            "❌ The image must be COMPLETELY TEXT-FREE - pure visual content only",
            "",
            "########################################",
            "# SCENE CONTEXT",
            "########################################",
            f"Scene Type: {scene.scene_type}",
            f"Location/Setting: {scene.location}",
            f"Scene Description: {scene.description}",
            f"Character Action Being Performed: {scene.character_action}",
            f"Emotional Tone: The character is expressing this verbally (NOT as text): \"{scene.dialogue}\"",
            "",
            "########################################",
            "# CAMERA TECHNICAL SPECIFICATIONS",
            "########################################",
            f"Shot Type: {scene.camera_setup.shot_type}",
            "  - Close-up: Face fills 60-80% of frame, shows micro-expressions",
            "  - Medium: Waist-up framing, shows hand gestures and body language",
            "  - Wide: Full body or environment establishing shot",
            "  - Over-the-shoulder: Product POV, character partially visible",
            "",
            f"Camera Angle: {scene.camera_setup.angle}",
            "  - Eye-level: Natural, relatable, direct connection",
            "  - Slight low angle: Empowering, confident",
            "  - Slight high angle: Intimate, vulnerable",
            "  - Dutch angle: Dynamic, energetic (use sparingly)",
            "",
            f"Camera Movement Style: {scene.camera_setup.movement}",
            "  - Static: Stable, professional, focused",
            "  - Handheld: Authentic UGC feel, slight natural shake",
            "  - Tracking: Following the action smoothly",
            "",
            f"Lens Characteristics: {scene.camera_setup.lens}",
            "  - 35mm: Natural perspective, minimal distortion",
            "  - 50mm: Portrait-style, flattering compression",
            "  - 85mm: Telephoto compression, beautiful bokeh",
            "",
            "########################################",
            "# LIGHTING TECHNICAL SPECIFICATIONS",
            "########################################",
            f"Primary Light Type: {scene.lighting_setup.type}",
            "  - Natural window light: Soft, diffused, authentic",
            "  - Ring light: Even facial illumination, catch lights in eyes",
            "  - Softbox: Professional, controlled, flattering",
            "  - Golden hour: Warm, romantic, cinematic",
            "  - Practical lights: Motivated by visible sources in scene",
            "",
            f"Light Direction: {scene.lighting_setup.direction}",
            "  - Front: Even illumination, minimal shadows",
            "  - Side (Rembrandt): Dramatic triangle on cheek, depth",
            "  - Back/rim: Separation from background, hair light",
            "  - Butterfly: From above, glamorous, slimming shadows",
            "",
            f"Color Temperature: {scene.lighting_setup.color_temp}K",
            "  - 3200K: Warm tungsten, cozy, intimate",
            "  - 5600K: Neutral daylight, clean, natural",
            "  - 6500K+: Cool, modern, clinical",
            "",
            "Light Quality Requirements:",
            "- Soft key light with gradual falloff",
            "- Subtle fill to open shadows (2:1 to 3:1 ratio)",
            "- Visible catch lights in eyes (1-2 points)",
            "- Edge/rim light for depth separation",
            "- Background slightly underexposed for subject focus",
            "",
        ]

        # Add detailed character DNA if available
        if avatar_dna:
            gender = getattr(avatar_dna, 'gender', '') or ''
            if not gender:
                combined = f"{avatar_dna.face} {avatar_dna.body}".lower()
                if any(w in combined for w in ['female', 'woman', 'feminine']):
                    gender = "FEMALE"
                elif any(w in combined for w in ['male', 'man', 'masculine']):
                    gender = "MALE"

            ethnicity = getattr(avatar_dna, 'ethnicity', '') or 'as shown in reference'
            age_range = getattr(avatar_dna, 'age_range', '') or 'as shown in reference'

            parts.extend([
                "########################################",
                "# ⚠️ CHARACTER IDENTITY - LOCKED (DO NOT CHANGE)",
                "########################################",
                "This is a SPECIFIC PERSON from the reference images.",
                "Generate THE SAME INDIVIDUAL - not a similar-looking person.",
                "",
                "IMMUTABLE IDENTITY ATTRIBUTES:",
                f"- Gender: {gender} (LOCKED - do not change)",
                f"- Ethnicity: {ethnicity} (LOCKED - do not change)",
                f"- Age Range: {age_range} (LOCKED - do not change)",
                "",
                "FACE IDENTITY (MUST BE IDENTICAL TO REFERENCE):",
                f"- Face Structure: {avatar_dna.face}",
                "  → Same jawline, cheekbones, forehead as reference",
                f"- Eye Details: {avatar_dna.eyes}",
                "  → Same eye shape, color, spacing, eyelid type as reference",
                "  → Natural moisture, visible iris texture, realistic reflections",
                "",
                "SKIN IDENTITY (MUST MATCH REFERENCE EXACTLY):",
                f"- Skin Description: {avatar_dna.skin}",
                "  → EXACT same skin tone and undertone as reference",
                "  → Same texture, pores, and natural features",
                "  → Same any moles, freckles, beauty marks visible in reference",
                "- RENDER with: Natural skin texture, visible pores, subsurface scattering",
                "- RENDER with: Natural color variation (slight redness on cheeks, nose)",
                "- NEVER: Plastic, waxy, airbrushed, or overly smooth skin",
                "- NEVER: Change skin tone, lighten, darken, or smooth",
                "",
                "HAIR IDENTITY (MUST MATCH REFERENCE):",
                f"- Hair Description: {avatar_dna.hair}",
                "  → Same color, style, texture, length as reference",
                "  → Individual strand visibility, natural highlights",
                "",
                "BODY (MUST MATCH REFERENCE):",
                f"- Body Type: {avatar_dna.body}",
                "  → Same build and proportions as reference",
                "",
                "WARDROBE:",
                f"- Outfit: {avatar_dna.wardrobe}",
                "- Fabric texture visible, natural wrinkles",
                "",
            ])

            if avatar_dna.prohibited_drift:
                parts.extend([
                    "CHARACTER DRIFT PROHIBITIONS (STRICTLY ENFORCED):",
                    f"❌ ABSOLUTELY NEVER: {avatar_dna.prohibited_drift}",
                    "❌ NEVER change face shape, skin tone, or ethnic features",
                    "❌ NEVER idealize, beautify, or 'improve' their appearance",
                    "❌ NEVER generate a different person who looks 'similar'",
                    "",
                ])

        # Add product details with physical reality constraints
        if product_name:
            visibility = scene.product_visibility.value if hasattr(scene.product_visibility, 'value') else str(scene.product_visibility)

            # Get physical reality constraints for this product
            reality_constraints = self._get_physical_reality_constraints(
                product_name=product_name,
                action=scene.character_action,
            )

            parts.extend([
                "########################################",
                "# PRODUCT SPECIFICATIONS (MUST MATCH REFERENCE IMAGES)",
                "########################################",
                f"Product Name: {product_name}",
                f"Product Visibility Level: {visibility}",
                "",
                "PRODUCT RENDERING REQUIREMENTS:",
                "- EXACT match to reference images: shape, colors, branding, proportions",
                "- Accurate material rendering (glass, plastic, metal as appropriate)",
                "- Realistic reflections and refractions",
                "- Correct scale relative to human hands/body",
                "- Legible branding if visible in reference (but as image, NOT added text)",
                "",
            ])

            if reality_constraints:
                parts.extend([
                    "########################################",
                    "# PHYSICAL REALITY CONSTRAINTS (CRITICAL)",
                    "########################################",
                    "The following physical laws and product logic MUST be respected:",
                    "",
                ])
                parts.extend(reality_constraints)
                parts.append("")

        # Add style notes
        if style_notes:
            parts.extend([
                "########################################",
                "# STYLE DIRECTION",
                "########################################",
                style_notes,
                "",
            ])

        parts.extend([
            "########################################",
            "# FINAL OUTPUT REQUIREMENTS (CRITICAL)",
            "########################################",
            "IMAGE DIMENSIONS - EXTREMELY IMPORTANT:",
            f"- Generate image with EXACTLY {aspect_info['ratio']} aspect ratio",
            f"- Orientation: {aspect_info['orientation']}",
            f"- Target dimensions: {aspect_info['width']} pixels WIDE × {aspect_info['height']} pixels TALL",
            f"- Platform: {aspect_info['platform']}",
            f"- {aspect_info['description']}",
            f"- ✓ Generate {aspect_info['orientation'].split(' ')[0]} orientation ONLY",
            "",
            "QUALITY:",
            "- Photorealistic rendering quality",
            "- Professional UGC video frame aesthetic",
            "",
            "COMPOSITION:",
            "- Subject positioned using rule of thirds",
            "- Clear visual hierarchy (subject > product > background)",
            "- Appropriate depth of field for shot type",
            "- Clean, uncluttered background",
            "",
            "QUALITY CHECKLIST:",
            "✓ Photorealistic, NOT illustrated, cartoon, or anime",
            "✓ Natural skin with texture, pores, and subsurface scattering",
            "✓ Realistic eye moisture and reflections",
            "✓ Proper anatomical proportions (correct number of fingers, etc.)",
            "✓ Physically plausible lighting and shadows",
            "✓ Product matches reference images exactly",
            "✓ Action is physically possible and logical",
            "",
            "FINAL PROHIBITION REMINDER:",
            "🚫 ABSOLUTELY NO TEXT, CAPTIONS, SUBTITLES, OR WRITTEN CONTENT OF ANY KIND 🚫",
            "The image must be completely text-free - pure visual storytelling only.",
        ])

        return "\n".join(parts)

    def _get_physical_reality_constraints(
        self,
        product_name: str,
        action: str,
    ) -> list[str]:
        """Generate physical reality constraints based on product type and action."""

        constraints = []
        product_lower = product_name.lower() if product_name else ""
        action_lower = action.lower() if action else ""

        # Universal constraints for all products
        constraints.extend([
            "UNIVERSAL PHYSICAL RULES:",
            "✓ Gravity applies - objects fall down, liquids flow down",
            "✓ Hands have exactly 5 fingers each, correct proportions",
            "✓ Objects have consistent size throughout the scene",
            "✓ Light sources create shadows in the correct direction",
            "✓ Reflective surfaces show accurate reflections",
            "",
            "NATURAL OBJECT HOLDING (CRITICAL):",
            "✓ Product MUST be securely gripped in hand, not floating",
            "✓ Fingers must wrap around the product naturally",
            "✓ Palm and fingers make contact with product surface",
            "✓ Product weight is supported - heavier items need firmer grip",
            "✓ Wrist angle must be comfortable and ergonomic",
            "✓ Hand position allows the intended action (spray, pour, apply)",
            "✓ Product should be at a natural, comfortable height relative to body",
            "✓ If holding near face: product at chin-to-eye level, arm bent naturally",
            "✓ If showing product: hold at chest height with relaxed arm",
            "❌ NEVER show product floating in mid-air",
            "❌ NEVER show product at impossible angles",
            "❌ NEVER show product magically suspended without proper grip",
            "❌ NEVER show fingers passing through product",
            "❌ NEVER show product flying or in unnatural motion",
            "❌ NEVER show awkward wrist angles that would be painful",
            "",
            "HAND ANATOMY RULES:",
            "✓ Thumb on one side, four fingers on other side of product",
            "✓ Knuckles visible and naturally positioned",
            "✓ Fingernails facing correct direction",
            "✓ Hand size proportional to product (small products = fingertip grip)",
            "✓ Natural skin folds where fingers bend",
            "",
        ])

        # Perfume/Fragrance specific constraints
        if any(word in product_lower for word in ['perfume', 'fragrance', 'cologne', 'eau de', 'spray', 'mist']):
            constraints.extend([
                "PERFUME/FRAGRANCE PHYSICAL RULES:",
                "✓ Cap MUST be removed/off before any spraying action",
                "✓ Only ONE cap per bottle (never show double caps)",
                "✓ Spray nozzle must be visible and properly oriented when spraying",
                "✓ Spray mist travels AWAY from nozzle, disperses naturally",
                "✓ Finger must be on the spray actuator when spraying",
                "✓ Bottle orientation: nozzle points toward spray target",
                "❌ NEVER show spraying with cap still on",
                "❌ NEVER show spray coming from wrong direction",
                "❌ NEVER show bottle held upside down while spraying",
                "",
                "PERFUME BOTTLE HOLDING POSITIONS:",
                "✓ Showing bottle: Hold upright in palm, fingers wrapped around sides",
                "✓ Preparing to spray: Index finger on actuator, bottle at 45° angle",
                "✓ Spraying on wrist: Bottle 6-8 inches from wrist, nozzle aimed at wrist",
                "✓ Spraying on neck: Bottle at shoulder height, angled toward neck",
                "✓ Admiring bottle: Hold at eye level, slight tilt to show design",
                "✓ Bottle should rest in hand naturally, base supported by palm",
                "❌ NEVER show bottle floating or suspended in air",
                "❌ NEVER show bottle at awkward 90° angles to wrist",
                "",
            ])

        # Skincare/Cream/Lotion specific constraints
        if any(word in product_lower for word in ['cream', 'lotion', 'moisturizer', 'serum', 'oil', 'balm', 'butter']):
            constraints.extend([
                "SKINCARE/CREAM PHYSICAL RULES:",
                "✓ Jar lid must be removed before scooping product",
                "✓ Tube must be squeezed for product to come out",
                "✓ Pump must be pressed down for product dispensing",
                "✓ Dropper must be squeezed for serum to release",
                "✓ Product amount should be realistic (pea-sized to quarter-sized)",
                "✓ Product texture should match type (thick for cream, liquid for serum)",
                "❌ NEVER show product magically appearing without opening container",
                "❌ NEVER show impossible amounts of product",
                "",
            ])

        # Makeup specific constraints
        if any(word in product_lower for word in ['lipstick', 'mascara', 'foundation', 'concealer', 'eyeshadow', 'blush', 'makeup']):
            constraints.extend([
                "MAKEUP PHYSICAL RULES:",
                "✓ Lipstick must be twisted up before application",
                "✓ Mascara wand must be removed from tube before use",
                "✓ Compact must be opened to access product",
                "✓ Brush/applicator must contact product before skin",
                "✓ Application follows natural makeup technique",
                "❌ NEVER show closed products being used",
                "❌ NEVER show product on face without applicator contact",
                "",
            ])

        # Beverage specific constraints
        if any(word in product_lower for word in ['drink', 'beverage', 'water', 'juice', 'soda', 'coffee', 'tea', 'bottle']):
            constraints.extend([
                "BEVERAGE PHYSICAL RULES:",
                "✓ Cap/lid must be removed before drinking",
                "✓ Liquid pours downward due to gravity",
                "✓ Condensation appears on cold beverages",
                "✓ Liquid level decreases when drinking",
                "✓ Proper grip on container for drinking",
                "❌ NEVER show drinking through closed cap",
                "❌ NEVER show liquid defying gravity",
                "",
            ])

        # Food specific constraints
        if any(word in product_lower for word in ['food', 'snack', 'chocolate', 'candy', 'bar', 'chip']):
            constraints.extend([
                "FOOD PHYSICAL RULES:",
                "✓ Wrapper/packaging must be opened before eating",
                "✓ Food breaks/bites naturally at bite points",
                "✓ Crumbs fall downward",
                "✓ Melting/softening follows heat rules",
                "❌ NEVER show eating through packaging",
                "❌ NEVER show impossible bite marks",
                "",
            ])

        # Tech/Electronics specific constraints
        if any(word in product_lower for word in ['phone', 'device', 'gadget', 'electronic', 'headphone', 'watch']):
            constraints.extend([
                "ELECTRONICS PHYSICAL RULES:",
                "✓ Screens show realistic content (not gibberish)",
                "✓ Buttons are in correct positions",
                "✓ Cables connect to correct ports",
                "✓ Devices are held in natural, usable positions",
                "❌ NEVER show screens with random text/symbols",
                "❌ NEVER show impossible cable connections",
                "",
            ])

        # Action-specific constraints
        if 'spray' in action_lower or 'spritz' in action_lower:
            constraints.extend([
                "SPRAYING ACTION RULES:",
                "✓ Product cap/cover MUST be visibly removed",
                "✓ Finger positioned on spray mechanism",
                "✓ Spray direction follows nozzle orientation",
                "✓ Mist disperses naturally in air",
                "",
            ])

        if 'apply' in action_lower or 'rub' in action_lower:
            constraints.extend([
                "APPLICATION ACTION RULES:",
                "✓ Product visible on fingers/applicator before skin contact",
                "✓ Natural spreading motion on skin",
                "✓ Product absorption shown realistically",
                "",
            ])

        if 'open' in action_lower or 'unbox' in action_lower:
            constraints.extend([
                "OPENING/UNBOXING RULES:",
                "✓ Packaging opens from correct location (seams, lids, flaps)",
                "✓ Contents visible only after opening",
                "✓ Hands grip packaging naturally for opening motion",
                "",
            ])

        return constraints

    async def _load_all_images(self, image_urls: list[str]) -> list[dict]:
        """Load multiple images and return list of image data dicts."""
        loaded = []
        for url in image_urls:
            img_data = await self._load_image(url)
            if img_data and img_data.get("bytes"):
                loaded.append(img_data)
        return loaded

    async def _load_image(self, image_url: str) -> dict | None:
        """Load an image from local path or URL."""
        try:
            if image_url.startswith('/uploads/'):
                # Local file
                backend_dir = Path(__file__).resolve().parents[2]
                frontend_dir = backend_dir.parent / "frontend"
                file_path = frontend_dir / "public" / image_url.lstrip('/')

                if file_path.exists():
                    with open(file_path, 'rb') as f:
                        image_bytes = f.read()
                    ext = file_path.suffix.lower()
                    mime_type = {
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                        '.webp': 'image/webp',
                    }.get(ext, 'image/jpeg')
                    logger.info(f"✅ Loaded local: {file_path} ({len(image_bytes)} bytes)")
                    return {"bytes": image_bytes, "mime_type": mime_type}
                else:
                    logger.warning(f"❌ File not found: {file_path}")
                    return None

            elif image_url.startswith('http://') or image_url.startswith('https://'):
                # Remote URL
                import httpx
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(image_url)
                    resp.raise_for_status()
                    content_type = resp.headers.get('content-type', 'image/jpeg')
                    mime_type = content_type.split(';')[0].strip()
                    logger.info(f"✅ Downloaded: {image_url[:50]}... ({len(resp.content)} bytes)")
                    return {"bytes": resp.content, "mime_type": mime_type}

            else:
                logger.warning(f"❌ Unsupported URL format: {image_url}")
                return None

        except Exception as e:
            logger.warning(f"❌ Failed to load {image_url}: {e}")
            return None

    async def _save_image_bytes(self, image_bytes: bytes, scene_number: int, target_aspect: str = "9:16") -> str:
        """Save image bytes and return the URL. Optionally enforce aspect ratio."""
        backend_dir = Path(__file__).resolve().parents[2]
        frontend_dir = backend_dir.parent / "frontend"
        uploads_dir = frontend_dir / "public" / "uploads" / "storyboard"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        # Try to enforce aspect ratio if PIL is available
        processed_bytes = await self._enforce_aspect_ratio(image_bytes, target_aspect)

        filename = f"scene-{scene_number}-{uuid.uuid4().hex[:8]}.png"
        filepath = uploads_dir / filename

        with open(filepath, 'wb') as f:
            f.write(processed_bytes)

        image_url = f"/uploads/storyboard/{filename}"
        logger.info(f"💾 Saved: {image_url}")
        return image_url

    async def _enforce_aspect_ratio(self, image_bytes: bytes, target_aspect: str = "9:16") -> bytes:
        """Crop/resize image to target aspect ratio."""
        try:
            from PIL import Image
            import io

            # Aspect ratio configurations: ratio (w/h), target width, target height
            aspect_configs = {
                "9:16": {"ratio": 9 / 16, "width": 1080, "height": 1920},
                "16:9": {"ratio": 16 / 9, "width": 1920, "height": 1080},
                "1:1": {"ratio": 1.0, "width": 1080, "height": 1080},
                "4:5": {"ratio": 4 / 5, "width": 1080, "height": 1350},
                "4:3": {"ratio": 4 / 3, "width": 1440, "height": 1080},
            }

            config = aspect_configs.get(target_aspect, aspect_configs["9:16"])
            target_ratio = config["ratio"]
            target_size = (config["width"], config["height"])

            # Open image
            img = Image.open(io.BytesIO(image_bytes))
            width, height = img.size
            current_ratio = width / height

            logger.info(f"📐 Original image: {width}x{height} (ratio: {current_ratio:.3f}), target ratio: {target_ratio:.3f}")

            # Check if already correct aspect ratio (within 5% tolerance)
            if abs(current_ratio - target_ratio) / target_ratio < 0.05:
                logger.info("✅ Image already has correct aspect ratio")
                return image_bytes

            # Need to crop to target ratio
            if current_ratio > target_ratio:
                # Image is too wide, crop width
                new_width = int(height * target_ratio)
                left = (width - new_width) // 2
                img = img.crop((left, 0, left + new_width, height))
                logger.info(f"✂️ Cropped width: {width} -> {new_width}")
            else:
                # Image is too tall (or square for 9:16), crop height
                new_height = int(width / target_ratio)
                top = (height - new_height) // 2
                img = img.crop((0, top, width, top + new_height))
                logger.info(f"✂️ Cropped height: {height} -> {new_height}")

            # Resize to target dimensions
            img = img.resize(target_size, Image.Resampling.LANCZOS)
            logger.info(f"📏 Resized to: {target_size[0]}x{target_size[1]}")

            # Save to bytes
            output = io.BytesIO()
            img.save(output, format='PNG', optimize=True)
            return output.getvalue()

        except ImportError:
            logger.warning("PIL not installed - cannot enforce aspect ratio")
            return image_bytes
        except Exception as e:
            logger.warning(f"Failed to enforce aspect ratio: {e}")
            return image_bytes

    @staticmethod
    def _mock_storyboard(script: Script) -> list[dict[str, str]]:
        """Return mock storyboard (no API key)."""
        return [
            {
                "scene_number": str(scene.scene_number),
                "image_url": f"https://placehold.co/576x1024/6366f1/white?text=Scene+{scene.scene_number}",
                "prompt": f"Mock: {scene.description[:80]}",
            }
            for scene in script.scenes
        ]
