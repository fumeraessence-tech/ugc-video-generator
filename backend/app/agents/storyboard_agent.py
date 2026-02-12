"""Storyboard Generator Agent with character + product consistency.

Uses Google Imagen 4 for actual image generation via ImageService.
Uses ConsistencyService for Gemini Vision-based character scoring.
"""

import logging
import random
from google import genai

from app.models.schemas import (
    Script,
    ScriptScene,
    StoryboardFrame,
    StoryboardScene,
    Storyboard,
    AvatarDNA,
)
from app.services.image_service import ImageService
from app.services.consistency_service import ConsistencyService

logger = logging.getLogger(__name__)


class StoryboardAgent:
    """Generate storyboard images with character + product consistency using Imagen 4."""

    def __init__(self, api_key: str | None = None):
        """Initialize the storyboard agent."""
        self._api_key = api_key
        self._client = genai.Client(api_key=api_key) if api_key else None
        self._image_service = ImageService(api_key=api_key)
        self._consistency_service = ConsistencyService(api_key=api_key)

    async def generate_storyboard(
        self,
        script: Script,
        avatar_data: dict | None = None,
        avatar_reference_images: list[str] = None,
        product_images: list[str] = None,
        product_name: str | None = None,
        aspect_ratio: str = "9:16",
    ) -> Storyboard:
        """Generate complete storyboard using Imagen 4 with reference image support.

        Uses ImageService for actual image generation with:
        - imagen-4.0-fast-generate-001 for standard generation
        - imagen-4.0-fast-edit-001 for reference-guided image-to-image generation
        """
        product_images = product_images or []
        avatar_reference_images = avatar_reference_images or []

        # Convert avatar_data dict to AvatarDNA if provided
        avatar_dna = None
        if avatar_data and avatar_data.get('dna'):
            dna = avatar_data['dna']
            avatar_dna = AvatarDNA(
                gender=dna.get('gender', ''),  # CRITICAL: Explicit gender field
                face=dna.get('face', ''),
                skin=dna.get('skin', ''),
                eyes=dna.get('eyes', ''),
                hair=dna.get('hair', ''),
                body=dna.get('body', ''),
                wardrobe=dna.get('wardrobe', ''),
                voice=dna.get('voice') or '',
                prohibited_drift=dna.get('prohibited_drift') or '',
                ethnicity=dna.get('ethnicity', ''),
                age_range=dna.get('age_range', ''),
            )
            logger.info(f"Avatar DNA loaded: gender={avatar_dna.gender}, face={avatar_dna.face[:50] if avatar_dna.face else 'N/A'}...")

        # Log what we're sending
        logger.info(f"Generating storyboard for {len(script.scenes)} scenes using Imagen 4")
        logger.info(f"Product images: {len(product_images)}, Product name: {product_name}")
        logger.info(f"Avatar reference images: {len(avatar_reference_images)}")
        logger.info(f"Avatar DNA provided: {avatar_dna is not None}")

        try:
            storyboard_results = await self._image_service.generate_storyboard(
                script=script,
                avatar_dna=avatar_dna,
                avatar_reference_images=avatar_reference_images,
                product_images=product_images,
                product_name=product_name,
                aspect_ratio=aspect_ratio,
            )

            # Convert results to Storyboard format
            scenes = []
            for result in storyboard_results:
                scene_num = result.get('scene_number', '1')
                image_url = result.get('image_url', '')
                prompt = result.get('prompt', '')

                # Create a single variant for each scene (can expand to multiple later)
                variants = [
                    StoryboardFrame(
                        scene_number=scene_num,
                        variant_number=1,
                        image_url=image_url,
                        seed=random.randint(1000, 9999),
                        consistency_score=95.0,  # Will be calculated by consistency checker
                        prompt=prompt,
                    )
                ]

                scenes.append(
                    StoryboardScene(
                        scene_number=scene_num,
                        variants=variants,
                        selected_variant=1,
                        image_url=image_url,  # For convenience
                        prompt=prompt,
                    )
                )

            logger.info(f"Successfully generated {len(scenes)} storyboard scenes")
            return Storyboard(scenes=scenes)

        except Exception as e:
            logger.exception(f"Storyboard generation failed: {e}")
            # Return empty storyboard on failure
            return Storyboard(scenes=[])

    def _build_scene_prompt(
        self,
        scene: ScriptScene,
        avatar_data: dict | None,
    ) -> str:
        """Build detailed prompt for scene generation."""
        prompt_parts = [
            "Professional UGC video frame, high-quality cinematic shot",
            "",
            "SCENE DESCRIPTION:",
            f"- {scene.visual_description}",
            f"- {scene.character_action}",
            "",
        ]

        # Character details
        if avatar_data:
            prompt_parts.extend([
                "CHARACTER:",
                f"- Unique ID: {avatar_data.get('unique_identifier', 'default_character')}",
                f"- Detailed DNA: {avatar_data.get('detailed_dna', {}).get('detailed_description', 'Natural Indian creator')}",
                f"- Facial Features: {avatar_data.get('detailed_dna', {}).get('facial_features', 'Expressive, authentic')}",
                "- Natural skin texture with visible pores, NO plastic/waxy appearance",
                "- Authentic expressions, genuine emotion",
                "",
            ])

        # Camera setup
        camera = scene.camera_setup
        prompt_parts.extend([
            "CAMERA SETUP:",
            f"- Body: {camera.body}",
            f"- Lens: {camera.lens}",
            f"- Shot Type: {camera.shot_type}",
            f"- Angle: {camera.angle}",
            f"- Movement: {camera.movement}",
            f"- Focus: {camera.focus}",
            "",
        ])

        # Lighting setup
        lighting = scene.lighting_setup
        prompt_parts.extend([
            "LIGHTING:",
            f"- Type: {lighting.type}",
            f"- Direction: {lighting.direction}",
            f"- Color Temperature: {lighting.color_temp}K",
            f"- Key Light: {lighting.key_intensity}",
            f"- Fill Light: {lighting.fill_intensity}",
            f"- Rim Light: {lighting.rim_intensity}",
            "",
        ])

        # Background
        prompt_parts.extend([
            "BACKGROUND:",
            f"- Setting: {scene.background_setting.value}",
            f"- {self._get_background_atmosphere(scene.background_setting.value)}",
            "",
        ])

        # Product visibility
        if scene.product_visibility.value != "none":
            prompt_parts.extend([
                "PRODUCT:",
                f"- Visibility: {scene.product_visibility.value} prominence",
                f"- Product naturally positioned in frame",
                f"- {self._get_product_placement_note(scene.product_visibility.value)}",
                "",
            ])

        prompt_parts.extend([
            "QUALITY:",
            "- Cinematic quality, 4K resolution",
            "- Professional UGC content aesthetic",
            "- Authentic, natural feel",
            "- Proper depth of field and bokeh",
        ])

        return "\n".join(prompt_parts)

    def _build_negative_prompt(self) -> str:
        """Build negative prompt to avoid AI artifacts."""
        return (
            "plastic skin, waxy texture, AI artifacts, unnatural proportions, "
            "floating objects, distorted hands, distorted face, unrealistic camera angles, "
            "oversaturated colors, generic stock photo look, inconsistent character features, "
            "fake expressions, artificial lighting, motion blur, blurry, low quality, "
            "watermark, text overlay, border"
        )

    def _get_background_atmosphere(self, setting: str) -> str:
        """Get atmospheric description for background setting."""
        atmospheres = {
            "modern_bedroom": "Cozy, intimate, warm natural light through window, soft shadows",
            "kitchen": "Bright, clean, modern, overhead lighting, organized space",
            "office": "Professional, focused, desk lamp lighting, neutral tones",
            "car": "Interior vehicle shot, natural window light, comfortable space",
            "outdoor": "Golden hour lighting, natural bokeh, soft sunlight, organic",
            "custom": "User-defined atmosphere with appropriate mood lighting",
        }
        return atmospheres.get(setting, "Natural lighting, authentic environment")

    def _get_product_placement_note(self, visibility: str) -> str:
        """Get product placement note based on visibility level."""
        notes = {
            "primary": "Product is main focal point, held or prominently displayed",
            "secondary": "Product visible in frame but not main focus, naturally integrated",
            "background": "Product visible but subtle, part of environment",
        }
        return notes.get(visibility, "Product naturally placed in scene")

    async def calculate_consistency_score(
        self,
        image_url: str,
        avatar_data: dict | None,
        reference_images: list[bytes] | None = None,
    ) -> float:
        """Calculate character consistency score using Gemini Vision via ConsistencyService."""
        if not self._api_key or not avatar_data:
            return 85.0  # Default score when no API key or avatar

        try:
            # Load the generated image
            import httpx
            from pathlib import Path

            image_data: bytes | None = None
            if image_url.startswith('/uploads/'):
                backend_dir = Path(__file__).resolve().parents[2]
                frontend_dir = backend_dir.parent / "frontend"
                file_path = frontend_dir / "public" / image_url.lstrip('/')
                if file_path.exists():
                    image_data = file_path.read_bytes()
            elif image_url.startswith('http'):
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(image_url)
                    resp.raise_for_status()
                    image_data = resp.content

            if not image_data:
                logger.warning(f"Could not load image for scoring: {image_url}")
                return 80.0

            # Build character DNA dict for the consistency service
            character_dna = avatar_data if isinstance(avatar_data, dict) else None

            result = await self._consistency_service.score_character_consistency(
                image_data=image_data,
                reference_images=reference_images or [],
                character_dna=character_dna,
            )

            score = result.get("score", 0.80) * 100  # Convert 0-1 to 0-100
            logger.info(f"Consistency score for {image_url}: {score:.1f} ({result.get('rating', 'unknown')})")
            return score

        except Exception as e:
            logger.error(f"Consistency scoring failed: {e}")
            return 75.0
