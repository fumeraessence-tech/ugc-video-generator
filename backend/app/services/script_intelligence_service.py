"""Script Intelligence Service - Analyzes competitor videos and user scripts.

This service provides two optional features for enriching script generation:
1. Competitor Video Transcription & Analysis via Gemini File API + Vision
2. Own Script Deep Analysis via Gemini text understanding
"""

import asyncio
import json
import logging
import re
import time

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

COMPETITOR_VIDEO_PROMPT = """You are an expert UGC video analyst and creative strategist. Watch this competitor video carefully and extract a comprehensive analysis.

Analyze the following aspects:

1. TRANSCRIPT: Full word-for-word transcription of everything spoken
2. SCRIPT STRUCTURE: Break down the video into scenes with approximate timestamps — identify hook, problem, solution, demo, CTA segments
3. HOOK ANALYSIS: What is the opening hook? How do they grab attention? First 3 seconds strategy
4. PACING: Fast/slow? Where do they speed up or slow down? Average scene duration
5. TONE & ENERGY: What emotional tone do they use? How does it shift throughout?
6. CTA STRATEGY: How do they close? What call-to-action approach?
7. STRENGTHS: What works well in this video? (be specific)
8. WEAKNESSES: What could be improved? (be specific)
9. KEY TECHNIQUES: Any notable UGC techniques (pattern interrupts, jump cuts, product placement timing, transitions)?

Return as JSON:
{
  "transcript": "full word-for-word transcript...",
  "scenes": [{"timestamp": "0:00-0:03", "type": "hook", "description": "..."}],
  "hook_analysis": "detailed analysis of the opening hook...",
  "pacing": "detailed pacing analysis...",
  "tone": "tone and energy analysis...",
  "cta_strategy": "CTA approach analysis...",
  "strengths": ["specific strength 1", "specific strength 2"],
  "weaknesses": ["specific weakness 1", "specific weakness 2"],
  "key_techniques": ["technique 1 with description", "technique 2 with description"],
  "summary": "One-paragraph overall assessment with actionable takeaways"
}

Return ONLY valid JSON, no markdown."""

OWN_SCRIPT_PROMPT = """You are an expert UGC scriptwriter and creative strategist. Analyze this script in depth and provide actionable feedback.

SCRIPT TO ANALYZE:
{script_text}

Provide a thorough analysis covering:

1. STRUCTURE: How is the script organized? Identify hook, problem, solution, demo, CTA sections
2. STRENGTHS: What works well? Strong lines, good pacing, effective hooks?
3. WEAKNESSES: What needs improvement? Weak transitions, unclear CTA, pacing issues?
4. TONE ASSESSMENT: What tone/energy does the script convey? Is it consistent?
5. HOOK EFFECTIVENESS: Rate the opening hook 1-10 and explain why
6. CTA EFFECTIVENESS: Rate the closing CTA 1-10 and explain why
7. DIALOGUE NATURALNESS: Does it sound like a real person talking or scripted/corporate?
8. PACING: Is the pacing appropriate for UGC? Where does it drag or rush?
9. IMPROVEMENT SUGGESTIONS: Specific, actionable improvements

Return as JSON:
{
  "structure_breakdown": [{"section": "hook", "lines": "the actual lines...", "assessment": "what works/doesn't"}],
  "strengths": ["specific strength 1", "specific strength 2"],
  "weaknesses": ["specific weakness 1", "specific weakness 2"],
  "tone": "tone assessment...",
  "hook_score": 7,
  "hook_notes": "why this score and how to improve...",
  "cta_score": 5,
  "cta_notes": "why this score and how to improve...",
  "naturalness_score": 8,
  "naturalness_notes": "assessment of how natural the dialogue sounds...",
  "pacing_assessment": "detailed pacing analysis...",
  "improvement_suggestions": ["specific suggestion 1", "specific suggestion 2"],
  "summary": "One-paragraph overall assessment with the most important changes to make"
}

Return ONLY valid JSON, no markdown."""


