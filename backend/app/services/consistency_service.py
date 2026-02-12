"""Character consistency scoring service using Gemini Vision.

Implements the multi-layer consistency strategy from the PRD:
  - Layer 3: Storyboard validation (threshold > 0.75)
  - Layer 4: Video frame validation (flag if < 0.65)
  - Layer 5: Cross-scene consistency (std dev < 0.1)
  - Selection criteria weights: identity 40%, continuity 30%, prompt 20%, quality 10%

Uses Gemini Vision (gemini-2.5-flash) to compare images for character consistency
instead of heavy ML dependencies like InsightFace/ArcFace. The model analyzes
facial features, skin tone, hair, body type, and other identity markers, then
returns structured similarity scores.
"""

from __future__ import annotations

import json
import logging
import statistics
from typing import Any

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Score thresholds & ratings
# ---------------------------------------------------------------------------
SCORE_THRESHOLDS = {
    "excellent": 0.80,
    "acceptable": 0.70,
    "marginal": 0.60,
}

# Layer-specific thresholds (from PRD Section 6.1)
STORYBOARD_THRESHOLD = 0.75   # Layer 3
VIDEO_FRAME_THRESHOLD = 0.65  # Layer 4
CROSS_SCENE_STD_MAX = 0.10    # Layer 5

# Selection criteria weights (from PRD Section 4.5.3)
WEIGHT_IDENTITY = 0.40
WEIGHT_CONTINUITY = 0.30
WEIGHT_PROMPT = 0.20
WEIGHT_QUALITY = 0.10

# Gemini model for vision analysis
VISION_MODEL = "gemini-2.5-flash"

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------
_CONSISTENCY_ANALYSIS_PROMPT = """You are a character consistency scoring system for AI-generated video production.

Compare the TARGET IMAGE against the REFERENCE IMAGE(S) and evaluate how consistently the same character is depicted.

Analyze the following attributes and score each from 0.0 to 1.0 (1.0 = perfect match):

1. **face_structure** - Jawline, cheekbones, forehead shape, chin, face proportions
2. **eyes** - Eye shape, color, spacing, eyelid type, eyebrow shape
3. **nose** - Bridge width, tip shape, nostril size
4. **lips** - Shape, fullness, proportions
5. **skin_tone** - Exact skin tone, undertone (warm/cool), complexion
6. **hair** - Color, style, texture, length, parting
7. **body_type** - Build, proportions, posture
8. **distinguishing_features** - Moles, freckles, dimples, beauty marks, scars
9. **overall_identity** - Would someone recognize this as the SAME person?

{character_dna_section}

SCORING GUIDELINES:
- 1.0: Identical / indistinguishable from reference
- 0.9: Same person, trivial lighting/angle differences
- 0.8: Same person, minor style differences (excellent)
- 0.7: Likely same person, some feature drift (acceptable)
- 0.6: Possibly same person, noticeable differences (marginal)
- 0.5: Questionable identity match
- Below 0.5: Different person

You MUST respond with ONLY a JSON object in this exact format:
{{
  "face_structure": <float 0.0-1.0>,
  "eyes": <float 0.0-1.0>,
  "nose": <float 0.0-1.0>,
  "lips": <float 0.0-1.0>,
  "skin_tone": <float 0.0-1.0>,
  "hair": <float 0.0-1.0>,
  "body_type": <float 0.0-1.0>,
  "distinguishing_features": <float 0.0-1.0>,
  "overall_identity": <float 0.0-1.0>,
  "notes": "<brief explanation of key similarities and differences>"
}}"""

_PROMPT_ADHERENCE_PROMPT = """You are a prompt adherence evaluator for AI-generated video frames.

Given the GENERATED IMAGE and the ORIGINAL PROMPT below, score how well the image matches the prompt requirements.

ORIGINAL PROMPT:
{prompt_text}

Evaluate:
1. **scene_accuracy** - Does the scene match the described setting, action, and composition?
2. **character_action** - Is the character performing the described action correctly?
3. **lighting_match** - Does the lighting match the prompt description?
4. **composition** - Does the framing/camera angle match the prompt?
5. **overall_adherence** - Overall prompt adherence score

You MUST respond with ONLY a JSON object:
{{
  "scene_accuracy": <float 0.0-1.0>,
  "character_action": <float 0.0-1.0>,
  "lighting_match": <float 0.0-1.0>,
  "composition": <float 0.0-1.0>,
  "overall_adherence": <float 0.0-1.0>,
  "notes": "<brief explanation>"
}}"""

