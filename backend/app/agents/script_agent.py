import json
import logging

from google import genai
from google.genai import types

from app.models.schemas import AvatarDNA, Script
from app.config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a professional UGC (User-Generated Content) video scriptwriter and director.

Your task is to create highly detailed, authentic-feeling video scripts optimised for
short-form vertical video (TikTok, Instagram Reels, YouTube Shorts).

Guidelines:
- Write in a conversational, first-person voice as if the character is talking directly
  to the viewer.
- Each scene must have specific camera directions (angle, movement, framing).
- Maintain character consistency throughout -- reference the Character DNA if provided.
- The script should feel spontaneous and unscripted, even though it is carefully crafted.
- Include natural pauses, reactions, and "umm" / "like" sparingly for authenticity.
- Ensure the total duration matches the requested length.

Output ONLY valid JSON matching this schema:
{
  "title": "string",
  "scenes": [
    {
      "scene_number": int,
      "location": "string",
      "description": "string",
      "dialogue": "string",
      "duration_seconds": float,
      "camera_notes": "string"
    }
  ],
  "total_duration": float,
  "style_notes": "string"
}
"""


class ScriptAgent:
    """Agent that uses Gemini to generate structured video scripts with character DNA injection."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)

    async def generate(
        self,
        prompt: str,
        avatar_dna: AvatarDNA | None = None,
        style: str | None = None,
        duration: int = 30,
    ) -> Script:
        """Generate a complete video script.

        Args:
            prompt: The user's concept / brief.
            avatar_dna: Optional character DNA for consistency.
            style: Optional style direction (e.g., "comedic", "educational").
            duration: Target video duration in seconds.

        Returns:
            A validated Script model.
        """
        user_prompt = self._build_prompt(prompt, avatar_dna, style, duration)

        if self._client is None:
            logger.warning("No Gemini API key -- ScriptAgent returning mock")
            return self._mock(prompt, duration)

        try:
            response = self._client.models.generate_content(
                model="gemini-2.5-pro-preview-06-05",
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=_SYSTEM_PROMPT,
                    temperature=0.85,
                    response_mime_type="application/json",
                ),
            )
            data = json.loads(response.text)
            return Script.model_validate(data)
        except Exception:
            logger.exception("ScriptAgent Gemini call failed")
            return self._mock(prompt, duration)

    def _build_prompt(
        self,
        prompt: str,
        avatar_dna: AvatarDNA | None,
        style: str | None,
        duration: int,
    ) -> str:
        sections: list[str] = [
            f"Create a {duration}-second UGC video script.",
            f"Concept: {prompt}",
        ]
        if avatar_dna:
            sections.append(self._inject_dna(avatar_dna))
        if style:
            sections.append(f"Style direction: {style}")
        sections.append(
            f"Target duration: {duration} seconds. "
            "Break into scenes of 3-8 seconds each."
        )
        return "\n\n".join(sections)

    @staticmethod
    def _inject_dna(dna: AvatarDNA) -> str:
        return (
            "CHARACTER DNA (maintain consistency across all scenes):\n"
            f"  Face: {dna.face}\n"
            f"  Skin: {dna.skin}\n"
            f"  Eyes: {dna.eyes}\n"
            f"  Hair: {dna.hair}\n"
            f"  Body: {dna.body}\n"
            f"  Voice: {dna.voice}\n"
            f"  Wardrobe: {dna.wardrobe}\n"
            f"  PROHIBITED changes: {dna.prohibited_drift}"
        )

    @staticmethod
    def _mock(prompt: str, duration: int) -> Script:
        from app.services.script_service import ScriptService

        return ScriptService._mock_script(prompt, duration)
