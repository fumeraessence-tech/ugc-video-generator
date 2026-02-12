"""Inspiration image analysis service.

Analyzes a portfolio of 100-200+ perfume product images using Gemini Vision
to extract a comprehensive style DNA (InspirationDNA) that guides future
image generation to match the user's taste and aesthetic preferences.
"""

import json
import logging
import random

from google import genai
from google.genai import types

from app.config import settings
from app.models.schemas import InspirationDNA
from app.services.image_service import ImageService

logger = logging.getLogger(__name__)


class InspirationService:
    """Analyze inspiration images and extract style DNA."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)
        self._image_service = ImageService(api_key=self._api_key)

    async def analyze_inspiration_portfolio(
        self,
        image_urls: list[str],
        sample_size: int = 12,
    ) -> InspirationDNA:
        """Analyze a portfolio of inspiration images and extract style DNA.

        Randomly samples `sample_size` images from the full set for cost-efficiency,
        then sends them to Gemini Vision for structured analysis across 8 dimensions.

        Args:
            image_urls: All uploaded inspiration image URLs.
            sample_size: Number of images to sample (default 12, max 15).

        Returns:
            InspirationDNA with extracted style patterns.
        """
        if not self._client:
            return InspirationDNA(overall_summary="No API key configured")

        if not image_urls:
            return InspirationDNA(overall_summary="No images provided")

        # Sample images for cost-efficiency
        sample_size = min(sample_size, 15, len(image_urls))
        sampled_urls = random.sample(image_urls, sample_size) if len(image_urls) > sample_size else image_urls

        logger.info(
            "Analyzing %d inspiration images (sampled from %d total)",
            len(sampled_urls), len(image_urls),
        )

        # Load sampled images
        loaded = await self._image_service._load_all_images(sampled_urls)
        if not loaded:
            return InspirationDNA(overall_summary="Could not load any images")

        image_parts = []
        for img in loaded:
            if img.get("bytes"):
                image_parts.append(
                    types.Part.from_bytes(data=img["bytes"], mime_type=img["mime_type"])
                )

        if not image_parts:
            return InspirationDNA(overall_summary="No valid image data")

        prompt = f"""You are a world-class art director specializing in perfume and luxury product photography.

Analyze these {len(image_parts)} perfume product photographs that represent a brand's desired visual style.
Extract a comprehensive STYLE DNA that captures the recurring patterns, preferences, and aesthetic choices.

Return ONLY a valid JSON object (no markdown, no code blocks):
{{
  "color_palettes": [
    "list of 4-6 dominant color palette descriptions found across images",
    "e.g., 'warm gold and amber tones with black accents'",
    "e.g., 'cool whites and silvers with pastel pink highlights'"
  ],
  "lighting_styles": [
    "list of 3-5 lighting techniques used across the images",
    "e.g., 'dramatic side lighting with deep shadows'",
    "e.g., 'soft diffused window light, low contrast'"
  ],
  "composition_patterns": [
    "list of 3-5 composition rules/patterns observed",
    "e.g., 'rule of thirds with bottle off-center'",
    "e.g., 'centered symmetrical with breathing room'"
  ],
  "prop_usage": [
    "list of 3-5 types of props/accessories commonly used",
    "e.g., 'fresh flowers and botanical elements'",
    "e.g., 'luxury fabrics (silk, velvet) as backdrop'"
  ],
  "background_styles": [
    "list of 3-5 background/surface types observed",
    "e.g., 'marble surfaces with subtle veining'",
    "e.g., 'dark moody backdrops with gradient'"
  ],
  "mood_aesthetic": [
    "list of 3-5 mood/aesthetic descriptions",
    "e.g., 'luxury editorial, magazine-quality'",
    "e.g., 'romantic, soft, feminine elegance'"
  ],
  "camera_angles": [
    "list of 3-5 camera angle preferences",
    "e.g., 'slightly elevated 30-degree angle'",
    "e.g., 'eye-level straight-on product shot'"
  ],
  "textures_materials": [
    "list of 3-5 texture/material preferences in the scenes",
    "e.g., 'glossy reflective surfaces'",
    "e.g., 'natural organic textures (wood, stone)'"
  ],
  "overall_summary": "A comprehensive 3-4 sentence paragraph summarizing the overall visual identity: the dominant mood, color story, lighting philosophy, and compositional style that defines this brand's imagery. This summary should be specific enough to guide an AI image generator to reproduce this exact aesthetic."
}}

CRITICAL INSTRUCTIONS:
1. Look for PATTERNS across multiple images, not just individual observations
2. Focus on what makes this collection COHESIVE — what's the visual DNA?
3. Be SPECIFIC — "warm lighting" is too vague; "golden hour side light at 45° with soft fill" is good
4. The overall_summary must be actionable for AI image generation
5. If the images show a consistent style, emphasize that; if varied, note the range"""

        try:
            content_parts = image_parts + [types.Part.from_text(text=prompt)]
            response = self._client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[types.Content(role="user", parts=content_parts)],
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=4000,
                ),
            )

            raw = response.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()

            data = json.loads(raw)

            result = InspirationDNA(
                color_palettes=data.get("color_palettes", []),
                lighting_styles=data.get("lighting_styles", []),
                composition_patterns=data.get("composition_patterns", []),
                prop_usage=data.get("prop_usage", []),
                background_styles=data.get("background_styles", []),
                mood_aesthetic=data.get("mood_aesthetic", []),
                camera_angles=data.get("camera_angles", []),
                textures_materials=data.get("textures_materials", []),
                overall_summary=data.get("overall_summary", ""),
            )

            logger.info(
                "Inspiration analysis complete: %d color palettes, %d lighting styles, %d compositions",
                len(result.color_palettes),
                len(result.lighting_styles),
                len(result.composition_patterns),
            )
            return result

        except Exception as e:
            logger.exception(f"Inspiration analysis failed: {e}")
            return InspirationDNA(overall_summary=f"Analysis failed: {e}")
