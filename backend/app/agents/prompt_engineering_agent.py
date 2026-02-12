"""Prompt Engineering Agent for strict, artifact-free image generation.

This agent applies research-backed prompting best practices from:
- Google Imagen documentation
- Anthropic prompting guides
- OpenAI best practices
- Industry standards for avoiding AI artifacts

Key principles:
1. Subject → Context → Style structure
2. Negative prompts to exclude artifacts
3. Specific photography terminology
4. Quality modifiers for professional results
5. Strict anatomical and product fidelity constraints
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class PromptComponents:
    """Structured prompt components."""
    subject: str
    context: str
    style: str
    camera: str
    lighting: str
    quality: str
    constraints: str
    negative: str


# Comprehensive negative prompt for avoiding common AI artifacts
NEGATIVE_PROMPT_UNIVERSAL = """
blurry, pixelated, distorted, cartoon, illustration, painting, low quality,
bad anatomy, ugly, unnatural, deformed, watermark, extra limbs, fused limbs,
unrealistic, sketch, drawing, imperfect, oversaturated, grainy, noise,
out of frame, cropped, worst quality, jpeg artifacts, duplicate, morbid,
mutilated, poorly drawn, mutation, disfigured, gross proportions,
malformed, cloned, long neck, cross-eyed, asymmetrical face
""".strip().replace('\n', ' ')

# Specific negative prompts for hands/anatomy
NEGATIVE_PROMPT_ANATOMY = """
extra fingers, missing fingers, fused fingers, elongated fingers,
mutated hands, poorly drawn hands, deformed hands, extra hands,
missing arms, extra arms, disconnected limbs, webbed fingers,
claw-like fingers, unnatural hand pose, bent wrists, alien fingers,
double thumb, swollen hands, stretched hands, missing legs, extra legs,
poorly drawn feet, deformed feet
""".strip().replace('\n', ' ')

# Negative prompts for product shots
NEGATIVE_PROMPT_PRODUCT = """
duplicate product, multiple bottles, floating objects, wrong label,
incorrect branding, modified packaging, wrong colors, blurred text,
illegible label, generic product, placeholder text, AI-generated text,
wrong proportions, miniature product, oversized product, distorted shape
""".strip().replace('\n', ' ')

# Negative prompts for video/motion
NEGATIVE_PROMPT_VIDEO = """
motion blur, frame skip, temporal inconsistency, flickering,
morphing features, changing identity, warping, ghosting, artifacts,
unnatural motion, robotic movement, jerky animation, frame tearing
""".strip().replace('\n', ' ')

# Quality modifiers for professional results
QUALITY_MODIFIERS = {
    "photo": "high-quality photograph, 4K resolution, HDR, professional photography, sharp focus",
    "cinematic": "cinematic quality, film grain, professional color grading, anamorphic, high production value",
    "product": "studio quality, commercial photography, product photography, clean background, sharp details",
    "portrait": "portrait photography, shallow depth of field, bokeh, professional headshot, natural skin",
    "ugc": "authentic UGC aesthetic, iPhone quality, natural lighting, candid feel, real person",
}

# Camera and lens specifications for realism
CAMERA_SPECS = {
    "close_up": "85mm lens, f/1.8 aperture, shallow depth of field, subject isolation",
    "medium": "50mm lens, f/2.8 aperture, natural perspective, balanced composition",
    "wide": "35mm lens, f/4 aperture, environmental context, scene setting",
    "product": "macro lens 60-105mm, f/8 aperture, sharp throughout, studio lighting",
    "cinematic": "anamorphic lens, 2.39:1 aspect ratio, cinematic depth of field",
}

# Lighting setups for natural results
LIGHTING_PRESETS = {
    "natural": "soft natural window light, diffused daylight, no harsh shadows",
    "golden_hour": "warm golden hour lighting, sun low in sky, long soft shadows",
    "studio": "three-point lighting, key light at 45 degrees, fill light, rim light",
    "soft": "soft diffused lighting, even illumination, minimal shadows",
    "dramatic": "dramatic side lighting, strong shadows, high contrast",
}


class PromptEngineeringAgent:
    """Agent that engineers prompts following strict best practices.

    Ensures prompts are structured, specific, and include appropriate
    negative prompts to avoid common AI artifacts.
    """

    def __init__(self):
        """Initialize the prompt engineering agent."""
        self._quality_mode = "ugc"  # Default to UGC quality

    def engineer_image_prompt(
        self,
        scene_description: str,
        character_description: str | None = None,
        product_description: str | None = None,
        camera_type: str = "medium",
        lighting_type: str = "natural",
        quality_mode: str = "ugc",
        additional_constraints: list[str] | None = None,
    ) -> tuple[str, str]:
        """Engineer a complete prompt with positive and negative components.

        Args:
            scene_description: Main scene/action description
            character_description: Optional character DNA description
            product_description: Optional product description
            camera_type: Camera setup type (close_up, medium, wide, product)
            lighting_type: Lighting setup type (natural, golden_hour, studio, etc.)
            quality_mode: Quality preset (photo, cinematic, product, portrait, ugc)
            additional_constraints: Any additional constraints to include

        Returns:
            Tuple of (positive_prompt, negative_prompt)
        """
        components = self._build_components(
            scene_description=scene_description,
            character_description=character_description,
            product_description=product_description,
            camera_type=camera_type,
            lighting_type=lighting_type,
            quality_mode=quality_mode,
            additional_constraints=additional_constraints,
        )

        positive_prompt = self._assemble_positive_prompt(components)
        negative_prompt = self._assemble_negative_prompt(
            has_character=character_description is not None,
            has_product=product_description is not None,
        )

        return positive_prompt, negative_prompt

    def _build_components(
        self,
        scene_description: str,
        character_description: str | None,
        product_description: str | None,
        camera_type: str,
        lighting_type: str,
        quality_mode: str,
        additional_constraints: list[str] | None,
    ) -> PromptComponents:
        """Build structured prompt components."""

        # Subject - the main focus
        subject_parts = [scene_description]
        if character_description:
            subject_parts.append(f"featuring {character_description}")
        if product_description:
            subject_parts.append(f"with {product_description}")
        subject = ", ".join(subject_parts)

        # Context - environmental setting
        context = "9:16 vertical format, professional UGC video frame"

        # Style - visual style
        style = QUALITY_MODIFIERS.get(quality_mode, QUALITY_MODIFIERS["ugc"])

        # Camera specifications
        camera = CAMERA_SPECS.get(camera_type, CAMERA_SPECS["medium"])

        # Lighting setup
        lighting = LIGHTING_PRESETS.get(lighting_type, LIGHTING_PRESETS["natural"])

        # Quality modifiers
        quality = "high resolution, sharp focus, professional quality, color accurate"

        # Constraints
        constraint_parts = [
            "single cohesive frame",
            "natural human proportions",
            "anatomically correct hands with 5 fingers",
            "realistic skin texture with visible pores",
            "natural facial expressions",
        ]
        if character_description:
            constraint_parts.extend([
                "consistent character appearance",
                "same person throughout",
                "no gender changes",
                "no age changes",
            ])
        if product_description:
            constraint_parts.extend([
                "single product instance only",
                "exact product reproduction",
                "correct product colors",
                "legible product labels",
                "no duplicate products",
            ])
        if additional_constraints:
            constraint_parts.extend(additional_constraints)

        constraints = ", ".join(constraint_parts)

        return PromptComponents(
            subject=subject,
            context=context,
            style=style,
            camera=camera,
            lighting=lighting,
            quality=quality,
            constraints=constraints,
            negative="",  # Built separately
        )

    def _assemble_positive_prompt(self, components: PromptComponents) -> str:
        """Assemble the final positive prompt."""
        sections = [
            f"SUBJECT: {components.subject}",
            f"CONTEXT: {components.context}",
            f"STYLE: {components.style}",
            f"CAMERA: {components.camera}",
            f"LIGHTING: {components.lighting}",
            f"QUALITY: {components.quality}",
            f"CONSTRAINTS: {components.constraints}",
        ]
        return "\n".join(sections)

    def _assemble_negative_prompt(
        self,
        has_character: bool,
        has_product: bool,
    ) -> str:
        """Assemble the comprehensive negative prompt."""
        negative_parts = [NEGATIVE_PROMPT_UNIVERSAL]

        if has_character:
            negative_parts.append(NEGATIVE_PROMPT_ANATOMY)

        if has_product:
            negative_parts.append(NEGATIVE_PROMPT_PRODUCT)

        return ", ".join(negative_parts)

    def enhance_scene_prompt(
        self,
        raw_prompt: str,
        avatar_dna: dict | None = None,
        product_dna: dict | None = None,
    ) -> str:
        """Enhance an existing scene prompt with best practices.

        Takes a raw prompt and adds:
        - Structured formatting
        - Quality modifiers
        - Anatomical constraints
        - Product fidelity rules

        Args:
            raw_prompt: The original prompt
            avatar_dna: Optional character DNA dictionary
            product_dna: Optional product DNA dictionary

        Returns:
            Enhanced prompt string
        """
        enhanced_parts = []

        # Add the main prompt
        enhanced_parts.append(raw_prompt)

        # Add critical constraints section
        enhanced_parts.append("\n\n--- CRITICAL CONSTRAINTS ---")

        # Anatomical constraints (always include)
        enhanced_parts.append("""
