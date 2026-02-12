import logging

from app.models.schemas import AvatarDNA, Script, ScriptScene
from app.config import settings
from app.agents.prompt_engineering_agent import PromptEngineeringAgent

logger = logging.getLogger(__name__)

_MASTER_TEMPLATE = """\
Generate a photorealistic vertical (9:16) video frame.

SCENE: {scene_description}
LOCATION: {location}
DIALOGUE: "{dialogue}"

CAMERA:
  Angle: {camera_angle}
  Movement: {camera_movement}
  Framing: {camera_framing}

LIGHTING: {lighting}

{character_block}

{product_block}

STYLE: {style_notes}

Requirements:
- Authentic UGC / iPhone-quality aesthetic
- Shallow depth of field
- Natural skin tones, no over-processing
- Vertical 9:16 format
"""

_PRODUCT_FIDELITY_TEMPLATE = """\
🚨 CRITICAL PRODUCT REQUIREMENTS - PIXEL-PERFECT REPRODUCTION MANDATORY 🚨

PRODUCT REFERENCE: {product_name}

ABSOLUTE CONSTRAINTS (ZERO TOLERANCE FOR DEVIATION):
1. COLOR FIDELITY - EXACT MATCH REQUIRED
   ❌ DO NOT alter, shift, saturate, or modify ANY product colors
   ✅ Reproduce colors EXACTLY as shown in reference image
   ✅ Maintain exact color temperature, saturation, and hue

2. TEXT & LABELS - PIXEL-PERFECT REPRODUCTION
   ❌ DO NOT change, rephrase, translate, or recreate ANY text
   ❌ DO NOT use generic labels, placeholder text, or AI-generated text
   ✅ Copy ALL visible text EXACTLY character-for-character from reference
   ✅ Preserve font style, size, spacing, and placement EXACTLY

3. PACKAGING & DESIGN - ZERO MODIFICATIONS
   ❌ DO NOT redesign, simplify, or alter packaging shape/structure
   ❌ DO NOT remove, add, or modify logos, graphics, or design elements
   ✅ Replicate exact bottle/container shape, cap design, and proportions
   ✅ Maintain exact placement of all visual elements

4. BRAND IDENTITY - ABSOLUTE PRESERVATION
   ❌ DO NOT create fictional brands, generic versions, or alternatives
   ❌ DO NOT blur, obscure, or censor brand elements
   ✅ Reproduce exact brand name, logo, and trademark elements
   ✅ Maintain brand color palette and visual identity EXACTLY

5. NATURAL PRODUCT INTERACTION
   ✅ Show product being held naturally in hand (NOT floating)
   ✅ Natural hand placement - fingers gently gripping, not awkward
   ✅ Product label facing camera when relevant
   ✅ Realistic lighting interaction with product surface
   ✅ Natural shadows and reflections

VERIFICATION CHECKLIST:
□ Product colors match reference image 100%
□ ALL text is identical to reference (not recreated)
□ Packaging shape and design are pixel-perfect
□ Brand elements are exactly reproduced
□ Product looks professionally photographed but naturally held
□ NO AI hallucinations or creative interpretations

⚠️ FAILURE MODES TO AVOID:
- Generic "skincare bottle" instead of exact product
- Simplified labels with AI-generated text
- Color-shifted versions (warmer/cooler than reference)
- Redesigned packaging or caps
- Blurred or obscured brand names
- Unnatural product positioning (floating, awkward angles)

CRITICAL: Reference image IS the ground truth. Match it EXACTLY.
"""


