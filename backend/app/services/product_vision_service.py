"""Product Vision Service - Analyzes product images using Gemini Vision API.

This service extracts a comprehensive "Product DNA" from uploaded images,
which serves as the immutable reference for product consistency across
all generated content.
"""

import base64
import json
import logging
from pathlib import Path

import httpx
from google import genai
from google.genai import types

from app.models.product_dna import ProductDNA, ProductColors

logger = logging.getLogger(__name__)

# Vision analysis prompt - extracts comprehensive product DNA
PRODUCT_ANALYSIS_PROMPT = """You are a professional product photographer and visual analyst.
Analyze the provided product image(s) and extract a comprehensive visual DNA.

Your analysis must be PRECISE and OBJECTIVE - describe exactly what you see, not what you assume.

Analyze and return a JSON object with the following structure:

{
  "product_type": "Category of product (perfume, skincare, beverage, electronics, clothing, etc.)",
  "product_name": "Brand/product name if clearly visible on packaging, or null",
  "colors": {
    "primary": "The dominant color of the product itself",
    "secondary": "Second most prominent color, or null",
    "accent": "Any accent/highlight colors, or null",
    "packaging": "Color of packaging/container if different from product"
  },
  "shape": "Physical form description (rectangular bottle, cylindrical tube, square box, etc.)",
  "materials": ["List of visible materials: glass, plastic, metal, cardboard, fabric, etc."],
  "texture": "Surface texture: matte, glossy, frosted, textured, smooth, etc.",
  "branding_text": ["All visible text on the product - brand name, product name, taglines"],
  "logo_description": "Description of any logo or brand mark visible, or null",
  "size_category": "Estimated size relative to human hand: small, medium, large",
  "proportions": "Shape proportions: tall and slim, short and wide, cubic, etc.",
  "distinctive_features": [
    "List unique visual elements that make this product recognizable",
    "Include: patterns, embossing, special caps/closures, unique shapes, decorative elements"
  ],
  "visual_description": "A detailed 2-3 sentence prose description of the product's appearance that can be used directly in an image generation prompt. Be specific about colors, materials, shape, and distinctive features.",
  "hero_angles": ["Best angles to photograph this product: front, side, 45-degree, top-down, etc."],
  "prohibited_variations": [
    "List things that should NEVER change in generated images",
    "Include: specific colors that must remain exact, text that must not be altered, proportions that must be maintained"
  ]
}

IMPORTANT RULES:
1. Be PRECISE about colors - use specific color names (gold, champagne, navy blue, forest green)
2. If text is visible, transcribe it EXACTLY as shown
3. Note any premium/luxury indicators (heavy glass, metallic accents, embossing)
4. Identify the product's "hero features" - what makes it visually distinctive
5. The visual_description should be usable directly in an image generation prompt

Return ONLY valid JSON, no markdown formatting or additional text."""