ANATOMY REQUIREMENTS (STRICT):
- All humans must have exactly 5 fingers on each hand
- Hands must be naturally posed, not claw-like or webbed
- Wrists must bend naturally, not at impossible angles
- Arms must be proportional to body
- No extra limbs or fused body parts
- Natural skin texture with visible pores
- Realistic facial proportions and symmetry
""")

        # Character consistency (if avatar provided)
        if avatar_dna:
            enhanced_parts.append(f"""
CHARACTER CONSISTENCY (MANDATORY):
- This is a SINGLE PERSON - maintain exact identity across frames
- Gender: {self._detect_gender(avatar_dna)} - DO NOT CHANGE
- Face structure must remain identical
- Hair style and color must not change
- Skin tone must be consistent
- Body type must not change
- Age must remain constant
""")

        # Product fidelity (if product provided)
        if product_dna:
            enhanced_parts.append("""
PRODUCT FIDELITY (ZERO TOLERANCE):
- Show EXACTLY ONE instance of the product
- DO NOT duplicate, multiply, or create variations
- Match product colors EXACTLY to reference
- Reproduce all text/labels EXACTLY as shown
- Maintain correct product proportions
- Product must be held naturally, not floating
- No generic or placeholder products
""")

        # Quality and realism
        enhanced_parts.append("""