class ScenePromptAgent:
    """Builds detailed scene-level prompts for image and video generation models.

    Takes a Script and optional AvatarDNA, then produces one rich prompt per scene
    that can be fed directly into Gemini image generation or Veo video generation.

    Uses PromptEngineeringAgent to enforce strict prompting guidelines and
    avoid common AI artifacts like unnatural hands, duplicate products, etc.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._prompt_engineer = PromptEngineeringAgent()

    def generate_scene_prompts(
        self,
        script: Script,
        avatar_dna: AvatarDNA | None = None,
        product_name: str | None = None,
        product_images: list[str] | None = None,
    ) -> list[str]:
        """Generate a detailed prompt for each scene in the script.

        Args:
            script: The video script.
            avatar_dna: Optional character DNA for visual consistency.
            product_name: Optional product name for fidelity constraints.
            product_images: Optional product reference images.

        Returns:
            List of prompt strings, one per scene.
        """
        prompts: list[str] = []
        for scene in script.scenes:
            prompt = self._build_prompt(
                scene,
                avatar_dna,
                script.style_notes,
                product_name,
                product_images
            )
            prompts.append(prompt)
        return prompts

    def _build_prompt(
        self,
        scene: ScriptScene,
        avatar_dna: AvatarDNA | None,
        style_notes: str,
        product_name: str | None = None,
        product_images: list[str] | None = None,
    ) -> str:
        # Use structured camera setup data
        camera = scene.camera_setup
        camera_description = f"{camera.shot_type.replace('_', ' ')}, {camera.angle.replace('_', ' ')} angle"
        if camera.movement and camera.movement != "static":
            camera_description += f", {camera.movement.replace('_', ' ')} movement"
        camera_description += f" ({camera.body} with {camera.lens})"

        # Use structured lighting setup data
        lighting_setup = scene.lighting_setup
        lighting = (
            f"{lighting_setup.type.replace('_', ' ')} lighting setup, "
            f"{lighting_setup.direction.replace('_', ' ')} direction, "
            f"{lighting_setup.color_temp}K color temperature, "
            f"key: {lighting_setup.key_intensity}, fill: {lighting_setup.fill_intensity}, rim: {lighting_setup.rim_intensity}"
        )

        character_block = self._build_character_block(avatar_dna) if avatar_dna else "No specific character -- use a generic presenter."
        product_block = self._build_product_block(product_name, product_images) if product_name or product_images else ""

        # Build base prompt
        base_prompt = _MASTER_TEMPLATE.format(
            scene_description=scene.description,
            location=scene.location,
            dialogue=scene.dialogue,
            camera_angle=camera.shot_type.replace('_', ' '),
            camera_movement=camera.movement.replace('_', ' '),
            camera_framing=camera_description,
            lighting=lighting,
            character_block=character_block,
            product_block=product_block,
            style_notes=style_notes or "Natural, authentic UGC style",
        )

        # Enhance with strict anti-artifact constraints
        avatar_dict = None
        if avatar_dna:
            avatar_dict = {
                'face': avatar_dna.face,
                'skin': avatar_dna.skin,
                'eyes': avatar_dna.eyes,
                'hair': avatar_dna.hair,
                'body': avatar_dna.body,
                'wardrobe': avatar_dna.wardrobe,
            }

        product_dict = None
        if product_name:
            product_dict = {'name': product_name}

        enhanced_prompt = self._prompt_engineer.enhance_scene_prompt(
            raw_prompt=base_prompt,
            avatar_dna=avatar_dict,
            product_dna=product_dict,
        )

        return enhanced_prompt

    @staticmethod
    def _build_character_block(dna: AvatarDNA) -> str:
        # Check for explicit gender field first (from new DNA extraction)
        dna_dict = dna.model_dump() if hasattr(dna, 'model_dump') else {}
        explicit_gender = dna_dict.get('gender', '').upper() if isinstance(dna_dict.get('gender'), str) else ''
        ethnicity = dna_dict.get('ethnicity', '') or ''
        age_range = dna_dict.get('age_range', '') or ''

        # If no explicit gender, detect from DNA description
        if not explicit_gender or explicit_gender not in ['FEMALE', 'MALE']:
            face_lower = dna.face.lower() if dna.face else ""
            hair_lower = dna.hair.lower() if dna.hair else ""
            body_lower = dna.body.lower() if dna.body else ""
            combined = face_lower + hair_lower + body_lower

            is_female = any(word in combined for word in
                ['woman', 'female', 'girl', 'feminine', 'she', 'her', 'lady'])
            is_male = any(word in combined for word in
                ['man', 'male', 'boy', 'masculine', 'he', 'him', 'guy'])

            explicit_gender = "FEMALE" if is_female else ("MALE" if is_male else "FEMALE")  # Default to female if unclear

        # Build CHARACTER IDENTITY LOCK header - highest priority
        character_block = f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  ⚠️  CRITICAL: CHARACTER IDENTITY LOCK - HIGHEST PRIORITY - READ FIRST  ⚠️   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  You are generating THE SAME PERSON who appears in the reference images.     ║
║  This is NOT a request for a "similar looking" person.                       ║
║  This IS a request for THE EXACT SAME INDIVIDUAL.                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

🔒 IMMUTABLE CHARACTER IDENTITY (CANNOT BE CHANGED):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ┌─ LOCKED ATTRIBUTES ─────────────────────────────────────────────────────┐
  │  GENDER: {explicit_gender} ← ABSOLUTELY IMMUTABLE                          │
  │  ETHNICITY: {ethnicity if ethnicity else 'As shown in reference'} ← NEVER CHANGE                       │
  │  AGE RANGE: {age_range if age_range else 'As shown in reference'} ← NEVER CHANGE                        │
  └─────────────────────────────────────────────────────────────────────────┘

🎭 FACE IDENTITY (MUST BE IDENTICAL TO REFERENCE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Face Structure: {dna.face}
  Skin Tone: {dna.skin}
  Eyes: {dna.eyes}
  Hair: {dna.hair}

👤 BODY & WARDROBE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Body Type: {dna.body}
  Outfit: {dna.wardrobe}

"""

        # Gender warning
        if explicit_gender == "FEMALE":
            character_block += """
🚫🚫🚫 CRITICAL GENDER CONSTRAINT - FEMALE 🚫🚫🚫
THE CHARACTER IS A WOMAN/FEMALE - THIS IS ABSOLUTE.
❌ DO NOT generate a man or male character
❌ DO NOT generate masculine features
❌ DO NOT change gender under any circumstances
✅ ONLY generate a FEMALE character with feminine features
"""
        elif explicit_gender == "MALE":
            character_block += """
🚫🚫🚫 CRITICAL GENDER CONSTRAINT - MALE 🚫🚫🚫
THE CHARACTER IS A MAN/MALE - THIS IS ABSOLUTE.
❌ DO NOT generate a woman or female character
❌ DO NOT generate feminine features
❌ DO NOT change gender under any circumstances
✅ ONLY generate a MALE character with masculine features
"""

        character_block += f"""
✅ REQUIREMENTS FOR CHARACTER CONSISTENCY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Generate THE SAME EXACT PERSON from reference images
  2. IDENTICAL facial bone structure - same jaw, cheekbones, forehead
  3. IDENTICAL eyes - same shape, size, color, spacing
  4. IDENTICAL nose - same shape, size, bridge
  5. IDENTICAL lips - same shape, fullness
  6. IDENTICAL skin tone and texture
  7. IDENTICAL hair style, color, and length
  8. Same body type and proportions

❌ ABSOLUTELY PROHIBITED (WILL FAIL CONSISTENCY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Generating a "similar looking" person instead of THE SAME person
  - Changing gender from {explicit_gender}
  - Changing ethnicity or racial features
  - Changing age appearance significantly
  - Altering facial bone structure
  - Different face shape between scenes
  - Substituting a different person entirely
  - {dna.prohibited_drift or 'Any deviation from reference images'}

🎯 CONSISTENCY CHECK: Would someone recognize this as THE EXACT SAME PERSON
   from the reference images? If NO → Regenerate until identical.
"""
        return character_block

    @staticmethod
    def _build_product_block(product_name: str | None, product_images: list[str] | None) -> str:
        """Build strict product fidelity block with reference images."""
        if not product_name and not product_images:
            return ""

        product_display_name = product_name or "Product shown in reference image"
        product_fidelity_text = _PRODUCT_FIDELITY_TEMPLATE.format(product_name=product_display_name)

        if product_images and len(product_images) > 0:
            product_fidelity_text += f"\n\nPRODUCT REFERENCE IMAGES PROVIDED: {len(product_images)} image(s)"
            product_fidelity_text += "\nUSE THESE IMAGES AS GROUND TRUTH - Match EXACTLY, pixel-for-pixel"

        return product_fidelity_text

    @staticmethod
    def _parse_camera_notes(notes: str) -> dict[str, str]:
        """Extract camera angle, movement, and framing from free-text notes."""
        result: dict[str, str] = {
            "angle": "medium",
            "movement": "static",
            "framing": "center frame",
        }
        lower = notes.lower()

        # Angle detection
        if "close-up" in lower or "closeup" in lower:
            result["angle"] = "close-up"
        elif "wide" in lower:
            result["angle"] = "wide"
        elif "medium" in lower:
            result["angle"] = "medium"
        elif "extreme close" in lower:
            result["angle"] = "extreme close-up"

        # Movement detection
        if "dolly" in lower:
            result["movement"] = "slow dolly in"
        elif "pan" in lower:
            result["movement"] = "slow pan"
        elif "tracking" in lower or "follow" in lower:
            result["movement"] = "tracking shot"
        elif "handheld" in lower:
            result["movement"] = "handheld, slight shake"
        elif "static" in lower:
            result["movement"] = "static"

        # Framing
        if "off-center" in lower or "rule of thirds" in lower:
            result["framing"] = "rule of thirds"
        elif "center" in lower:
            result["framing"] = "center frame"

        return result

    @staticmethod
    def _infer_lighting(location: str, style_notes: str) -> str:
        """Infer lighting direction from location and style notes."""
        combined = f"{location} {style_notes}".lower()

        if any(w in combined for w in ("night", "dark", "moody", "evening")):
            return "Low-key, warm practical lighting, soft shadows"
        if any(w in combined for w in ("outdoor", "sunlight", "daylight", "bright")):
            return "Natural daylight, golden hour warmth, soft diffused sunlight"
        if any(w in combined for w in ("kitchen", "bathroom", "office")):
            return "Bright overhead lighting, fill light from window"

        return "Soft natural window light, subtle fill, warm tone"
