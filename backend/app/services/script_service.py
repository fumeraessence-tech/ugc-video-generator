import json
import logging

from google import genai
from google.genai import types

from app.models.schemas import AvatarDNA, Script, ScriptScene
from app.config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a professional UGC (User-Generated Content) video scriptwriter.
Given a concept prompt and optional character DNA, create a compelling short-form video script.

Output ONLY valid JSON matching this exact schema:
{
  "title": "string",
  "scenes": [
    {
      "scene_number": int,
      "location": "string",
      "description": "string - visual description of the scene",
      "dialogue": "string - what the character says",
      "duration_seconds": float,
      "camera_notes": "string - camera angle, movement, framing"
    }
  ],
  "total_duration": float,
  "style_notes": "string - overall style, mood, lighting direction"
}

Rules:
- Keep total duration close to the requested duration
- Each scene should be 3-8 seconds
- Dialogue should be natural, conversational, authentic UGC style
- Camera notes should specify angle (close-up, medium, wide) and movement
- If character DNA is provided, reference their appearance consistently
"""


class ScriptService:
    """Generates UGC video scripts using Gemini or a mock fallback."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)

    async def generate_script(
        self,
        prompt: str,
        avatar_dna: AvatarDNA | None = None,
        style: str | None = None,
        duration: int = 30,
    ) -> Script:
        """Generate a video script from a text prompt."""
        if self._client is None:
            logger.warning("No Gemini API key -- returning mock script")
            return self._mock_script(prompt, duration)

        user_message = self._build_user_prompt(prompt, avatar_dna, style, duration)

        try:
            response = self._client.models.generate_content(
                model="gemini-2.5-pro-preview-06-05",
                contents=user_message,
                config=types.GenerateContentConfig(
                    system_instruction=_SYSTEM_PROMPT,
                    temperature=0.8,
                    response_mime_type="application/json",
                ),
            )
            raw = response.text
            data = json.loads(raw)
            return Script.model_validate(data)
        except Exception:
            logger.exception("Gemini script generation failed, using mock")
            return self._mock_script(prompt, duration)

    def _build_user_prompt(
        self,
        prompt: str,
        avatar_dna: AvatarDNA | None,
        style: str | None,
        duration: int,
    ) -> str:
        parts: list[str] = [f"Create a {duration}-second UGC video script for: {prompt}"]
        if avatar_dna:
            parts.append(
                f"\nCharacter DNA:\n"
                f"- Face: {avatar_dna.face}\n"
                f"- Skin: {avatar_dna.skin}\n"
                f"- Eyes: {avatar_dna.eyes}\n"
                f"- Hair: {avatar_dna.hair}\n"
                f"- Body: {avatar_dna.body}\n"
                f"- Wardrobe: {avatar_dna.wardrobe}\n"
                f"- Prohibited drift: {avatar_dna.prohibited_drift}"
            )
        if style:
            parts.append(f"\nStyle direction: {style}")
        return "\n".join(parts)

    @staticmethod
    def _mock_script(prompt: str, duration: int) -> Script:
        scene_count = max(2, duration // 8)
        per_scene = round(duration / scene_count, 1)
        scenes = [
            ScriptScene(
                scene_number=i + 1,
                location="Living room / casual setting" if i % 2 == 0 else "Kitchen counter / bright lighting",
                description=f"Scene {i + 1}: Character delivers line about '{prompt[:40]}...'",
                dialogue=f"Hey guys, let me tell you about this... {'part ' + str(i + 1) + ' of the story.' if i > 0 else 'you will not believe it!'}",
                duration_seconds=per_scene,
                camera_notes="Medium close-up, slight dolly in" if i % 2 == 0 else "Close-up face, static",
            )
            for i in range(scene_count)
        ]
        return Script(
            title=f"UGC Video: {prompt[:50]}",
            scenes=scenes,
            total_duration=duration,
            style_notes="Authentic, handheld feel. Natural lighting. Conversational tone.",
        )