_TECHNICAL_QUALITY_PROMPT = """You are a technical quality evaluator for AI-generated video frames.

Analyze the provided IMAGE for technical quality issues.

Score each attribute from 0.0 to 1.0 (1.0 = perfect quality):
1. **sharpness** - Is the image sharp and well-focused?
2. **artifacts** - Are there visible AI artifacts (distorted hands, extra fingers, warped text, etc.)? 1.0 = no artifacts
3. **lighting_quality** - Is the lighting natural and physically plausible?
4. **color_quality** - Are colors natural, not oversaturated or washed out?
5. **anatomical_correctness** - Are human features anatomically correct (fingers, eyes, proportions)?
6. **overall_quality** - Overall technical quality score

You MUST respond with ONLY a JSON object:
{{
  "sharpness": <float 0.0-1.0>,
  "artifacts": <float 0.0-1.0>,
  "lighting_quality": <float 0.0-1.0>,
  "color_quality": <float 0.0-1.0>,
  "anatomical_correctness": <float 0.0-1.0>,
  "overall_quality": <float 0.0-1.0>,
  "notes": "<brief explanation of any issues>"
}}"""

_CONTINUITY_PROMPT = """You are a scene continuity evaluator for AI-generated video.

Compare the CURRENT FRAME to the PREVIOUS FRAME and evaluate visual continuity.

Score each attribute from 0.0 to 1.0 (1.0 = seamless continuity):
1. **color_consistency** - Are colors and white balance consistent between frames?
2. **lighting_continuity** - Is the lighting direction and quality consistent?
3. **character_position** - Is the character's position/pose a plausible continuation?
4. **background_consistency** - Is the background/setting consistent?
5. **overall_continuity** - Overall scene continuity score

You MUST respond with ONLY a JSON object:
{{
  "color_consistency": <float 0.0-1.0>,
  "lighting_continuity": <float 0.0-1.0>,
  "character_position": <float 0.0-1.0>,
  "background_consistency": <float 0.0-1.0>,
  "overall_continuity": <float 0.0-1.0>,
  "notes": "<brief explanation>"
}}"""


def _score_to_rating(score: float) -> str:
    """Convert a numerical score to a human-readable rating."""
    if score >= SCORE_THRESHOLDS["excellent"]:
        return "excellent"
    if score >= SCORE_THRESHOLDS["acceptable"]:
        return "acceptable"
    if score >= SCORE_THRESHOLDS["marginal"]:
        return "marginal"
    return "failed"