def _extract_json(text: str) -> dict:
    """Robustly extract JSON from Gemini response, handling markdown wrappers."""
    text = text.strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Find first { to last } as fallback
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        try:
            return json.loads(text[first_brace : last_brace + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from response: {text[:200]}")


class ScriptIntelligenceService:
    """Service for analyzing competitor videos and user scripts."""

    def __init__(self, api_key: str | None = None):
        from app.config import settings

        self._api_key = api_key or settings.GEMINI_API_KEY
        if not self._api_key:
            raise ValueError("GEMINI_API_KEY is required")

        self._client = genai.Client(api_key=self._api_key)

    async def analyze_competitor_video(self, video_path: str, mime_type: str) -> dict:
        """Upload video to Gemini File API and analyze with Gemini 2.5 Pro.

        Args:
            video_path: Path to the temporary video file on disk.
            mime_type: MIME type of the video (e.g. video/mp4).

        Returns:
            Structured analysis dict with transcript, scenes, hook_analysis, etc.
        """
        logger.info(f"Uploading video to Gemini File API: {video_path} ({mime_type})")

        uploaded_file = None
        try:
            # Upload file to Gemini (sync call, run in executor)
            uploaded_file = await asyncio.to_thread(
                self._client.files.upload,
                file=video_path,
                config={"mime_type": mime_type},
            )
            logger.info(f"File uploaded: {uploaded_file.name}, state: {uploaded_file.state}")

            # Poll until file is ACTIVE (processed by Gemini)
            max_polls = 60
            poll_interval = 2
            for i in range(max_polls):
                if uploaded_file.state == "ACTIVE":
                    break
                if uploaded_file.state == "FAILED":
                    raise ValueError("Gemini failed to process the uploaded video")
                logger.info(f"Waiting for file processing... poll {i + 1}/{max_polls}, state: {uploaded_file.state}")
                await asyncio.sleep(poll_interval)
                uploaded_file = await asyncio.to_thread(
                    self._client.files.get,
                    name=uploaded_file.name,
                )
            else:
                raise TimeoutError("Video processing timed out after 120 seconds")

            logger.info("File is ACTIVE, sending to Gemini 2.5 Pro for analysis")

            # Analyze with Gemini 2.5 Pro
            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model="gemini-2.5-pro",
                contents=[
                    types.Part.from_uri(
                        file_uri=uploaded_file.uri,
                        mime_type=mime_type,
                    ),
                    COMPETITOR_VIDEO_PROMPT,
                ],
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )

            response_text = (response.text or "").strip()
            if not response_text:
                raise ValueError("Gemini returned empty response for video analysis")

            analysis = _extract_json(response_text)
            logger.info("Video analysis complete")
            return analysis

        finally:
            # Clean up uploaded file from Gemini
            if uploaded_file and uploaded_file.name:
                try:
                    await asyncio.to_thread(
                        self._client.files.delete,
                        name=uploaded_file.name,
                    )
                    logger.info(f"Cleaned up Gemini file: {uploaded_file.name}")
                except Exception as e:
                    logger.warning(f"Failed to clean up Gemini file: {e}")

    async def analyze_own_script(self, script_text: str) -> dict:
        """Analyze a user-provided script with Gemini 2.5 Pro.

        Args:
            script_text: The script text to analyze.

        Returns:
            Structured analysis dict with scores, strengths, weaknesses, etc.
        """
        logger.info("Analyzing user script with Gemini 2.5 Pro")

        prompt = OWN_SCRIPT_PROMPT.format(script_text=script_text)

        response = await asyncio.to_thread(
            self._client.models.generate_content,
            model="gemini-2.5-pro",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=4096,
                response_mime_type="application/json",
            ),
        )

        response_text = (response.text or "").strip()
        if not response_text:
            raise ValueError("Gemini returned empty response for script analysis")

        analysis = _extract_json(response_text)
        logger.info("Script analysis complete")
        return analysis
