"""Product Studio image generation service.

Uses Gemini image generation models to:
1. Generate white-background ecommerce product shots (1:1)
2. Generate inspiration-based styled product shots (5 angles)
"""

import logging
import uuid
from pathlib import Path

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_FRONTEND_DIR = _BACKEND_DIR.parent / "frontend"
_UPLOADS_DIR = _FRONTEND_DIR / "public" / "uploads" / "product-studio"

MODELS_TO_TRY = [
    "gemini-2.5-flash-image",
    "gemini-3-pro-image-preview",
    "gemini-2.0-flash-exp-image-generation",
]

STYLED_ANGLES = [
    {
        "key": "hero",
        "label": "Hero Shot",
        "prompt_suffix": "Front-facing hero product shot with dramatic lighting, centered composition, clean studio backdrop.",
    },
    {
        "key": "lifestyle",
        "label": "Lifestyle",
        "prompt_suffix": "Lifestyle scene showing the product in an aspirational setting, natural light, editorial feel.",
    },
    {
        "key": "detail",
        "label": "Detail Close-up",
        "prompt_suffix": "Close-up macro shot highlighting textures, cap details, and label craftsmanship.",
    },
    {
        "key": "angle45",
        "label": "45° Angle",
        "prompt_suffix": "Product shot at a 45-degree angle, showing depth and dimension, soft shadows.",
    },
    {
        "key": "flat_lay",
        "label": "Flat Lay",
        "prompt_suffix": "Overhead flat-lay composition with complementary props, curated arrangement.",
    },
]


class ProductStudioService:
    """Generates product images using Gemini image generation."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client = genai.Client(api_key=self._api_key)

    async def generate_white_bg(
        self,
        product_name: str,
        brand_name: str,
        bottle_image_path: str | None = None,
        logo_url: str | None = None,
        aspect_ratio: str = "1:1",
    ) -> str:
        """Generate a white-background ecommerce product image.

        Returns the URL path of the saved image.
        """
        reference_parts: list[types.Part] = []

        if bottle_image_path:
            img_bytes = self._load_local_image(bottle_image_path)
            if img_bytes:
                reference_parts.append(
                    types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")
                )

        prompt = self._build_white_bg_prompt(product_name, brand_name, has_reference=bool(reference_parts))

        content_parts = reference_parts + [types.Part.from_text(text=prompt)]

        for model_name in MODELS_TO_TRY:
            try:
                logger.info("White-bg: trying %s for %s", model_name, product_name)
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
                image_url = self._extract_and_save_image(response, f"whitebg-{uuid.uuid4().hex[:8]}")
                if image_url:
                    logger.info("White-bg: %s generated for %s", model_name, product_name)
                    return image_url
                logger.warning("White-bg: %s returned no image for %s", model_name, product_name)
            except Exception as e:
                logger.warning("White-bg: %s failed for %s: %s", model_name, product_name, e)
                continue

        # Fallback to Imagen
        return await self._imagen_fallback(prompt, aspect_ratio, "whitebg")

    async def generate_styled_angle(
        self,
        product_name: str,
        brand_name: str,
        white_bg_image_path: str | None,
        inspiration_images: list[str],
        angle: dict,
        aspect_ratio: str = "1:1",
    ) -> dict:
        """Generate a single styled angle for a product.

        Returns dict with {style, label, image_url}.
        """
        reference_parts: list[types.Part] = []

        # Add the white-bg image as the primary reference
        if white_bg_image_path:
            img_bytes = self._load_local_image(white_bg_image_path)
            if img_bytes:
                reference_parts.append(
                    types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")
                )

        # Add up to 3 inspiration images as style references
        for insp_path in inspiration_images[:3]:
            img_bytes = self._load_local_image(insp_path)
            if img_bytes:
                reference_parts.append(
                    types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")
                )

        prompt = self._build_styled_prompt(product_name, brand_name, angle, has_white_bg=bool(white_bg_image_path), has_inspiration=bool(inspiration_images))

        content_parts = reference_parts + [types.Part.from_text(text=prompt)]

        for model_name in MODELS_TO_TRY:
            try:
                logger.info("Styled %s: trying %s for %s", angle["key"], model_name, product_name)
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
                image_url = self._extract_and_save_image(response, f"styled-{angle['key']}-{uuid.uuid4().hex[:8]}")
                if image_url:
                    return {"style": angle["key"], "label": angle["label"], "image_url": image_url}
                logger.warning("Styled %s: %s returned no image", angle["key"], model_name)
            except Exception as e:
                logger.warning("Styled %s: %s failed: %s", angle["key"], model_name, e)
                continue

        # Fallback
        fallback_url = await self._imagen_fallback(prompt, aspect_ratio, f"styled-{angle['key']}")
        return {"style": angle["key"], "label": angle["label"], "image_url": fallback_url}

    # ─── Private Helpers ──────────────────────────────────────────

    def _load_local_image(self, url_path: str) -> bytes | None:
        """Load image bytes from a local uploads path."""
        if url_path.startswith("/uploads/"):
            file_path = _FRONTEND_DIR / "public" / url_path.lstrip("/")
        elif url_path.startswith("http"):
            return None  # Skip remote URLs for now
        else:
            file_path = Path(url_path)

        if file_path.exists():
            return file_path.read_bytes()
        logger.warning("Image not found: %s", file_path)
        return None

    def _extract_and_save_image(self, response: types.GenerateContentResponse, prefix: str) -> str:
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
        filename = f"{prefix}.png"
        filepath = _UPLOADS_DIR / filename
        with open(filepath, "wb") as f:
            f.write(image_bytes)
        url = f"/uploads/product-studio/{filename}"
        logger.info("Saved: %s (%d bytes)", url, len(image_bytes))
        return url

    async def _imagen_fallback(self, prompt: str, aspect_ratio: str, prefix: str) -> str:
        """Fallback to Imagen text-to-image."""
        try:
            response = self._client.models.generate_images(
                model="imagen-4.0-fast-generate-001",
                prompt=prompt,
                config=types.GenerateImagesConfig(number_of_images=1, aspect_ratio=aspect_ratio),
            )
            if response.generated_images:
                image = response.generated_images[0]
                if hasattr(image, "image") and image.image and hasattr(image.image, "image_bytes") and image.image.image_bytes:
                    return self._save_image(image.image.image_bytes, f"{prefix}-{uuid.uuid4().hex[:8]}")
        except Exception as e:
            logger.exception("Imagen fallback failed: %s", e)
        return ""

    def _build_white_bg_prompt(self, product_name: str, brand_name: str, has_reference: bool) -> str:
        """Build prompt for white-background product image."""
        ref_instruction = ""
        if has_reference:
            ref_instruction = """The first image is a reference photo of the actual perfume bottle.
