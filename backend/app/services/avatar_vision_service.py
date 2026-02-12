"""Avatar Vision Service - Extract avatar DNA from uploaded images using Gemini Vision."""

from __future__ import annotations

import base64
import logging
from pathlib import Path

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

# DNA extraction prompt
DNA_EXTRACTION_PROMPT = """Analyze this image of a person and extract detailed visual DNA for AI image generation consistency.

CRITICAL: You MUST identify the person's gender accurately. This is essential for consistency.

You must provide a JSON response with the following fields. Be extremely specific and detailed:

{
  "gender": "FEMALE or MALE - this is REQUIRED and must be accurate",
  "face": "Describe face shape, jawline, cheekbones, facial structure in detail. START with 'Female face with...' or 'Male face with...'",
  "skin": "Describe skin tone (be specific about undertones), texture, complexion",
  "eyes": "Describe eye shape, color, brow shape, eyelashes",
  "hair": "Describe hair color, style, length, texture, parting",
  "body": "Describe body type, build, approximate height if visible. Include gender e.g. 'Slim female build' or 'Athletic male build'",
  "wardrobe": "Describe current clothing style, colors, aesthetic",
  "distinguishing_features": "Any unique features like dimples, moles, freckles",
  "age_range": "Estimated age range (e.g., '25-30')",
  "ethnicity_appearance": "General ethnic appearance for skin tone/feature consistency (e.g., South Asian, East Asian, Caucasian, etc.)"
}

IMPORTANT RULES:
1. ALWAYS explicitly state gender as FEMALE or MALE in the "gender" field
2. Include gender indicators in face and body descriptions
3. Be extremely detailed about facial features - they are crucial for consistency
4. Focus on permanent physical features, not temporary expressions

Respond with ONLY the JSON object, no additional text."""