class ProductVisionService:
    """Service for analyzing product images and extracting Product DNA."""

    def __init__(self, api_key: str | None = None):
        """Initialize the vision service.

        Args:
            api_key: Google AI API key. If not provided, uses environment variable.
        """
        from app.config import settings

        self._api_key = api_key or settings.GEMINI_API_KEY
        if not self._api_key:
            raise ValueError("GEMINI_API_KEY is required for ProductVisionService")

        self._client = genai.Client(api_key=self._api_key)

    async def analyze_product(
        self,
        image_urls: list[str],
        product_name_hint: str | None = None,
        brand_name_hint: str | None = None,
    ) -> ProductDNA:
        """Analyze product images and extract Product DNA.

        Args:
            image_urls: List of image URLs (local paths starting with /uploads/ or remote URLs)
            product_name_hint: Optional hint about product name
            brand_name_hint: Optional hint about brand name

        Returns:
            ProductDNA object with extracted visual characteristics
        """
        logger.info(f"Analyzing {len(image_urls)} product image(s)")

        # Load images
        image_parts = []
        for url in image_urls[:5]:  # Max 5 images
            image_data = await self._load_image(url)
            if image_data:
                image_parts.append(image_data)

        if not image_parts:
            raise ValueError("No valid images could be loaded for analysis")

        # Build the prompt with optional hints
        prompt = PRODUCT_ANALYSIS_PROMPT
        if product_name_hint or brand_name_hint:
            hints = []
            if product_name_hint:
                hints.append(f"Product name hint: {product_name_hint}")
            if brand_name_hint:
                hints.append(f"Brand hint: {brand_name_hint}")
            prompt += f"\n\nAdditional context: {', '.join(hints)}"

        # Build content parts for multimodal request
        contents = []

        # Add images first
        for img_data in image_parts:
            contents.append(
                types.Part.from_bytes(
                    data=img_data["bytes"],
                    mime_type=img_data["mime_type"],
                )
            )

        # Add text prompt
        contents.append(types.Part.from_text(text=prompt))

        # Call Gemini Vision
        try:
            response = self._client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=0.1,  # Low temperature for precise analysis
                    max_output_tokens=2048,
                ),
            )

            # Parse JSON response
            response_text = response.text.strip()

            # Clean up response if it has markdown code blocks
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()

            data = json.loads(response_text)

            # Build ProductDNA from response
            product_dna = ProductDNA(
                product_type=data.get("product_type", "unknown"),
                product_name=data.get("product_name") or product_name_hint,
                colors=ProductColors(
                    primary=data.get("colors", {}).get("primary", "unknown"),
                    secondary=data.get("colors", {}).get("secondary"),
                    accent=data.get("colors", {}).get("accent"),
                    packaging=data.get("colors", {}).get("packaging"),
                ),
                shape=data.get("shape", "unknown"),
                materials=data.get("materials", []),
                texture=data.get("texture"),
                branding_text=data.get("branding_text", []),
                logo_description=data.get("logo_description"),
                size_category=data.get("size_category", "medium"),
                proportions=data.get("proportions"),
                distinctive_features=data.get("distinctive_features", []),
                visual_description=data.get("visual_description", ""),
                hero_angles=data.get("hero_angles", ["front", "45-degree"]),
                prohibited_variations=data.get("prohibited_variations", []),
            )

            logger.info(f"Successfully extracted Product DNA: {product_dna.product_type}")
            return product_dna

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse vision response as JSON: {e}")
            logger.error(f"Response was: {response_text[:500]}")
            raise ValueError(f"Vision API returned invalid JSON: {e}")

        except Exception as e:
            logger.exception(f"Product analysis failed: {e}")
            raise

    async def _load_image(self, url: str) -> dict | None:
        """Load image from URL or local path.

        Args:
            url: Image URL (local /uploads/ path or remote http(s) URL)

        Returns:
            Dict with 'bytes' and 'mime_type', or None if loading failed
        """
        try:
            if url.startswith("/uploads/"):
                # Local file in frontend/public/uploads
                backend_dir = Path(__file__).resolve().parents[2]
                frontend_dir = backend_dir.parent / "frontend"
                file_path = frontend_dir / "public" / url.lstrip("/")

                if not file_path.exists():
                    logger.warning(f"Local image not found: {file_path}")
                    return None

                image_bytes = file_path.read_bytes()
                mime_type = self._get_mime_type(file_path.suffix)

                return {"bytes": image_bytes, "mime_type": mime_type}

            elif url.startswith(("http://", "https://")):
                # Remote URL
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.get(url)
                    response.raise_for_status()

                    content_type = response.headers.get("content-type", "image/jpeg")
                    mime_type = content_type.split(";")[0].strip()

                    return {"bytes": response.content, "mime_type": mime_type}

            elif url.startswith("gs://"):
                # Google Cloud Storage - would need GCS client
                logger.warning(f"GCS URLs not yet supported: {url}")
                return None

            else:
                logger.warning(f"Unsupported image URL format: {url}")
                return None

        except Exception as e:
            logger.error(f"Failed to load image {url}: {e}")
            return None

    def _get_mime_type(self, suffix: str) -> str:
        """Get MIME type from file extension."""
        mime_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
        }
        return mime_types.get(suffix.lower(), "image/jpeg")
