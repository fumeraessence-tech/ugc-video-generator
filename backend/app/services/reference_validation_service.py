"""Reference image validation and angle classification service.

Uses Gemini Vision to auto-detect image angles and select optimal references
for each scene based on camera angle.
"""

import json
import logging
from pathlib import Path

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

REQUIRED_ANGLES = {"front", "left_profile", "right_profile"}
RECOMMENDED_ANGLES = {"back", "three_quarter_left", "three_quarter_right"}
ALL_ANGLES = REQUIRED_ANGLES | RECOMMENDED_ANGLES

# Map camera angles in scene prompts to which reference angles are most useful
CAMERA_TO_REFERENCE_MAP: dict[str, list[str]] = {
    "eye_level": ["front", "three_quarter_left", "three_quarter_right"],
    "front": ["front", "three_quarter_left", "three_quarter_right"],
    "side": ["left_profile", "right_profile", "three_quarter_left"],
    "side_left": ["left_profile", "three_quarter_left", "front"],
    "side_right": ["right_profile", "three_quarter_right", "front"],
    "high": ["front", "three_quarter_left", "three_quarter_right"],
    "low": ["front", "three_quarter_left", "three_quarter_right"],
    "dutch": ["front", "three_quarter_left", "three_quarter_right"],
    "overhead": ["front", "back"],
    "behind": ["back", "three_quarter_left", "three_quarter_right"],
    "three_quarter": ["three_quarter_left", "three_quarter_right", "front"],
}


class ReferenceValidationService:
    """Validate and classify avatar/product reference images by angle."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)

    async def classify_image_angle(self, image_data: bytes, mime_type: str = "image/jpeg") -> str:
        """Classify which angle a photo represents using Gemini Vision.

        Returns one of: front, left_profile, right_profile, back,
        three_quarter_left, three_quarter_right
        """
        if not self._client:
            return "front"  # Default when no API key

        try:
            image_part = types.Part.from_bytes(data=image_data, mime_type=mime_type)
            prompt = """Analyze this photo of a person and classify the camera angle.

Respond with ONLY ONE of these exact values:
- "front" - Face is directly facing the camera (both eyes clearly visible, nose centered)
- "left_profile" - Person is turned to show their LEFT side (viewer sees their left ear/cheek)
- "right_profile" - Person is turned to show their RIGHT side (viewer sees their right ear/cheek)
- "back" - Back of the person's head is facing camera
- "three_quarter_left" - Person is turned ~45 degrees to their left (between front and left profile)
- "three_quarter_right" - Person is turned ~45 degrees to their right (between front and right profile)

Respond with ONLY the classification value, nothing else."""

            response = self._client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[types.Content(role="user", parts=[image_part, types.Part.from_text(text=prompt)])],
                config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=50),
            )

            result = (response.text or "").strip().strip('"').lower()

            valid_angles = {"front", "left_profile", "right_profile", "back", "three_quarter_left", "three_quarter_right"}
            if result in valid_angles:
                logger.info(f"Image classified as: {result}")
                return result

            logger.warning(f"Unexpected angle classification: {result}, defaulting to 'front'")
            return "front"

        except Exception as e:
            logger.error(f"Angle classification failed: {e}")
            return "front"

    async def validate_character_references(
        self,
        reference_angles: dict[str, str],
    ) -> dict:
        """Validate that required angles are covered.

        Args:
            reference_angles: dict mapping angle -> image URL

        Returns:
            {
                "complete": bool,
                "missing": ["left_profile"],
                "recommended_missing": ["back"],
                "coverage": "2/3",
                "total_images": 3
            }
        """
        available = set(reference_angles.keys())
        required_covered = REQUIRED_ANGLES & available
        missing = list(REQUIRED_ANGLES - available)
        recommended_missing = list(RECOMMENDED_ANGLES - available)

        return {
            "complete": len(missing) == 0,
            "missing": missing,
            "recommended_missing": recommended_missing,
            "coverage": f"{len(required_covered)}/{len(REQUIRED_ANGLES)}",
            "total_images": len(reference_angles),
            "available_angles": sorted(list(available)),
        }

    def select_best_references_for_scene(
        self,
        camera_angle: str,
        available_refs: dict[str, str],
        max_refs: int = 3,
    ) -> list[str]:
        """Pick the best reference images for a scene based on camera angle.

        Args:
            camera_angle: The camera angle for this scene (e.g., "eye_level", "side")
            available_refs: dict mapping angle -> image URL
            max_refs: Maximum number of references to return

        Returns:
            List of image URLs, ordered by relevance to the camera angle
        """
        if not available_refs:
            return []

        # Get the preferred reference angles for this camera angle
        preferred = CAMERA_TO_REFERENCE_MAP.get(
            camera_angle.lower().replace(" ", "_"),
            ["front", "three_quarter_left", "three_quarter_right"],
        )

        selected: list[str] = []

        # First, add preferred angles in order
        for angle in preferred:
            if angle in available_refs and available_refs[angle] not in selected:
                selected.append(available_refs[angle])
                if len(selected) >= max_refs:
                    break

        # If we still need more, add remaining angles
        if len(selected) < max_refs:
            for angle, url in available_refs.items():
                if url not in selected:
                    selected.append(url)
                    if len(selected) >= max_refs:
                        break

        logger.info(
            f"Selected {len(selected)} references for camera_angle='{camera_angle}': "
            f"angles={preferred[:len(selected)]}"
        )
        return selected

    async def classify_product_image_angle(
        self, image_data: bytes, mime_type: str = "image/jpeg"
    ) -> str:
        """Classify which angle a product photo represents.

        Returns one of: front, back, side, top, detail, angle_45
        """
        if not self._client:
            return "front"

        try:
            image_part = types.Part.from_bytes(data=image_data, mime_type=mime_type)
            prompt = """Analyze this product photo and classify the viewing angle.