class AvatarVisionService:
    """Service for extracting avatar DNA from images using Gemini Vision."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)

    async def extract_dna_from_image(
        self,
        image_data: bytes | str,
        image_mime_type: str = "image/jpeg",
    ) -> dict[str, str]:
        """Extract avatar DNA from an image.

        Args:
            image_data: Image bytes or base64 encoded string
            image_mime_type: MIME type of the image

        Returns:
            Dictionary containing extracted DNA fields with _source indicator
        """
        if not self._client:
            logger.warning("⚠️ No Gemini API key configured - returning MOCK DNA")
            return self._mock_dna(reason="no_api_key")

        try:
            # Handle both bytes and base64 string input
            if isinstance(image_data, str):
                # Assume it's base64 encoded
                image_bytes = base64.b64decode(image_data)
                logger.info(f"📷 Processing base64 image ({len(image_bytes)} bytes)")
            else:
                image_bytes = image_data
                logger.info(f"📷 Processing raw image ({len(image_bytes)} bytes)")

            # Create image part for Gemini
            image_part = types.Part.from_bytes(
                data=image_bytes,
                mime_type=image_mime_type,
            )

            logger.info("🤖 Calling Gemini Vision API for DNA extraction...")

            # Call Gemini Vision
            response = self._client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            image_part,
                            types.Part.from_text(text=DNA_EXTRACTION_PROMPT),
                        ],
                    )
                ],
                config=types.GenerateContentConfig(
                    temperature=0.2,  # Low temperature for factual output
                    response_mime_type="application/json",
                ),
            )

            # Parse response
            if response.text:
                import json
                try:
                    dna = json.loads(response.text)
                    logger.info(f"✅ REAL DNA extracted from Gemini: {list(dna.keys())}")

                    # Standardize the DNA format and mark as real
                    result = self._standardize_dna(dna)
                    result["_source"] = "gemini_vision_api"
                    return result
                except json.JSONDecodeError:
                    logger.error(f"❌ Failed to parse DNA JSON: {response.text[:200]}")
                    return self._mock_dna(reason="json_parse_error")

            logger.warning("⚠️ Gemini returned empty response")
            return self._mock_dna(reason="empty_response")

        except Exception as e:
            logger.exception(f"❌ Avatar DNA extraction failed: {e}")
            return self._mock_dna(reason=f"api_error: {str(e)}")

    def _standardize_dna(self, raw_dna: dict) -> dict[str, str]:
        """Standardize DNA dictionary to expected format."""
        gender = raw_dna.get("gender", "").upper()
        ethnicity = raw_dna.get("ethnicity_appearance", "")
        age = raw_dna.get("age_range", "")

        # Ensure face description includes gender
        face = raw_dna.get("face", "")
        if gender and gender not in face.upper():
            face = f"{gender} - {face}"

        # Ensure body description includes gender
        body = raw_dna.get("body", "")
        if gender and gender not in body.upper():
            body = f"{gender} build, {body}"

        return {
            "gender": gender,  # Explicitly include gender
            "face": face,
            "skin": raw_dna.get("skin", ""),
            "eyes": raw_dna.get("eyes", ""),
            "hair": raw_dna.get("hair", ""),
            "body": body,
            "wardrobe": raw_dna.get("wardrobe", ""),
            "voice": "",  # Cannot be extracted from image
            "ethnicity": ethnicity,
            "age_range": age,
            "prohibited_drift": self._generate_prohibited_drift(raw_dna),
        }

    def _generate_prohibited_drift(self, dna: dict) -> str:
        """Generate prohibited drift rules based on extracted DNA."""
        rules = []

        gender = dna.get("gender", "").upper()
        if "FEMALE" in gender or "WOMAN" in gender:
            rules.append("CRITICAL: MUST BE FEMALE - NO MALE CHARACTERS ALLOWED")
            rules.append("feminine features only")
        elif "MALE" in gender or "MAN" in gender:
            rules.append("CRITICAL: MUST BE MALE - NO FEMALE CHARACTERS ALLOWED")
            rules.append("masculine features only")

        ethnicity = dna.get("ethnicity_appearance", "")
        if ethnicity:
            rules.append(f"maintain {ethnicity} appearance")

        age = dna.get("age_range", "")
        if age:
            rules.append(f"maintain age appearance ({age})")

        rules.extend([
            "IDENTICAL facial structure in every frame",
            "SAME skin tone and complexion",
            "SAME hair style, length, and color",
            "NO changes to body type or build",
            "SAME person throughout all scenes",
        ])

        return " | ".join(rules)

    def _mock_dna(self, reason: str = "unknown") -> dict[str, str]:
        """Return mock DNA for testing - indicates API is NOT working."""
        logger.warning(f"🚨 RETURNING MOCK DNA - Reason: {reason}")
        return {
            "gender": "MOCK_DATA",
            "face": f"⚠️ MOCK DATA - API failed ({reason})",
            "skin": "medium warm tone, clear complexion",
            "eyes": "brown eyes, natural lashes",
            "hair": "dark hair, medium length",
            "body": "MOCK build - API not working",
            "wardrobe": "casual clothing",
            "voice": "",
            "ethnicity": "",
            "age_range": "25-30",
            "prohibited_drift": "MOCK DATA - VISION API NOT WORKING",
            "_source": f"mock_data ({reason})",
        }

    async def extract_dna_from_url(self, image_url: str) -> dict[str, str]:
        """Extract avatar DNA from an image URL.

        Args:
            image_url: URL of the image (can be local /uploads/ path or remote URL)

        Returns:
            Dictionary containing extracted DNA fields
        """
        import httpx

        try:
            # Handle local file paths
            if image_url.startswith("/uploads/"):
                backend_dir = Path(__file__).resolve().parents[2]
                frontend_dir = backend_dir.parent / "frontend"
                file_path = frontend_dir / "public" / image_url.lstrip("/")

                if file_path.exists():
                    with open(file_path, "rb") as f:
                        image_bytes = f.read()

                    # Determine mime type
                    suffix = file_path.suffix.lower()
                    mime_type = {
                        ".jpg": "image/jpeg",
                        ".jpeg": "image/jpeg",
                        ".png": "image/png",
                        ".webp": "image/webp",
                    }.get(suffix, "image/jpeg")

                    return await self.extract_dna_from_image(image_bytes, mime_type)
                else:
                    logger.error(f"Local image not found: {file_path}")
                    return self._mock_dna()

            # Handle remote URLs
            async with httpx.AsyncClient() as client:
                response = await client.get(image_url, timeout=30.0)
                response.raise_for_status()

                content_type = response.headers.get("content-type", "image/jpeg")
                return await self.extract_dna_from_image(response.content, content_type)

        except Exception as e:
            logger.exception(f"Failed to fetch image from URL: {e}")
            return self._mock_dna()