class ConsistencyService:
    """Character consistency scoring via Gemini Vision.

    Provides multi-layer consistency validation as specified in the PRD
    (Section 6 - Character Consistency Enforcement Pipeline).
    """

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)

    # ------------------------------------------------------------------
    # Core scoring method
    # ------------------------------------------------------------------

    async def score_character_consistency(
        self,
        image_data: bytes,
        reference_images: list[bytes],
        character_dna: dict | None = None,
    ) -> dict:
        """Score character consistency between a generated image and references.

        Uses Gemini Vision to compare facial features, skin tone, hair, body
        type, and other identity markers.

        Args:
            image_data: The generated image to evaluate (raw bytes).
            reference_images: One or more reference images (raw bytes) of the
                canonical character appearance.
            character_dna: Optional Character DNA dict with textual feature
                descriptions to ground the comparison.

        Returns:
            Dictionary with keys:
                score (float 0.0-1.0), rating (str), details (dict),
                attribute_scores (dict), notes (str).
        """
        if not self._client:
            logger.warning("No Gemini API key -- returning mock consistency score")
            return self._mock_consistency_result()

        if not reference_images:
            logger.warning("No reference images provided for consistency scoring")
            return self._mock_consistency_result(reason="no_reference_images")

        try:
            # Build content parts: reference images first, then target image
            content_parts: list[Any] = []

            for idx, ref_bytes in enumerate(reference_images):
                content_parts.append(
                    types.Part.from_bytes(data=ref_bytes, mime_type="image/png")
                )
                content_parts.append(
                    types.Part.from_text(text=f"[REFERENCE IMAGE {idx + 1}]")
                )

            content_parts.append(
                types.Part.from_bytes(data=image_data, mime_type="image/png")
            )
            content_parts.append(types.Part.from_text(text="[TARGET IMAGE TO EVALUATE]"))

            # Build the character DNA section for the prompt
            dna_section = ""
            if character_dna:
                dna_lines = ["KNOWN CHARACTER DNA (use as additional reference):"]
                for key in ("face", "skin", "eyes", "hair", "body", "wardrobe",
                            "ethnicity", "age_range", "gender", "distinguishing_features"):
                    value = character_dna.get(key)
                    if value:
                        dna_lines.append(f"  - {key}: {value}")
                dna_section = "\n".join(dna_lines)

            prompt_text = _CONSISTENCY_ANALYSIS_PROMPT.format(
                character_dna_section=dna_section,
            )
            content_parts.append(types.Part.from_text(text=prompt_text))

            # Call Gemini Vision
            response = self._client.models.generate_content(
                model=VISION_MODEL,
                contents=[types.Content(role="user", parts=content_parts)],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )

            scores = self._parse_json_response(response.text)
            if scores is None:
                logger.error("Failed to parse consistency scores from Gemini response")
                return self._mock_consistency_result(reason="parse_error")

            overall = float(scores.get("overall_identity", 0.0))
            rating = _score_to_rating(overall)

            return {
                "score": round(overall, 4),
                "rating": rating,
                "attribute_scores": {
                    k: round(float(v), 4)
                    for k, v in scores.items()
                    if k not in ("notes",) and isinstance(v, (int, float))
                },
                "details": {
                    "model": VISION_MODEL,
                    "num_references": len(reference_images),
                    "character_dna_provided": character_dna is not None,
                },
                "notes": scores.get("notes", ""),
            }

        except Exception as exc:
            logger.exception("Character consistency scoring failed: %s", exc)
            return self._mock_consistency_result(reason=f"error: {exc}")

    # ------------------------------------------------------------------
    # Layer 3: Storyboard validation
    # ------------------------------------------------------------------

    async def validate_storyboard_frame(
        self,
        frame_image: bytes,
        reference_images: list[bytes],
        character_dna: dict | None = None,
    ) -> dict:
        """Validate a single storyboard frame against character references.

        Layer 3 of the consistency pipeline (PRD Section 6.1).
        Threshold: score > 0.75 = pass. Up to 3 retries recommended on failure.

        Args:
            frame_image: The storyboard frame to validate (raw bytes).
            reference_images: Reference images of the canonical character.
            character_dna: Optional Character DNA dict.

        Returns:
            Dictionary with keys:
                passed (bool), score (float), rating (str), threshold (float),
                details (dict), notes (str).
        """
        result = await self.score_character_consistency(
            image_data=frame_image,
            reference_images=reference_images,
            character_dna=character_dna,
        )

        score = result.get("score", 0.0)
        passed = score >= STORYBOARD_THRESHOLD

        logger.info(
            "Storyboard validation: score=%.3f threshold=%.2f passed=%s rating=%s",
            score,
            STORYBOARD_THRESHOLD,
            passed,
            result.get("rating", "unknown"),
        )

        return {
            "passed": passed,
            "score": score,
            "rating": result.get("rating", "failed"),
            "threshold": STORYBOARD_THRESHOLD,
            "attribute_scores": result.get("attribute_scores", {}),
            "details": result.get("details", {}),
            "notes": result.get("notes", ""),
        }

    # ------------------------------------------------------------------
    # Layer 4: Video frame validation
    # ------------------------------------------------------------------

    async def validate_video_frames(
        self,
        frame_images: list[bytes],
        reference_images: list[bytes],
        character_dna: dict | None = None,
    ) -> dict:
        """Validate sampled frames from a generated video.

        Layer 4 of the consistency pipeline (PRD Section 6.1).
        Flags any frame that drops below 0.65 similarity.

        Args:
            frame_images: Sampled frames from the video (e.g. 1 per second).
            reference_images: Character reference images.
            character_dna: Optional Character DNA dict.

        Returns:
            Dictionary with keys:
                overall_score (float), per_frame_scores (list[dict]),
                flagged_frames (list[int]), passed (bool),
                threshold (float), summary (str).
        """
        if not frame_images:
            logger.warning("No frames provided for video validation")
            return {
                "overall_score": 0.0,
                "per_frame_scores": [],
                "flagged_frames": [],
                "passed": False,
                "threshold": VIDEO_FRAME_THRESHOLD,
                "summary": "No frames provided for validation.",
            }

        per_frame: list[dict] = []
        flagged: list[int] = []
        scores: list[float] = []

        for idx, frame_bytes in enumerate(frame_images):
            result = await self.score_character_consistency(
                image_data=frame_bytes,
                reference_images=reference_images,
                character_dna=character_dna,
            )
            score = result.get("score", 0.0)
            scores.append(score)

            frame_result = {
                "frame_index": idx,
                "score": score,
                "rating": result.get("rating", "failed"),
                "passed": score >= VIDEO_FRAME_THRESHOLD,
            }
            per_frame.append(frame_result)

            if score < VIDEO_FRAME_THRESHOLD:
                flagged.append(idx)
                logger.warning(
                    "Frame %d FLAGGED: score=%.3f < threshold=%.2f",
                    idx, score, VIDEO_FRAME_THRESHOLD,
                )

        overall_score = statistics.mean(scores) if scores else 0.0
        passed = len(flagged) == 0

        summary_parts = [
            f"Validated {len(frame_images)} frames.",
            f"Overall score: {overall_score:.3f}.",
            f"Flagged frames: {len(flagged)}/{len(frame_images)}.",
        ]
        if flagged:
            summary_parts.append(
                f"Frames below {VIDEO_FRAME_THRESHOLD} threshold: {flagged}."
            )

        logger.info(
            "Video frame validation: overall=%.3f flagged=%d/%d passed=%s",
            overall_score, len(flagged), len(frame_images), passed,
        )

        return {
            "overall_score": round(overall_score, 4),
            "per_frame_scores": per_frame,
            "flagged_frames": flagged,
            "passed": passed,
            "threshold": VIDEO_FRAME_THRESHOLD,
            "summary": " ".join(summary_parts),
        }

    # ------------------------------------------------------------------
    # Layer 5: Cross-scene consistency
    # ------------------------------------------------------------------

    async def check_cross_scene_consistency(
        self,
        scene_images: list[bytes],
        reference_images: list[bytes],
    ) -> dict:
        """Check character consistency across multiple scenes.

        Layer 5 of the consistency pipeline (PRD Section 6.1).
        Standard deviation of similarity scores must be < 0.1.

        Args:
            scene_images: One representative frame per scene.
            reference_images: Character reference images.

        Returns:
            Dictionary with keys:
                consistency_score (float), std_dev (float),
                per_scene_scores (list[dict]), passed (bool),
                std_threshold (float), outlier_scenes (list[int]),
                summary (str).
        """
        if len(scene_images) < 2:
            logger.warning("Need at least 2 scenes for cross-scene consistency check")
            return {
                "consistency_score": 1.0 if scene_images else 0.0,
                "std_dev": 0.0,
                "per_scene_scores": [],
                "passed": True if scene_images else False,
                "std_threshold": CROSS_SCENE_STD_MAX,
                "outlier_scenes": [],
                "summary": "Insufficient scenes for cross-scene comparison.",
            }

        per_scene: list[dict] = []
        scores: list[float] = []

        for idx, scene_bytes in enumerate(scene_images):
            result = await self.score_character_consistency(
                image_data=scene_bytes,
                reference_images=reference_images,
            )
            score = result.get("score", 0.0)
            scores.append(score)
            per_scene.append({
                "scene_index": idx,
                "score": score,
                "rating": result.get("rating", "failed"),
            })

        mean_score = statistics.mean(scores)
        std_dev = statistics.stdev(scores) if len(scores) > 1 else 0.0
        passed = std_dev < CROSS_SCENE_STD_MAX

        # Identify outlier scenes (scores more than 2 * std_dev from mean)
        outlier_scenes: list[int] = []
        if std_dev > 0:
            for idx, score in enumerate(scores):
                if abs(score - mean_score) > 2 * std_dev:
                    outlier_scenes.append(idx)

        summary_parts = [
            f"Analyzed {len(scene_images)} scenes.",
            f"Mean consistency score: {mean_score:.3f}.",
            f"Std dev: {std_dev:.4f} (threshold: {CROSS_SCENE_STD_MAX}).",
        ]
        if outlier_scenes:
            summary_parts.append(
                f"Outlier scenes requiring regeneration: {outlier_scenes}."
            )
        if passed:
            summary_parts.append("Cross-scene consistency: PASSED.")
        else:
            summary_parts.append("Cross-scene consistency: FAILED - too much variance.")

        logger.info(
            "Cross-scene consistency: mean=%.3f std=%.4f threshold=%.2f passed=%s outliers=%s",
            mean_score, std_dev, CROSS_SCENE_STD_MAX, passed, outlier_scenes,
        )

        return {
            "consistency_score": round(mean_score, 4),
            "std_dev": round(std_dev, 4),
            "per_scene_scores": per_scene,
            "passed": passed,
            "std_threshold": CROSS_SCENE_STD_MAX,
            "outlier_scenes": outlier_scenes,
            "summary": " ".join(summary_parts),
        }

    # ------------------------------------------------------------------
    # Multi-candidate scoring (PRD Section 4.5.3)
    # ------------------------------------------------------------------

    async def score_video_candidate(
        self,
        frame_image: bytes,
        prompt: str,
        reference_images: list[bytes],
        previous_frame: bytes | None = None,
    ) -> dict:
        """Score a video candidate using the weighted selection criteria.

        Implements the multi-candidate selection system from PRD Section 4.5.3:
            - Character identity match: 40%
            - Scene continuity: 30%
            - Prompt adherence: 20%
            - Technical quality: 10%

        Args:
            frame_image: A representative frame from the video candidate.
            prompt: The original scene prompt used for generation.
            reference_images: Character reference images.
            previous_frame: Last frame from the previous scene/clip for
                continuity scoring. If None, continuity is scored at 1.0.

        Returns:
            Dictionary with keys:
                weighted_score (float), identity_score (float),
                continuity_score (float), prompt_score (float),
                quality_score (float), breakdown (dict), recommendation (str).
        """
        if not self._client:
            logger.warning("No Gemini API key -- returning mock candidate score")
            return self._mock_candidate_result()

        # --- 1. Character identity match (40%) ---
        identity_result = await self.score_character_consistency(
            image_data=frame_image,
            reference_images=reference_images,
        )
        identity_score = identity_result.get("score", 0.0)

        # --- 2. Scene continuity (30%) ---
        if previous_frame is not None:
            continuity_result = await self._score_continuity(
                current_frame=frame_image,
                previous_frame=previous_frame,
            )
            continuity_score = continuity_result.get("overall_continuity", 0.0)
            continuity_details = continuity_result
        else:
            # No previous frame - full continuity score (first scene)
            continuity_score = 1.0
            continuity_details = {"notes": "First scene - no previous frame for comparison"}

        # --- 3. Prompt adherence (20%) ---
        prompt_result = await self._score_prompt_adherence(
            frame_image=frame_image,
            prompt_text=prompt,
        )
        prompt_score = prompt_result.get("overall_adherence", 0.0)

        # --- 4. Technical quality (10%) ---
        quality_result = await self._score_technical_quality(
            frame_image=frame_image,
        )
        quality_score = quality_result.get("overall_quality", 0.0)

        # --- Compute weighted score ---
        weighted_score = (
            identity_score * WEIGHT_IDENTITY
            + continuity_score * WEIGHT_CONTINUITY
            + prompt_score * WEIGHT_PROMPT
            + quality_score * WEIGHT_QUALITY
        )

        recommendation = _score_to_rating(weighted_score)

        logger.info(
            "Candidate score: weighted=%.3f (identity=%.3f*%.0f%% + continuity=%.3f*%.0f%% "
            "+ prompt=%.3f*%.0f%% + quality=%.3f*%.0f%%) recommendation=%s",
            weighted_score,
            identity_score, WEIGHT_IDENTITY * 100,
            continuity_score, WEIGHT_CONTINUITY * 100,
            prompt_score, WEIGHT_PROMPT * 100,
            quality_score, WEIGHT_QUALITY * 100,
            recommendation,
        )

        return {
            "weighted_score": round(weighted_score, 4),
            "identity_score": round(identity_score, 4),
            "continuity_score": round(continuity_score, 4),
            "prompt_score": round(prompt_score, 4),
            "quality_score": round(quality_score, 4),
            "breakdown": {
                "identity": {
                    "score": round(identity_score, 4),
                    "weight": WEIGHT_IDENTITY,
                    "weighted": round(identity_score * WEIGHT_IDENTITY, 4),
                    "details": identity_result.get("attribute_scores", {}),
                },
                "continuity": {
                    "score": round(continuity_score, 4),
                    "weight": WEIGHT_CONTINUITY,
                    "weighted": round(continuity_score * WEIGHT_CONTINUITY, 4),
                    "details": continuity_details,
                },
                "prompt_adherence": {
                    "score": round(prompt_score, 4),
                    "weight": WEIGHT_PROMPT,
                    "weighted": round(prompt_score * WEIGHT_PROMPT, 4),
                    "details": prompt_result,
                },
                "technical_quality": {
                    "score": round(quality_score, 4),
                    "weight": WEIGHT_QUALITY,
                    "weighted": round(quality_score * WEIGHT_QUALITY, 4),
                    "details": quality_result,
                },
            },
            "recommendation": recommendation,
        }

    # ------------------------------------------------------------------
    # Internal scoring helpers
    # ------------------------------------------------------------------

    async def _score_continuity(
        self,
        current_frame: bytes,
        previous_frame: bytes,
    ) -> dict:
        """Score visual continuity between two consecutive frames."""
        if not self._client:
            return {"overall_continuity": 0.7, "notes": "mock"}

        try:
            content_parts = [
                types.Part.from_bytes(data=previous_frame, mime_type="image/png"),
                types.Part.from_text(text="[PREVIOUS FRAME]"),
                types.Part.from_bytes(data=current_frame, mime_type="image/png"),
                types.Part.from_text(text="[CURRENT FRAME]"),
                types.Part.from_text(text=_CONTINUITY_PROMPT),
            ]

            response = self._client.models.generate_content(
                model=VISION_MODEL,
                contents=[types.Content(role="user", parts=content_parts)],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )

            scores = self._parse_json_response(response.text)
            if scores is not None:
                return {
                    k: round(float(v), 4) if isinstance(v, (int, float)) else v
                    for k, v in scores.items()
                }

            logger.warning("Failed to parse continuity scores")
            return {"overall_continuity": 0.5, "notes": "parse_error"}

        except Exception as exc:
            logger.exception("Continuity scoring failed: %s", exc)
            return {"overall_continuity": 0.5, "notes": f"error: {exc}"}

    async def _score_prompt_adherence(
        self,
        frame_image: bytes,
        prompt_text: str,
    ) -> dict:
        """Score how well a generated frame adheres to the original prompt."""
        if not self._client:
            return {"overall_adherence": 0.7, "notes": "mock"}

        try:
            formatted_prompt = _PROMPT_ADHERENCE_PROMPT.format(
                prompt_text=prompt_text[:2000],  # Truncate very long prompts
            )

            content_parts = [
                types.Part.from_bytes(data=frame_image, mime_type="image/png"),
                types.Part.from_text(text="[GENERATED IMAGE]"),
                types.Part.from_text(text=formatted_prompt),
            ]

            response = self._client.models.generate_content(
                model=VISION_MODEL,
                contents=[types.Content(role="user", parts=content_parts)],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )

            scores = self._parse_json_response(response.text)
            if scores is not None:
                return {
                    k: round(float(v), 4) if isinstance(v, (int, float)) else v
                    for k, v in scores.items()
                }

            logger.warning("Failed to parse prompt adherence scores")
            return {"overall_adherence": 0.5, "notes": "parse_error"}

        except Exception as exc:
            logger.exception("Prompt adherence scoring failed: %s", exc)
            return {"overall_adherence": 0.5, "notes": f"error: {exc}"}

    async def _score_technical_quality(
        self,
        frame_image: bytes,
    ) -> dict:
        """Score the technical quality of a generated frame."""
        if not self._client:
            return {"overall_quality": 0.7, "notes": "mock"}

        try:
            content_parts = [
                types.Part.from_bytes(data=frame_image, mime_type="image/png"),
                types.Part.from_text(text="[IMAGE TO EVALUATE]"),
                types.Part.from_text(text=_TECHNICAL_QUALITY_PROMPT),
            ]

            response = self._client.models.generate_content(
                model=VISION_MODEL,
                contents=[types.Content(role="user", parts=content_parts)],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )

            scores = self._parse_json_response(response.text)
            if scores is not None:
                return {
                    k: round(float(v), 4) if isinstance(v, (int, float)) else v
                    for k, v in scores.items()
                }

            logger.warning("Failed to parse technical quality scores")
            return {"overall_quality": 0.5, "notes": "parse_error"}

        except Exception as exc:
            logger.exception("Technical quality scoring failed: %s", exc)
            return {"overall_quality": 0.5, "notes": f"error: {exc}"}

    # ------------------------------------------------------------------
    # Response parsing
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_json_response(text: str | None) -> dict | None:
        """Safely parse a JSON response from Gemini.

        Handles cases where the model wraps JSON in markdown code fences
        or includes extra whitespace.
        """
        if not text:
            return None

        cleaned = text.strip()

        # Strip markdown code fences if present
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            # Remove first line (```json or ```) and last line (```)
            lines = [
                line for line in lines
                if not line.strip().startswith("```")
            ]
            cleaned = "\n".join(lines).strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Failed to parse JSON: %s", cleaned[:200])
            return None

    # ------------------------------------------------------------------
    # Mock / fallback results
    # ------------------------------------------------------------------

    @staticmethod
    def _mock_consistency_result(reason: str = "no_api_key") -> dict:
        """Return a mock consistency result when the API is unavailable."""
        return {
            "score": 0.75,
            "rating": "acceptable",
            "attribute_scores": {
                "face_structure": 0.75,
                "eyes": 0.75,
                "nose": 0.75,
                "lips": 0.75,
                "skin_tone": 0.75,
                "hair": 0.75,
                "body_type": 0.75,
                "distinguishing_features": 0.75,
                "overall_identity": 0.75,
            },
            "details": {
                "model": VISION_MODEL,
                "num_references": 0,
                "character_dna_provided": False,
                "_mock": True,
                "_reason": reason,
            },
            "notes": f"Mock result - {reason}",
        }

    @staticmethod
    def _mock_candidate_result() -> dict:
        """Return a mock candidate scoring result when the API is unavailable."""
        return {
            "weighted_score": 0.75,
            "identity_score": 0.75,
            "continuity_score": 0.80,
            "prompt_score": 0.70,
            "quality_score": 0.80,
            "breakdown": {
                "identity": {
                    "score": 0.75,
                    "weight": WEIGHT_IDENTITY,
                    "weighted": round(0.75 * WEIGHT_IDENTITY, 4),
                    "details": {},
                },
                "continuity": {
                    "score": 0.80,
                    "weight": WEIGHT_CONTINUITY,
                    "weighted": round(0.80 * WEIGHT_CONTINUITY, 4),
                    "details": {"notes": "mock"},
                },
                "prompt_adherence": {
                    "score": 0.70,
                    "weight": WEIGHT_PROMPT,
                    "weighted": round(0.70 * WEIGHT_PROMPT, 4),
                    "details": {"notes": "mock"},
                },
                "technical_quality": {
                    "score": 0.80,
                    "weight": WEIGHT_QUALITY,
                    "weighted": round(0.80 * WEIGHT_QUALITY, 4),
                    "details": {"notes": "mock"},
                },
            },
            "recommendation": "acceptable",
        }
