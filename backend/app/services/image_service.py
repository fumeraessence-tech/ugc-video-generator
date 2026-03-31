"""Image generation service using Imagen 4 with reference images for consistency."""

import asyncio
import io
import logging
import uuid
from pathlib import Path

from google import genai
from google.genai import types

from app.models.schemas import AvatarDNA, Script, ScriptScene
from app.config import settings

# Max reference image size in bytes (500KB) — larger images are compressed to JPEG
MAX_REF_IMAGE_BYTES = 500_000

logger = logging.getLogger(__name__)

# Imagen 4 model - use fast for speed, regular for quality
IMAGEN_MODEL = "imagen-4.0-fast-generate-001"

# iPhone camera specifications for authentic UGC prompts
IPHONE_CAMERA_SPECS = {
    "iphone_16_pro_max": {
        "label": "iPhone 16 Pro Max",
        "main_lens": "24mm f/1.78",
        "sensor": "48MP 1/1.28\" quad-pixel sensor",
        "features": "Sensor-shift OIS, Photonic Engine, Smart HDR 5, ProRes, Log",
        "style_note": "Slight computational sharpening, natural skin smoothing, visible lens flare in backlight",
    },
    "iphone_16_pro": {
        "label": "iPhone 16 Pro",
        "main_lens": "24mm f/1.78",
        "sensor": "48MP 1/1.28\" quad-pixel sensor",
        "features": "Sensor-shift OIS, Photonic Engine, Smart HDR 5",
        "style_note": "Slight computational sharpening, natural skin smoothing, visible lens flare in backlight",
    },
    "iphone_15_pro": {
        "label": "iPhone 15 Pro",
        "main_lens": "24mm f/1.78",
        "sensor": "48MP 1/1.22\" quad-pixel sensor",
        "features": "Sensor-shift OIS, Photonic Engine, Smart HDR 4",
        "style_note": "Slight computational sharpening, Apple color science warmth, mild lens distortion at edges",
    },
    "iphone_15": {
        "label": "iPhone 15",
        "main_lens": "26mm f/1.6",
        "sensor": "48MP 1/1.56\" sensor",
        "features": "OIS, Photonic Engine, Smart HDR 4",
        "style_note": "Noticeable computational processing, slightly more noise in low light, warmer tones",
    },
    "iphone_14": {
        "label": "iPhone 14",
        "main_lens": "26mm f/1.5",
        "sensor": "12MP 1/1.7\" sensor",
        "features": "Sensor-shift OIS, Photonic Engine",
        "style_note": "More visible noise grain, softer details, classic iPhone look, less computational sharpness",
    },
}


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
        reference_images_by_angle: dict[str, str] | None = None,
        product_name: str | None = None,
        product_images: list[str] | None = None,
        product_dna: dict | None = None,
        aspect_ratio: str = "9:16",
        camera_device: str = "iphone_16_pro_max",
    ) -> list[dict[str, str]]:
        """Generate storyboard images with avatar + product reference images.

        Args:
            script: The video script with scenes.
            avatar_dna: Character DNA for detailed prompts.
            avatar_reference_images: Avatar/character reference images for consistency.
            reference_images_by_angle: Angle-to-URL mapping for per-scene ref selection.
            product_name: Product name for the prompt.
            product_images: Product reference images for consistency.
            product_dna: ProductDNA dict with detailed visual attributes.
            aspect_ratio: Target aspect ratio ("9:16", "16:9", "1:1", "4:5"). Default: "9:16"
            camera_device: Camera device key from IPHONE_CAMERA_SPECS, or empty for cinema look. Default: "iphone_16_pro_max"

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

        # Pre-load all unique reference image URLs into a cache to avoid repeated I/O
        _image_cache: dict[str, dict | None] = {}

        async def _load_cached(url: str) -> dict | None:
            if url not in _image_cache:
                _image_cache[url] = await self._load_image(url)
            return _image_cache[url]

        # Pre-load all angle-based reference URLs
        all_ref_urls: list[str] = list(avatar_reference_images[:4])
        if reference_images_by_angle:
            for url in reference_images_by_angle.values():
                if url not in all_ref_urls:
                    all_ref_urls.append(url)

        for url in all_ref_urls:
            await _load_cached(url)

        # Pre-load product images
        product_images_loaded = await self._load_all_images(product_images[:3])

        # Default avatar images (used when no angle-based selection available)
        default_avatar_loaded = [
            _image_cache[url] for url in avatar_reference_images[:4]
            if url in _image_cache and _image_cache[url] and _image_cache[url].get("bytes")
        ]

        # --- Image load failure detection ---
        total_avatar_requested = len(avatar_reference_images[:4])
        total_avatar_loaded = len(default_avatar_loaded)
        total_product_requested = len(product_images[:3])
        total_product_loaded = len(product_images_loaded)

        failed_avatar_urls = [
            url for url in avatar_reference_images[:4]
            if url not in _image_cache or not _image_cache.get(url) or not _image_cache[url].get("bytes")
        ]
        failed_product_urls = [
            url for url in product_images[:3]
            if url not in [img.get("_source_url") for img in product_images_loaded]
        ]

        if failed_avatar_urls:
            logger.error(
                f"🚨 AVATAR REF LOAD FAILURES: {len(failed_avatar_urls)}/{total_avatar_requested} failed! "
                f"Failed URLs: {failed_avatar_urls}"
            )
        if total_avatar_requested > 0 and total_avatar_loaded == 0:
            logger.error(
                "🚨 CRITICAL: ZERO avatar reference images loaded! "
                "Character consistency will be IMPOSSIBLE. "
                "Check that avatar image URLs are accessible."
            )

        if total_product_requested > 0 and total_product_loaded == 0:
            logger.error(
                "🚨 CRITICAL: ZERO product reference images loaded! "
                "Product consistency will be IMPOSSIBLE. "
                "Check that product image URLs are accessible."
            )

        logger.info(
            f"✅ Pre-loaded refs: "
            f"avatar {total_avatar_loaded}/{total_avatar_requested}, "
            f"product {total_product_loaded}/{total_product_requested}, "
            f"cache total {len(_image_cache)} unique URLs"
        )

        results: list[dict[str, str]] = []

        for scene in script.scenes:
            try:
                # Per-scene angle-aware reference selection
                if reference_images_by_angle:
                    scene_ref_urls = self._select_scene_references(
                        camera_angle=scene.camera_setup.angle,
                        reference_images_by_angle=reference_images_by_angle,
                        fallback_images=avatar_reference_images[:4],
                        max_refs=4,
                    )
                    scene_avatar_images = [
                        _image_cache[url] for url in scene_ref_urls
                        if url in _image_cache and _image_cache[url] and _image_cache[url].get("bytes")
                    ]
                    logger.info(
                        f"🎯 Scene {scene.scene_number}: angle='{scene.camera_setup.angle}', "
                        f"selected {len(scene_avatar_images)} angle-matched refs from {len(scene_ref_urls)} URLs"
                    )
                else:
                    scene_avatar_images = default_avatar_loaded

                # Per-scene product images (may be overridden for B-roll)
                scene_product_images = product_images_loaded

                # B-roll: skip avatar refs, conditionally skip product refs
                if scene.is_broll:
                    scene_avatar_images = []
                    if scene.broll_type in ("environment", "transition"):
                        scene_product_images = []
                    logger.info(
                        f"🎬 Scene {scene.scene_number}: B-ROLL ({scene.broll_type}) — "
                        f"avatar refs: {len(scene_avatar_images)}, product refs: {len(scene_product_images)}"
                    )

                # Build comprehensive prompt for this scene
                prompt = self._build_comprehensive_prompt(
                    scene=scene,
                    avatar_dna=avatar_dna,
                    product_name=product_name,
                    product_dna=product_dna,
                    style_notes=script.style_notes,
                    aspect_ratio=aspect_ratio,
                    camera_device=camera_device,
                    is_broll=scene.is_broll,
                    broll_type=scene.broll_type.value if scene.broll_type else None,
                )

                # Generate image with per-scene reference images
                image_url = await self._generate_scene_image(
                    scene_number=scene.scene_number,
                    prompt=prompt,
                    avatar_images=scene_avatar_images,
                    product_images=scene_product_images,
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

    async def generate_storyboard_streaming(
        self,
        script: Script,
        avatar_dna: AvatarDNA | None = None,
        avatar_reference_images: list[str] | None = None,
        reference_images_by_angle: dict[str, str] | None = None,
        product_name: str | None = None,
        product_images: list[str] | None = None,
        product_dna: dict | None = None,
        aspect_ratio: str = "9:16",
        camera_device: str = "iphone_16_pro_max",
    ):
        """Async generator: yields one scene result dict as each image is generated.

        Yields dicts with: scene_number, image_url, prompt, scene_index, total_scenes
        """
        if self._client is None:
            logger.warning("No Gemini API key -- returning mock storyboard (streaming)")
            for i, result in enumerate(self._mock_storyboard(script)):
                yield {**result, "scene_index": i, "total_scenes": len(script.scenes)}
            return

        avatar_reference_images = avatar_reference_images or []
        product_images = product_images or []
        total = len(script.scenes)

        # Pre-load all unique reference image URLs into a cache
        _image_cache: dict[str, dict | None] = {}

        async def _load_cached(url: str) -> dict | None:
            if url not in _image_cache:
                _image_cache[url] = await self._load_image(url)
            return _image_cache[url]

        all_ref_urls: list[str] = list(avatar_reference_images[:4])
        if reference_images_by_angle:
            for url in reference_images_by_angle.values():
                if url not in all_ref_urls:
                    all_ref_urls.append(url)

        for url in all_ref_urls:
            await _load_cached(url)

        product_images_loaded = await self._load_all_images(product_images[:3])

        default_avatar_loaded = [
            _image_cache[url] for url in avatar_reference_images[:4]
            if url in _image_cache and _image_cache[url] and _image_cache[url].get("bytes")
        ]

        logger.info(
            f"✅ [stream] Pre-loaded refs: avatar {len(default_avatar_loaded)}/{len(avatar_reference_images[:4])}, "
            f"product {len(product_images_loaded)}/{len(product_images[:3])}"
        )

        # Prepare scene data upfront (prompts, refs) so we can parallelize API calls
        scene_tasks: list[dict] = []
        for scene_index, scene in enumerate(script.scenes):
            if reference_images_by_angle:
                scene_ref_urls = self._select_scene_references(
                    camera_angle=scene.camera_setup.angle,
                    reference_images_by_angle=reference_images_by_angle,
                    fallback_images=avatar_reference_images[:4],
                    max_refs=4,
                )
                scene_avatar_images = [
                    _image_cache[url] for url in scene_ref_urls
                    if url in _image_cache and _image_cache[url] and _image_cache[url].get("bytes")
                ]
            else:
                scene_avatar_images = default_avatar_loaded

            scene_product_images = product_images_loaded

            if scene.is_broll:
                scene_avatar_images = []
                if scene.broll_type in ("environment", "transition"):
                    scene_product_images = []

            prompt = self._build_comprehensive_prompt(
                scene=scene,
                avatar_dna=avatar_dna,
                product_name=product_name,
                product_dna=product_dna,
                style_notes=script.style_notes,
                aspect_ratio=aspect_ratio,
                camera_device=camera_device,
                is_broll=scene.is_broll,
                broll_type=scene.broll_type.value if scene.broll_type else None,
            )

            scene_tasks.append({
                "scene_index": scene_index,
                "scene_number": scene.scene_number,
                "prompt": prompt,
                "avatar_images": scene_avatar_images,
                "product_images": scene_product_images,
            })

        # Generate scenes in parallel batches of 3 to avoid Gemini rate limits
        BATCH_SIZE = 3
        for batch_start in range(0, len(scene_tasks), BATCH_SIZE):
            batch = scene_tasks[batch_start:batch_start + BATCH_SIZE]

            async def _generate_one(task: dict) -> dict:
                try:
                    image_url = await self._generate_scene_image(
                        scene_number=task["scene_number"],
                        prompt=task["prompt"],
                        avatar_images=task["avatar_images"],
                        product_images=task["product_images"],
                        aspect_ratio=aspect_ratio,
                    )
                    logger.info(f"✅ [stream] Scene {task['scene_number']} generated: {image_url}")
                    return {
                        "scene_number": str(task["scene_number"]),
                        "image_url": image_url or "",
                        "prompt": task["prompt"],
                        "scene_index": task["scene_index"],
                        "total_scenes": total,
                    }
                except Exception as e:
                    logger.exception(f"❌ [stream] Scene {task['scene_number']} failed: {e}")
                    return {
                        "scene_number": str(task["scene_number"]),
                        "image_url": "",
                        "prompt": f"Error: {e}",
                        "scene_index": task["scene_index"],
                        "total_scenes": total,
                        "error": str(e),
                    }

            results = await asyncio.gather(*[_generate_one(t) for t in batch])
            # Yield results sorted by scene_index within each batch
            for result in sorted(results, key=lambda r: r["scene_index"]):
                yield result

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
        avatar_parts_count = 0
        product_parts_count = 0

        # Add avatar reference images
        for i, img_data in enumerate(avatar_images):
            if img_data and img_data.get("bytes"):
                ref_part = types.Part.from_bytes(
                    data=img_data["bytes"],
                    mime_type=img_data.get("mime_type", "image/jpeg")
                )
                reference_parts.append(ref_part)
                avatar_parts_count += 1
                logger.info(f"   Added avatar reference {i+1} ({len(img_data['bytes'])} bytes, {img_data.get('mime_type', 'image/jpeg')})")
            else:
                logger.warning(f"   Skipped avatar reference {i+1} — no bytes")

        # Add product reference images
        for i, img_data in enumerate(product_images):
            if img_data and img_data.get("bytes"):
                ref_part = types.Part.from_bytes(
                    data=img_data["bytes"],
                    mime_type=img_data.get("mime_type", "image/jpeg")
                )
                reference_parts.append(ref_part)
                product_parts_count += 1
                logger.info(f"   Added product reference {i+1} ({len(img_data['bytes'])} bytes, {img_data.get('mime_type', 'image/jpeg')})")
            else:
                logger.warning(f"   Skipped product reference {i+1} — no bytes")

        logger.info(
            f"📎 Scene {scene_number}: {len(reference_parts)} total ref parts "
            f"({avatar_parts_count} avatar + {product_parts_count} product)"
        )

        # If we have reference images, use Gemini's multimodal generation
        if reference_parts:
            return await self._generate_with_references(
                scene_number=scene_number,
                prompt=prompt,
                reference_parts=reference_parts,
                num_avatar_refs=avatar_parts_count,
                num_product_refs=product_parts_count,
                aspect_ratio=aspect_ratio,
            )
        else:
            # No reference images available - use text-only Imagen as last resort
            logger.error(
                f"🚨 Scene {scene_number}: ZERO reference images available! "
                "Falling back to text-only Imagen — character/product consistency WILL NOT WORK."
            )
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
        """Generate image using Gemini with reference images for character/product consistency."""

        # Build a CONCISE, focused prompt. Shorter = model pays more attention to images.
        ref_labels = []
        ref_idx = 1
        if num_avatar_refs > 0:
            for i in range(num_avatar_refs):
                ref_labels.append(f"Image {ref_idx}: CHARACTER reference (clone this person exactly)")
                ref_idx += 1
        if num_product_refs > 0:
            for i in range(num_product_refs):
                ref_labels.append(f"Image {ref_idx}: PRODUCT reference (match exactly)")
                ref_idx += 1

        ref_section = "\n".join(ref_labels)

        generation_prompt = f"""REFERENCE IMAGES:
{ref_section}