You MUST reproduce this EXACT bottle in the output — same shape, same color, same cap, same label.
Do NOT create a different bottle design."""

        return f"""{ref_instruction}

Generate a professional Amazon-style ecommerce product photo of "{product_name}" by {brand_name or "the brand"}.

REQUIREMENTS:
- Pure white background (#FFFFFF), no shadows, no gradient
- Product centered, filling ~70% of frame
- Crystal-clear product photography, 8K quality
- Sharp focus on every detail: bottle shape, cap, label text, liquid color
- The brand name "{brand_name}" and product name "{product_name}" must be clearly visible on the label
- No text overlays, no watermarks, no props
- Studio lighting: soft, even, no harsh shadows
- Perfect for ecommerce listing (Amazon, Shopify)

STYLE: Clean, minimal, commercial product photography. White background ecommerce standard."""

    def _build_styled_prompt(
        self,
        product_name: str,
        brand_name: str,
        angle: dict,
        has_white_bg: bool,
        has_inspiration: bool,
    ) -> str:
        """Build prompt for styled/inspiration-based product image."""
        parts = []

        if has_white_bg:
            parts.append(
                "The FIRST reference image is the white-background product photo. "
                "You MUST use this EXACT bottle design — same shape, cap, label, colors. "
                "Do NOT change the product appearance."
            )
        if has_inspiration:
            parts.append(
                "The ADDITIONAL reference images show the desired aesthetic/style. "
                "Match the mood, lighting, color palette, and composition style of these references. "
                "Replace the product in the scene with the given perfume bottle."
            )

        ref_block = "\n".join(parts)

        return f"""{ref_block}

Generate a styled product photo of "{product_name}" by {brand_name or "the brand"}.

ANGLE: {angle['label']}
{angle['prompt_suffix']}

REQUIREMENTS:
- The perfume bottle MUST be identical to the reference (same shape, cap, label, color)
- Brand name "{brand_name}" and product name "{product_name}" clearly visible on label
- High-end editorial/commercial photography quality
- No text overlays, no watermarks
- Cinematic lighting, professional composition

Generate the image now."""