QUALITY STANDARDS:
- Photorealistic quality, not illustration
- 4K resolution clarity
- Natural lighting with soft shadows
- Shallow depth of field for subject isolation
- No AI artifacts, glitches, or distortions
- No watermarks, borders, or text overlays
""")

        return "\n".join(enhanced_parts)

    def _detect_gender(self, avatar_dna: dict) -> str:
        """Detect gender from avatar DNA for consistency."""
        dna_text = " ".join(str(v).lower() for v in avatar_dna.values() if v)

        female_indicators = ['woman', 'female', 'girl', 'feminine', 'she', 'her', 'lady', 'petite']
        male_indicators = ['man', 'male', 'boy', 'masculine', 'he', 'him', 'guy', 'beard', 'stubble']

        # Check for word boundaries to avoid false matches
        is_female = any(f' {word}' in f' {dna_text} ' or dna_text.startswith(word) for word in female_indicators)
        is_male = any(f' {word}' in f' {dna_text} ' or dna_text.startswith(word) for word in male_indicators)

        if is_female and not is_male:
            return "FEMALE"
        elif is_male and not is_female:
            return "MALE"
        elif is_female and is_male:
            # Both indicators found, prefer explicit ones
            return "FEMALE" if 'woman' in dna_text or 'female' in dna_text else "MALE"
        else:
            return "UNSPECIFIED - maintain consistency"

    def get_negative_prompt_for_imagen(
        self,
        include_anatomy: bool = True,
        include_product: bool = False,
        include_video: bool = False,
    ) -> str:
        """Get a comprehensive negative prompt string for Imagen 4.

        Note: Imagen 4 doesn't support separate negative prompts,
        so these should be incorporated into the main prompt as exclusions.

        Args:
            include_anatomy: Include hand/body artifact prevention
            include_product: Include product duplication prevention
            include_video: Include video artifact prevention

        Returns:
            Comma-separated negative prompt string
        """
        parts = [NEGATIVE_PROMPT_UNIVERSAL]

        if include_anatomy:
            parts.append(NEGATIVE_PROMPT_ANATOMY)
        if include_product:
            parts.append(NEGATIVE_PROMPT_PRODUCT)
        if include_video:
            parts.append(NEGATIVE_PROMPT_VIDEO)

        return ", ".join(parts)

    def format_exclusions_for_imagen4(
        self,
        exclusions: list[str],
    ) -> str:
        """Format exclusions for Imagen 4's main prompt.

        Since Imagen 4 doesn't support negative prompts,
        exclusions must be stated plainly without 'no' or 'don't'.

        Args:
            exclusions: List of things to exclude

        Returns:
            Formatted exclusion string for main prompt
        """
        # Clean exclusions - remove any "no" or "don't" prefixes
        cleaned = []
        for exc in exclusions:
            exc_clean = exc.lower()
            exc_clean = exc_clean.replace("no ", "").replace("don't ", "").replace("avoid ", "")
            cleaned.append(exc_clean.strip())

        return f"Exclude: {', '.join(cleaned)}"
