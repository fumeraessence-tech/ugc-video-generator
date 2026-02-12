"""Audio generation service using Gemini TTS (primary) with Google Cloud TTS fallback."""

import logging
import subprocess
import uuid
from pathlib import Path

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

# Audio output directory
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_FRONTEND_DIR = _BACKEND_DIR.parent / "frontend"
_AUDIO_DIR = _FRONTEND_DIR / "public" / "uploads" / "audio"
_AUDIO_DIR.mkdir(parents=True, exist_ok=True)


class AudioService:
    """Generates text-to-speech audio for scene dialogue.

    Priority order:
        1. Gemini TTS (gemini-2.5-flash-preview-tts) — primary
        2. Google Cloud TTS (Neural2/WaveNet) — fallback
        3. Mock audio URL — last resort
    """

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._gemini_client: genai.Client | None = None
        self._tts_client: object | None = None

        # Initialise Gemini client (primary)
        if self._api_key:
            try:
                self._gemini_client = genai.Client(api_key=self._api_key)
                logger.info("Gemini client initialised for TTS")
            except Exception:
                logger.warning("Failed to initialise Gemini client for TTS")

        # Initialise Google Cloud TTS (fallback)
        self._init_cloud_tts()

    # ── Initialisation helpers ───────────────────────────────────────────────

    def _init_cloud_tts(self) -> None:
        """Attempt to initialise Google Cloud TTS client."""
        try:
            from google.cloud import texttospeech

            self._tts_client = texttospeech.TextToSpeechAsyncClient()
            logger.info("Google Cloud TTS client initialised")
        except Exception:
            logger.warning("Google Cloud TTS unavailable -- will use mock audio")

    # ── Public API ───────────────────────────────────────────────────────────

    async def generate_tts(
        self,
        text: str,
        voice_config: dict[str, str] | None = None,
    ) -> dict[str, str]:
        """Generate TTS audio from text.

        Tries Gemini TTS first, then Google Cloud TTS, then mock.

        Args:
            text: The dialogue text to synthesise.
            voice_config: Optional dict with keys like 'language_code',
                          'name', 'pitch', 'speed'.

        Returns:
            Dict with keys: audio_url, duration_seconds, status.
        """
        voice_config = voice_config or {}

        # 1) Gemini TTS (primary)
        if self._gemini_client is not None:
            logger.info("Attempting Gemini TTS generation...")
            result = await self._generate_gemini_tts(text, voice_config)
            if result:
                return result
            logger.warning("Gemini TTS failed, trying Google Cloud TTS...")

        # 2) Google Cloud TTS (fallback)
        if self._tts_client is not None:
            result = await self._generate_cloud_tts(text, voice_config)
            if result:
                return result
            logger.warning("Google Cloud TTS failed, using mock audio...")

        # 3) Mock
        logger.warning("All TTS methods unavailable -- returning mock audio")
        return self._mock_audio(text)

    # ── Gemini TTS ───────────────────────────────────────────────────────────

    async def _generate_gemini_tts(
        self,
        text: str,
        voice_config: dict[str, str],
    ) -> dict[str, str] | None:
        """Generate TTS using Gemini gemini-2.5-flash-preview-tts model."""
        try:
            voice_name = voice_config.get("name", "Kore")
            speed = float(voice_config.get("speed", "1.0"))

            # Build a speech prompt with voice direction
            speech_prompt = (
                f"Say the following text naturally in a warm, conversational tone "
                f"at {'a normal' if speed == 1.0 else f'{speed}x'} speaking pace:\n\n"
                f"{text}"
            )

            response = self._gemini_client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=speech_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=voice_name,
                            ),
                        ),
                    ),
                ),
            )

            # Extract audio bytes from response
            if (
                response.candidates
                and response.candidates[0].content
                and response.candidates[0].content.parts
            ):
                for part in response.candidates[0].content.parts:
                    if part.inline_data and part.inline_data.data:
                        audio_bytes = part.inline_data.data
                        mime_type = part.inline_data.mime_type or "audio/wav"
                        logger.info(
                            "Gemini TTS returned %d bytes (%s)",
                            len(audio_bytes),
                            mime_type,
                        )
                        return await self._save_audio(audio_bytes, mime_type)

            logger.warning("Gemini TTS returned no audio data")
            return None

        except Exception:
            logger.exception("Gemini TTS generation failed")
            return None

    # ── Google Cloud TTS ─────────────────────────────────────────────────────

    async def _generate_cloud_tts(
        self,
        text: str,
        voice_config: dict[str, str],
    ) -> dict[str, str] | None:
        """Generate TTS using Google Cloud Text-to-Speech."""
        try:
            from google.cloud import texttospeech

            language_code = voice_config.get("language_code", "en-US")
            voice_name = voice_config.get("name", "en-US-Studio-O")

            synthesis_input = texttospeech.SynthesisInput(text=text)
            voice = texttospeech.VoiceSelectionParams(
                language_code=language_code,
                name=voice_name,
            )
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
                speaking_rate=float(voice_config.get("speed", "1.0")),
                pitch=float(voice_config.get("pitch", "0.0")),
            )

            response = await self._tts_client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config,
            )

            if response.audio_content:
                logger.info(
                    "Cloud TTS returned %d bytes", len(response.audio_content)
                )
                return await self._save_audio(response.audio_content, "audio/mpeg")

            return None

        except Exception:
            logger.exception("Google Cloud TTS generation failed")
            return None

    # ── File I/O helpers ─────────────────────────────────────────────────────

    async def _save_audio(
        self,
        audio_bytes: bytes,
        mime_type: str,
    ) -> dict[str, str]:
        """Save audio bytes to the local uploads directory."""
        ext = ".wav" if "wav" in mime_type else ".mp3"
        file_id = uuid.uuid4().hex[:8]
        filename = f"voiceover-{file_id}{ext}"
        filepath = _AUDIO_DIR / filename

        filepath.write_bytes(audio_bytes)
        logger.info("Saved audio file: %s (%d bytes)", filepath.name, len(audio_bytes))

        duration = await self._get_audio_duration(filepath)

        return {
            "audio_url": f"/uploads/audio/{filename}",
            "duration_seconds": str(round(duration, 1)),
            "status": "completed",
        }

    @staticmethod
    async def _get_audio_duration(filepath: Path) -> float:
        """Get actual audio duration using ffprobe."""
        try:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    str(filepath),
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )

            if result.returncode == 0 and result.stdout.strip():
                return float(result.stdout.strip())

        except Exception as e:
            logger.warning("ffprobe duration detection failed: %s", e)

        # Fallback: estimate from file size assuming ~128 kbps
        file_size = filepath.stat().st_size
        return file_size / (128 * 1024 / 8)

    # ── Mock ─────────────────────────────────────────────────────────────────

    @staticmethod
    def _mock_audio(text: str) -> dict[str, str]:
        estimated_duration = len(text.split()) / 2.5
        return {
            "audio_url": "https://placeholder.ugcgen.ai/audio/mock-voiceover.mp3",
            "duration_seconds": str(round(estimated_duration, 1)),
            "status": "completed",
        }
