import base64
import json
import logging

from google import genai
from google.genai import types

from app.models.schemas import AvatarDNA
from app.config import settings

logger = logging.getLogger(__name__)

_EXTRACTION_PROMPT = """\
Analyse the provided image(s) of a person and extract a detailed character DNA profile.

Output ONLY valid JSON matching this exact schema:
{
  "face": "string - face shape, jawline, cheekbones, nose, lips",
  "skin": "string - skin tone, complexion, notable features",
  "eyes": "string - eye color, shape, brow details, lashes",
  "hair": "string - color, length, style, texture",
  "body": "string - build, height estimate, posture",
  "voice": "string - infer from appearance: warm/deep/high/raspy etc.",
  "wardrobe": "string - current clothing style, colors, accessories",
  "prohibited_drift": "string - features that must NOT change between scenes"
}

Be specific and precise. The DNA will be used to maintain character consistency
across multiple AI-generated video scenes.
"""


class DNAExtractorAgent:
    """Uses Gemini Vision to extract character DNA from reference images."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)

    async def extract_from_base64(self, images: list[dict[str, str]]) -> AvatarDNA:
        """Extract character DNA from base64-encoded images.

        Args:
            images: List of dicts with 'data' (base64 string) and 'mime_type'.

        Returns:
            An AvatarDNA model populated from vision analysis.
        """
        if not images:
            logger.warning("No images provided for DNA extraction")
            return AvatarDNA()

        if self._client is None:
            logger.warning("No Gemini API key -- returning default DNA")
            return self._default_dna()

        try:
            parts: list[types.Part] = [types.Part(text=_EXTRACTION_PROMPT)]
            for img in images:
                raw_bytes = base64.b64decode(img["data"])
                mime = img.get("mime_type", "image/jpeg")
                parts.append(
                    types.Part(inline_data=types.Blob(data=raw_bytes, mime_type=mime))
                )

            response = self._client.models.generate_content(
                model="gemini-2.5-pro-preview-06-05",
                contents=[types.Content(role="user", parts=parts)],
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    response_mime_type="application/json",
                ),
            )

            data = json.loads(response.text)
            return AvatarDNA.model_validate(data)
        except Exception:
            logger.exception("DNA extraction failed")
            return self._default_dna()

    async def extract(self, image_urls: list[str]) -> AvatarDNA:
        """Extract character DNA from one or more reference image URLs.

        Args:
            image_urls: List of URLs pointing to reference images.

        Returns:
            An AvatarDNA model populated from vision analysis.
        """
        if not image_urls:
            logger.warning("No images provided for DNA extraction")
            return AvatarDNA()

        if self._client is None:
            logger.warning("No Gemini API key -- returning default DNA")
            return self._default_dna()

        try:
            parts: list[types.Part] = [types.Part(text=_EXTRACTION_PROMPT)]
            for url in image_urls:
                parts.append(
                    types.Part(file_data=types.FileData(file_uri=url, mime_type="image/jpeg"))
                )

            response = self._client.models.generate_content(
                model="gemini-2.5-pro-preview-06-05",
                contents=[types.Content(role="user", parts=parts)],
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    response_mime_type="application/json",
                ),
            )

            data = json.loads(response.text)
            return AvatarDNA.model_validate(data)
        except Exception:
            logger.exception("DNA extraction failed")
            return self._default_dna()

    @staticmethod
    def _default_dna() -> AvatarDNA:
        return AvatarDNA(
            face="oval face, balanced features",
            skin="medium tone, clear complexion",
            eyes="expressive eyes, natural brows",
            hair="medium-length styled hair",
            body="average build",
            voice="warm, conversational",
            wardrobe="casual contemporary",
            prohibited_drift="no major appearance changes between scenes",
        )
