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
        reference_images_by_angle: dict[str, str] | None = None,
        product_name: str | None = None,
        product_images: list[str] | None = None,
        product_dna: dict | None = None,
        aspect_ratio: str = "9:16",
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

                # Build comprehensive prompt for this scene
                prompt = self._build_comprehensive_prompt(
                    scene=scene,
                    avatar_dna=avatar_dna,
                    product_name=product_name,
                    product_dna=product_dna,
                    style_notes=script.style_notes,
                    aspect_ratio=aspect_ratio,
                )

                # Generate image with per-scene reference images
                image_url = await self._generate_scene_image(
                    scene_number=scene.scene_number,
                    prompt=prompt,
                    avatar_images=scene_avatar_images,
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

                response = self._client.models.generate_content(
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
    ) -> str:
        """Build a focused prompt with character identity, product details, and scene context.

        Kept concise so Gemini pays maximum attention to reference images.
        """

        parts = []

        # --- Scene context (compact) ---
        parts.extend([
            f"SCENE: {scene.scene_type} | {scene.location}",
            f"Description: {scene.description}",
            f"Action: {scene.character_action}",
            f"Emotion/Dialogue context (NOT text): \"{scene.dialogue}\"",
            f"Camera: {scene.camera_setup.shot_type}, {scene.camera_setup.angle}, {scene.camera_setup.lens}",
            f"Lighting: {scene.lighting_setup.type}, {scene.lighting_setup.direction}, {scene.lighting_setup.color_temp}K",
            "",
        ])

        # --- Character identity (essential for consistency) ---
        if avatar_dna:
            gender = getattr(avatar_dna, 'gender', '') or ''
            if not gender:
                combined = f"{avatar_dna.face} {avatar_dna.body}".lower()
                if any(w in combined for w in ['female', 'woman', 'feminine']):
                    gender = "FEMALE"
                elif any(w in combined for w in ['male', 'man', 'masculine']):
                    gender = "MALE"

            ethnicity = getattr(avatar_dna, 'ethnicity', '') or 'as in reference'
            age_range = getattr(avatar_dna, 'age_range', '') or 'as in reference'

            parts.extend([
                "CHARACTER IDENTITY (LOCKED — must match reference images exactly):",
                f"  Gender: {gender} | Ethnicity: {ethnicity} | Age: {age_range}",
                f"  Face: {avatar_dna.face}",
                f"  Eyes: {avatar_dna.eyes}",
                f"  Skin: {avatar_dna.skin}",
                f"  Hair: {avatar_dna.hair}",
                f"  Body: {avatar_dna.body}",
                f"  Wardrobe: {avatar_dna.wardrobe}",
            ])

            if avatar_dna.prohibited_drift:
                parts.append(f"  NEVER: {avatar_dna.prohibited_drift}")

            parts.append("")

        # --- Product details ---
        if product_name:
            visibility = scene.product_visibility.value if hasattr(scene.product_visibility, 'value') else str(scene.product_visibility)
            parts.append(f"PRODUCT: {product_name} (visibility: {visibility})")

            if product_dna:
                dna_bits = []
                if product_dna.get("product_type"):
                    dna_bits.append(f"type={product_dna['product_type']}")
                colors = product_dna.get("colors", {})
                if colors:
                    c = [f"{k}:{v}" for k, v in colors.items() if v]
                    if c:
                        dna_bits.append(f"colors=[{', '.join(c)}]")
                for key in ["shape", "texture", "size_category"]:
                    if product_dna.get(key):
                        dna_bits.append(f"{key}={product_dna[key]}")
                if product_dna.get("materials"):
                    mats = product_dna["materials"]
                    dna_bits.append(f"materials={', '.join(mats) if isinstance(mats, list) else mats}")
                if product_dna.get("distinctive_features"):
                    df = product_dna["distinctive_features"]
                    dna_bits.append(f"features={', '.join(df) if isinstance(df, list) else df}")
                if product_dna.get("branding_text"):
                    bt = product_dna["branding_text"]
                    dna_bits.append(f"branding={', '.join(bt) if isinstance(bt, list) else bt}")
                if product_dna.get("visual_description"):
                    dna_bits.append(f"looks={product_dna['visual_description']}")
                if product_dna.get("prohibited_variations"):
                    pv = product_dna["prohibited_variations"]
                    dna_bits.append(f"NEVER={', '.join(pv) if isinstance(pv, list) else pv}")
                if dna_bits:
                    parts.append(f"  Product DNA: {'; '.join(dna_bits)}")

            parts.extend([
                "  Match product reference images exactly: shape, colors, branding, proportions, materials.",
                "",
            ])

        # --- Style ---
        if style_notes:
            parts.append(f"Style: {style_notes}")
            parts.append("")

        # --- Aspect ratio ---
        aspect_info = self._get_aspect_ratio_info(aspect_ratio)
        parts.append(f"Aspect ratio: {aspect_info['ratio']} ({aspect_info['orientation']}, {aspect_info['width']}x{aspect_info['height']})")

        return "\n".join(parts)

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