TASK: Generate a photorealistic UGC video storyboard frame.

IDENTITY RULES (MANDATORY):
- The person MUST be the EXACT same individual from the character reference images
- Clone their face identically: same bone structure, eyes, nose, lips, skin tone, hair
- Do NOT generate a similar-looking person. It must be THEM — recognizable instantly
- Do NOT change ethnicity, age, gender, or skin tone
- Match the product from product references exactly: same shape, colors, branding

SCENE:
{prompt}

OUTPUT REQUIREMENTS:
- Aspect ratio: {aspect_ratio}
- Photorealistic, authentic UGC aesthetic — NOT illustrated, cartoon, or AI-looking
- Natural skin texture with pores, natural lighting with real shadows
- Hands must have exactly 5 fingers, products held naturally
- ZERO text, words, captions, watermarks, or written content of any kind"""

        models_to_try = [
            "gemini-2.5-flash-image",
            "gemini-3-pro-image-preview",
            "gemini-2.0-flash-exp-image-generation",
        ]

        for model_name in models_to_try:
            try:
                logger.info(
                    f"🎨 Trying {model_name} for scene {scene_number} "
                    f"with {len(reference_parts)} ref images "
                    f"({num_avatar_refs} avatar, {num_product_refs} product), "
                    f"prompt length: {len(generation_prompt)} chars"
                )

                content_parts = reference_parts + [types.Part.from_text(text=generation_prompt)]

                config = types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                    image_config=types.ImageConfig(
                        aspect_ratio=aspect_ratio,
                    ),
                )

                response = await asyncio.to_thread(
                    self._client.models.generate_content,
                    model=model_name,
                    contents=[types.Content(role="user", parts=content_parts)],
                    config=config,
                )

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
                logger.warning(f"❌ {model_name} failed for scene {scene_number}: {e}")
                continue

        logger.error(f"🚨 ALL Gemini models failed for scene {scene_number} — falling back to text-only Imagen (NO reference images)")
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
            response = await asyncio.to_thread(
                self._client.models.generate_images,
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

    def _select_scene_references(
        self,
        camera_angle: str,
        reference_images_by_angle: dict[str, str],
        fallback_images: list[str],
        max_refs: int = 4,
    ) -> list[str]:
        """Select best reference images for a scene based on its camera angle."""
        CAMERA_TO_REFERENCE_MAP: dict[str, list[str]] = {
            "eye_level": ["front", "three_quarter_left", "three_quarter_right"],
            "eye level": ["front", "three_quarter_left", "three_quarter_right"],
            "front": ["front", "three_quarter_left", "three_quarter_right"],
            "side": ["left_profile", "right_profile", "three_quarter_left"],
            "side_left": ["left_profile", "three_quarter_left", "front"],
            "side_right": ["right_profile", "three_quarter_right", "front"],
            "high": ["front", "three_quarter_left", "three_quarter_right"],
            "high_angle": ["front", "three_quarter_left", "three_quarter_right"],
            "low": ["front", "three_quarter_left", "three_quarter_right"],
            "low_angle": ["front", "three_quarter_left", "three_quarter_right"],
            "dutch": ["front", "three_quarter_left", "three_quarter_right"],
            "dutch_angle": ["front", "three_quarter_left", "three_quarter_right"],
            "overhead": ["front", "back"],
            "behind": ["back", "three_quarter_left", "three_quarter_right"],
            "three_quarter": ["three_quarter_left", "three_quarter_right", "front"],
            "slight_low": ["front", "three_quarter_left", "three_quarter_right"],
            "slight_high": ["front", "three_quarter_left", "three_quarter_right"],
        }

        normalized = camera_angle.lower().replace(" ", "_").replace("-", "_")
        preferred = CAMERA_TO_REFERENCE_MAP.get(
            normalized, ["front", "three_quarter_left", "three_quarter_right"]
        )

        selected: list[str] = []
        for angle in preferred:
            url = reference_images_by_angle.get(angle)
            if url and url not in selected:
                selected.append(url)
                if len(selected) >= max_refs:
                    return selected

        # Fill remaining with other available angles
        for url in reference_images_by_angle.values():
            if url not in selected:
                selected.append(url)
                if len(selected) >= max_refs:
                    return selected

        # Supplement with fallback images
        for url in fallback_images:
            if url not in selected:
                selected.append(url)
                if len(selected) >= max_refs:
                    return selected

        return selected

    def _build_comprehensive_prompt(
        self,
        scene: ScriptScene,
        avatar_dna: AvatarDNA | None,
        product_name: str | None,
        product_dna: dict | None = None,
        style_notes: str | None = None,
        aspect_ratio: str = "9:16",
        camera_device: str = "iphone_16_pro_max",
        is_broll: bool = False,
        broll_type: str | None = None,
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
            "❌ NEVER generate extra limbs, duplicate hands, or merged body parts",
            "❌ NEVER generate more than 2 hands per person — EXACTLY 2 hands total",
            "❌ NEVER generate floating or disconnected body parts",
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
        ]

        # Camera section - device-aware
        iphone_specs = IPHONE_CAMERA_SPECS.get(camera_device)
        if iphone_specs:
            # iPhone camera prompt for authentic UGC feel
            parts.extend([
                "########################################",
                f"# CAMERA — SHOT ON {iphone_specs['label'].upper()}",
                "########################################",
                f"Recording Device: {iphone_specs['label']} ({iphone_specs['sensor']})",
                f"Lens: {iphone_specs['main_lens']} — wider than cinema lenses, natural perspective",
                f"Sensor: {iphone_specs['sensor']} — smaller than cinema sensors, inherently DEEPER depth of field",
                f"Computational Photography: {iphone_specs['features']}",
                f"  - {iphone_specs['style_note']}",
                "",
                f"Shot Type: {scene.camera_setup.shot_type}",
                f"Camera Angle: {scene.camera_setup.angle}",
                "",
                "HANDHELD CHARACTERISTICS (critical for UGC authenticity):",
                "- Natural micro-shake from hand-holding phone — NOT stabilizer-smooth",
                "- Occasional slight tilt, not perfectly level — feels REAL and spontaneous",
                "- Subtle focus hunting when subject moves closer/farther",
                "- Phase-detection autofocus with natural rack-focus behavior",
                "",
                "PHONE CAMERA VISUAL SIGNATURE:",
                "- Depth of field: Moderate to deep (small phone sensor = deeper DoF than cinema)",
                "  NOT the razor-thin cinema bokeh — background slightly soft but still readable",
                "- Mild barrel distortion at frame edges (wide-angle phone lens characteristic)",
                "- Occasional lens flare from bright light sources (window, sun, ring light)",
                "- Apple color science: warm, punchy — slightly boosted saturation, lifted shadows",
                "- Subtle computational sharpening at edges, natural skin detail preservation",
                "- Clean but with subtle digital compression artifacts distinguishing from cinema",
                "",
            ])
        else:
            # Professional cinema camera prompt (ARRI/RED)
            parts.extend([
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
            ])

        parts.extend([
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
        ])

        # B-roll scenes: replace character identity with B-roll directive
        if is_broll:
            parts.extend([
                "########################################",
                "# B-ROLL SCENE DIRECTIVE",
                "########################################",
                "This is a B-ROLL insert shot — NO human character should appear.",
                "",
            ])

            # Type-specific B-roll directives
            broll_directives = {
                "product_closeup": (
                    "B-ROLL TYPE: PRODUCT CLOSE-UP\n"
                    "Extreme close-up of product — texture, label, material detail. "
                    "Macro photography. Product fills 80%+ of frame. Studio-quality product detail shot."
                ),
                "environment": (
                    "B-ROLL TYPE: ENVIRONMENT\n"
                    "Atmospheric establishing shot. Natural light, textures, mood-setting composition. "
                    "NO person visible in frame. Environmental beauty shot."
                ),
                "lifestyle_insert": (
                    "B-ROLL TYPE: LIFESTYLE INSERT\n"
                    "Product in use — anonymous hands only (NO face, NO identifiable person). "
                    "Hands interacting with product on a surface. Lifestyle detail shot."
                ),
                "transition": (
                    "B-ROLL TYPE: TRANSITION\n"
                    "Abstract visual transition — soft focus, light flare, bokeh, color wash, or texture detail. "
                    "NO person, NO product. Pure visual breather."
                ),
            }

            directive = broll_directives.get(broll_type or "", "")
            if directive:
                parts.extend([directive, ""])

        # Add detailed character DNA if available (skip for B-roll scenes)
        elif avatar_dna:
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
                "# CHARACTER IDENTITY - LOCKED (DO NOT CHANGE)",
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

            parts.extend([
                "########################################",
                "# PRODUCT SPECIFICATIONS (MUST MATCH REFERENCE IMAGES)",
                "########################################",
                f"Product Name: {product_name}",
                f"Product Visibility Level: {visibility}",
                "",
            ])

            # Inject detailed ProductDNA attributes if available
            if product_dna:
                parts.append("DETAILED PRODUCT DNA (MATCH EXACTLY):")
                if product_dna.get("product_type"):
                    parts.append(f"  - Product Type: {product_dna['product_type']}")
                colors = product_dna.get("colors", {})
                if colors:
                    color_parts = []
                    if colors.get("primary"):
                        color_parts.append(f"Primary: {colors['primary']}")
                    if colors.get("secondary"):
                        color_parts.append(f"Secondary: {colors['secondary']}")
                    if colors.get("accent"):
                        color_parts.append(f"Accent: {colors['accent']}")
                    if colors.get("packaging"):
                        color_parts.append(f"Packaging: {colors['packaging']}")
                    if color_parts:
                        parts.append(f"  - Colors: {', '.join(color_parts)}")
                if product_dna.get("shape"):
                    parts.append(f"  - Shape: {product_dna['shape']}")
                if product_dna.get("materials"):
                    mats = product_dna["materials"]
                    parts.append(f"  - Materials: {', '.join(mats) if isinstance(mats, list) else mats}")
                if product_dna.get("texture"):
                    parts.append(f"  - Surface Texture: {product_dna['texture']}")
                if product_dna.get("size_category"):
                    parts.append(f"  - Size: {product_dna['size_category']}")
                if product_dna.get("proportions"):
                    parts.append(f"  - Proportions: {product_dna['proportions']}")
                if product_dna.get("branding_text"):
                    bt = product_dna["branding_text"]
                    parts.append(f"  - Branding Text: {', '.join(bt) if isinstance(bt, list) else bt}")
                if product_dna.get("logo_description"):
                    parts.append(f"  - Logo: {product_dna['logo_description']}")
                if product_dna.get("distinctive_features"):
                    df = product_dna["distinctive_features"]
                    parts.append(f"  - Distinctive Features: {', '.join(df) if isinstance(df, list) else df}")
                if product_dna.get("visual_description"):
                    parts.append(f"  - Visual Description: {product_dna['visual_description']}")
                if product_dna.get("prohibited_variations"):
                    pv = product_dna["prohibited_variations"]
                    parts.append(f"  - PROHIBITED: {', '.join(pv) if isinstance(pv, list) else pv}")
                parts.append("")

            parts.extend([
                "PRODUCT RENDERING REQUIREMENTS:",
                "- EXACT match to reference images: shape, colors, branding, proportions",
                "- Accurate material rendering (glass, plastic, metal as appropriate)",
                "- Realistic reflections and refractions",
                "- Correct scale relative to human hands/body",
                "- Legible branding if visible in reference (but as image, NOT added text)",
                "",
            ])

            # Physical reality / human anatomy constraints — only for non-B-roll scenes
            if not is_broll:
                parts.extend([
                    "########################################",
                    "# PHYSICAL REALITY CONSTRAINTS (CRITICAL)",
                    "########################################",
                    "########################################",
                    "# HUMAN ANATOMY — STRICT RULES (ZERO TOLERANCE)",
                    "########################################",
                    "",
                    "HAND COUNT (ABSOLUTELY CRITICAL):",
                    "✓ Each person has EXACTLY 2 hands — one LEFT hand, one RIGHT hand",
                    "✓ Each hand has EXACTLY 5 fingers: 1 thumb + 4 fingers",
                    "✓ Count every visible hand in the scene — must equal exactly 2 per person",
                    "❌ NEVER generate 3 or more hands on one person",
                    "❌ NEVER generate duplicate/mirrored hands",
                    "❌ NEVER show a hand growing from the wrong position on the body",
                    "❌ NEVER merge two hands into one or show fused fingers",
                    "❌ NEVER show phantom/ghost hands or translucent extra limbs",
                    "",
                    "ARM & HAND ATTACHMENT (CRITICAL):",
                    "✓ Left hand connects to left wrist → left forearm → left elbow → left upper arm → left shoulder",
                    "✓ Right hand connects to right wrist → right forearm → right elbow → right upper arm → right shoulder",
                    "✓ Every hand must be traceable back to its shoulder through a continuous arm",
                    "✓ Arms must have natural bend at elbows — no rubber/noodle arms",
                    "❌ NEVER show a hand without a visible arm connection",
                    "❌ NEVER show arms crossing through the body unnaturally",
                    "❌ NEVER show arms bending backward at the elbow",
                    "",
                    "FINGER ANATOMY (STRICT):",
                    "✓ Thumb: Shorter, thicker, on the side of the hand, opposable",
                    "✓ Index finger: Next to thumb, used for pointing and pressing",
                    "✓ Middle finger: Longest finger",
                    "✓ Ring finger: Slightly shorter than middle",
                    "✓ Pinky: Shortest finger on the outside",
                    "✓ All fingers must have 3 visible joints (knuckles) — thumb has 2",
                    "✓ Fingernails on the TOP of each fingertip, facing outward",
                    "✓ Natural skin creases at each finger joint",
                    "❌ NEVER generate 6+ fingers, fused fingers, or stub fingers",
                    "❌ NEVER show fingers bending backward beyond natural range",
                    "❌ NEVER show fingernails on the wrong side of fingers",
                    "",
                    "########################################",
                    "# NATURAL HUMAN BEHAVIOR & MICRO-EXPRESSIONS",
                    "########################################",
                    "",
                    "FACIAL EXPRESSION REALISM (CRITICAL FOR NON-AI LOOK):",
                    "✓ Eyes must look ALIVE: natural moisture, visible blood vessels in sclera, light reflections",
                    "✓ Natural slight asymmetry in facial expression (real faces are never perfectly symmetrical)",
                    "✓ Micro-expressions matching the emotional context of the scene",
                    "✓ Natural blink-ready eyes — eyelids at natural resting position, not wide-open staring",
                    "✓ Subtle crow's feet or laugh lines when smiling — real expressions engage the whole face",
                    "✓ Mouth position matches the emotional state (slightly open when speaking, relaxed when neutral)",
                    "✓ Natural teeth visibility — imperfect, slightly varied, not a perfect white row",
                    "❌ NEVER generate a frozen/dead stare — eyes must convey life and intention",
                    "❌ NEVER generate a plastic mannequin smile — fake, symmetrical, lifeless",
                    "❌ NEVER generate perfectly uniform teeth like a dental model",
                    "❌ NEVER generate glossy/waxy skin — real skin has pores, texture, slight imperfections",
                    "",
                    "BODY LANGUAGE & POSTURE (NATURAL HUMAN MOVEMENT):",
                    "✓ Weight distribution: Body leans naturally, not perfectly centered like a mannequin",
                    "✓ Shoulder height: Naturally slightly uneven — one slightly higher than other",
                    "✓ Head tilt: Slight natural tilt matching the conversational context",
                    "✓ Neck: Visible tendons and muscles when head is turned, natural throat movement",
                    "✓ Hands at rest: Fingers naturally curled, not stiff and straight like a robot",
                    "✓ Standing/sitting: Natural slouch or lean — NOT rigid military posture",
                    "✓ Gesturing: When one hand gestures, the other hand remains in a natural resting position",
                    "❌ NEVER generate a stiff T-pose or unnatural straight posture",
                    "❌ NEVER generate both arms doing exactly the same thing (mirror effect)",
                    "❌ NEVER generate a person standing perfectly centered and symmetrical",
                    "",
                    "NATURAL OBJECT INTERACTION (CRITICAL):",
                    "✓ When holding a product: One hand grips it naturally, other hand supports OR rests naturally",
                    "✓ Product weight affects hand tension — heavier items show more grip pressure",
                    "✓ Wrist angle is comfortable and ergonomic for the action being performed",
                    "✓ Product is at a natural height relative to the body for the action",
                    "✓ If showing product to camera: Hold at chest height, arm bent at ~90°, relaxed grip",
                    "✓ If using product: Fingers positioned for the specific action (pressing, squeezing, pouring)",
                    "✓ Palm and fingers make full contact with product surface — no hover-grip",
                    "❌ NEVER show product floating or levitating near hands without contact",
                    "❌ NEVER show fingers phasing through the product",
                    "❌ NEVER show product at impossible angles relative to hand grip",
                    "❌ NEVER show both hands holding the same product in the same way (clone grip)",
                    "",
                ])

            parts.extend([
                "########################################",
                "# PRODUCT LABEL & BRANDING CONSISTENCY",
                "########################################",
                "✓ Product labels must match the reference image EXACTLY — same text, same layout, same colors",
                "✓ Label orientation must match how the product is being held/angled in the scene",
                "✓ Label text must be legible and correctly oriented (not mirrored, not upside down)",
                "✓ Brand logo position, size, and color must match reference exactly",
                "✓ If product has a cap/lid, it must match the reference color and shape",
                "✓ Product material (glass, plastic, metal) must render with correct reflections and transparency",
                "✓ Product size must remain consistent relative to human hands — check proportion against reference",
                "❌ NEVER invent new labels, text, or branding not present in the reference",
                "❌ NEVER change label colors, fonts, or layout from the reference",
                "❌ NEVER show garbled, blurry, or AI-hallucinated text on labels",
                "❌ NEVER change the product shape, size ratio, or proportions from reference",
                "❌ NEVER mirror/flip the label orientation incorrectly",
                "",
            ])

        # Anti-AI artifacts section (applies to all scenes including B-roll)
        parts.extend([
            "########################################",
            "# ANTI-AI ARTIFACTS — ELIMINATE UNCANNY VALLEY",
            "########################################",
            "This must look like a REAL photograph captured by a phone camera, NOT an AI generation.",
            "",
            "ELIMINATE THESE COMMON AI TELLS:",
            "✓ Add subtle image noise/grain matching phone camera quality",
            "✓ Include natural depth-of-field blur (background slightly soft, subject sharp)",
            "✓ Natural color grading — NOT oversaturated or HDR-looking",
            "✓ Subtle lens aberrations at frame edges (natural vignette)",
            "✓ Fabric wrinkles and folds where clothing bends at joints",
            "✓ Natural hair flyaways and stray strands (not perfectly groomed CG hair)",
            "✓ Skin imperfections: visible pores, subtle blemishes, natural color variation",
            "✓ Natural shadow softness — NOT hard CG shadows with sharp edges",
            "❌ NEVER generate overly smooth/perfect skin (AI giveaway)",
            "❌ NEVER generate perfectly symmetrical features (AI giveaway)",
            "❌ NEVER generate overly saturated colors (AI giveaway)",
            "❌ NEVER generate plasticky/waxy texture on any surface (AI giveaway)",
            "❌ NEVER generate perfectly sharp everything — real cameras have depth of field",
            "❌ NEVER generate a background that looks like a stock photo or CG environment",
            "❌ NEVER generate jewelry, accessories, or clothing details not in the reference",
            "",
        ])

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

    @staticmethod
    def _compress_image(image_bytes: bytes, mime_type: str, max_bytes: int = MAX_REF_IMAGE_BYTES) -> tuple[bytes, str]:
        """Compress an image to JPEG if it exceeds max_bytes. Returns (bytes, mime_type)."""
        if len(image_bytes) <= max_bytes:
            return image_bytes, mime_type
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(image_bytes))

            # Resize if very large (>2048px on any side)
            max_dim = 2048
            if max(img.size) > max_dim:
                img.thumbnail((max_dim, max_dim), Image.LANCZOS)

            # Convert to RGB for JPEG (drop alpha)
            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")

            # Binary search for best JPEG quality that fits under max_bytes
            quality = 85
            for q in (85, 75, 60, 45, 30):
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=q, optimize=True)
                if buf.tell() <= max_bytes:
                    quality = q
                    break
                quality = q

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            compressed = buf.getvalue()
            logger.info(
                f"🗜️ Compressed ref image: {len(image_bytes):,} → {len(compressed):,} bytes "
                f"(JPEG q={quality}, {img.size[0]}x{img.size[1]})"
            )
            return compressed, "image/jpeg"
        except Exception as e:
            logger.warning(f"Compression failed, using original: {e}")
            return image_bytes, mime_type

    async def _load_all_images(self, image_urls: list[str]) -> list[dict]:
        """Load multiple images and return list of image data dicts."""
        loaded = []
        for url in image_urls:
            img_data = await self._load_image(url)
            if img_data and img_data.get("bytes"):
                loaded.append(img_data)
        return loaded

    async def _load_image(self, image_url: str) -> dict | None:
        """Load an image from local path or URL, compressing large images for API efficiency."""
        try:
            image_bytes: bytes | None = None
            mime_type: str = "image/jpeg"

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
                    image_bytes = resp.content

            else:
                logger.warning(f"❌ Unsupported URL format: {image_url}")
                return None

            if image_bytes is None:
                return None

            original_size = len(image_bytes)
            # Compress large reference images to reduce API payload
            image_bytes, mime_type = self._compress_image(image_bytes, mime_type)
            logger.info(
                f"✅ Loaded: {image_url[:60]}... "
                f"({original_size:,} → {len(image_bytes):,} bytes, {mime_type})"
            )
            return {"bytes": image_bytes, "mime_type": mime_type}

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