Respond with ONLY ONE of these exact values:
- "front" - Product shown from the front/label side
- "back" - Product shown from the back/ingredients side
- "side" - Product shown from a side angle
- "top" - Product shown from above
- "detail" - Close-up detail shot of product texture/branding
- "angle_45" - Product shown at approximately 45-degree angle

Respond with ONLY the classification value, nothing else."""

            response = self._client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[types.Content(role="user", parts=[image_part, types.Part.from_text(text=prompt)])],
                config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=50),
            )

            result = (response.text or "").strip().strip('"').lower()
            valid = {"front", "back", "side", "top", "detail", "angle_45"}
            if result in valid:
                return result

            return "front"

        except Exception as e:
            logger.error(f"Product angle classification failed: {e}")
            return "front"

    async def load_and_classify_images(
        self, image_urls: list[str]
    ) -> dict[str, str]:
        """Load images from URLs and classify their angles.

        Returns dict mapping angle -> URL.
        """
        result: dict[str, str] = {}

        for url in image_urls:
            image_data = await self._load_image(url)
            if not image_data:
                continue

            angle = await self.classify_image_angle(
                image_data["bytes"], image_data["mime_type"]
            )

            # If we already have this angle, keep the first one (don't overwrite)
            if angle not in result:
                result[angle] = url
            else:
                # Try to find a different angle for this image or use a numbered variant
                for alt_angle in ALL_ANGLES:
                    if alt_angle not in result:
                        result[alt_angle] = url
                        break

        return result

    async def _load_image(self, image_url: str) -> dict | None:
        """Load image bytes from local path or URL."""
        try:
            if image_url.startswith("/uploads/"):
                backend_dir = Path(__file__).resolve().parents[2]
                frontend_dir = backend_dir.parent / "frontend"
                file_path = frontend_dir / "public" / image_url.lstrip("/")

                if file_path.exists():
                    image_bytes = file_path.read_bytes()
                    ext = file_path.suffix.lower()
                    mime_map = {
                        ".jpg": "image/jpeg",
                        ".jpeg": "image/jpeg",
                        ".png": "image/png",
                        ".webp": "image/webp",
                    }
                    return {"bytes": image_bytes, "mime_type": mime_map.get(ext, "image/jpeg")}

            elif image_url.startswith("http://") or image_url.startswith("https://"):
                import httpx
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(image_url)
                    resp.raise_for_status()
                    content_type = resp.headers.get("content-type", "image/jpeg")
                    return {"bytes": resp.content, "mime_type": content_type.split(";")[0].strip()}

        except Exception as e:
            logger.warning(f"Failed to load image {image_url}: {e}")

        return None
