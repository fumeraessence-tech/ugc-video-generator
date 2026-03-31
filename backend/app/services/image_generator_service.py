"""Image Generator Service.

Simple and direct approach — mirrors how a human uses Gemini manually:
  1. Upload reference scene + bottle images + (optional) box images
  2. Give a short, clear instruction: "Replace the bottle, keep everything else"
  3. Each shot type is just a small variation of this core instruction

Key principle: SHORT prompts work better than verbose ones for image generation.
"""

import asyncio
import io
import json
import logging
import re
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_FRONTEND_DIR = _BACKEND_DIR.parent / "frontend"
_UPLOADS_DIR = _FRONTEND_DIR / "public" / "uploads" / "image-generator"

MAX_REF_IMAGE_BYTES = 500_000

# Models ordered by image editing quality (not speed)
# gemini-2.0-flash-exp is best at reference-based editing
MODELS_TO_TRY = [
    "gemini-2.0-flash-exp-image-generation",
    "gemini-2.5-flash-image",
    "gemini-3-pro-image-preview",
]

# ─── Shot Type Definitions ────────────────────────────────────────

SHOT_TYPES = [
    {"key": "hero_replace", "label": "Hero Shot", "uses_box": False},
    {"key": "with_box", "label": "With Box", "uses_box": True},
    {"key": "single_shot", "label": "Single Shot", "uses_box": False},
    {"key": "dynamic_angle", "label": "Dynamic Angle", "uses_box": False},
    {"key": "detail_closeup", "label": "Detail Close-up", "uses_box": False},
]

SHOT_TYPE_MAP = {s["key"]: s for s in SHOT_TYPES}


def _extract_json(text: str) -> dict:
    """Robustly extract JSON from Gemini response."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last > first:
        raw = re.sub(r",\s*([}\]])", r"\1", text[first:last + 1])
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not parse JSON: {text[:300]}")


# ─── Scene Analysis Prompt ────────────────────────────────────────

SCENE_ANALYSIS_PROMPT = """Analyze this reference scene image. Extract in JSON:
{
  "mood": "overall feeling",
  "lighting": "direction and type",
  "surface": "what the product sits on",
  "background": "background description",
  "product_position": "where/how the product is placed",
  "camera_angle": "shooting angle"
}
Return ONLY valid JSON."""


class ImageGeneratorService:
    """Generates product images using simple replace-bottle technique."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client = genai.Client(api_key=self._api_key)

    # ─── Public: Streaming Generation ─────────────────────────────

    async def generate_all_shots_streaming(
        self,
        product_images: list[str],
        reference_images: list[str],
        product_name: str,
        brand_name: str = "",
        liquid_color: str = "",
        product_dna: dict | None = None,
        shot_types: list[str] | None = None,
        bottle_images: list[str] | None = None,
        box_images: list[str] | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Generate shots one by one, yielding each result."""
        shots = shot_types or [s["key"] for s in SHOT_TYPES]

        # Resolve image sources
        bottle_urls = bottle_images if bottle_images else product_images
        box_urls = box_images or []

        # Pre-load all images once
        bottle_parts = await self._load_images(bottle_urls)
        box_parts = await self._load_images(box_urls) if box_urls else []
        reference_parts = await self._load_images(reference_images)

        if not reference_parts:
            yield {"event": "error", "shot_type": "", "message": "No reference images could be loaded"}
            return
        if not bottle_parts:
            yield {"event": "error", "shot_type": "", "message": "No bottle images could be loaded"}
            return

        logger.info(
            "Loaded refs: %d reference, %d bottle, %d box",
            len(reference_parts), len(bottle_parts), len(box_parts),
        )

        # Analyze reference scene
        yield {"event": "analyzing", "message": "Analyzing reference scene..."}
        scene_analysis = await self._analyze_reference_scene(reference_images[0])
        if scene_analysis:
            logger.info("Scene analysis: %s", json.dumps(scene_analysis)[:300])
            yield {"event": "analysis_complete", "analysis": scene_analysis, "message": "Scene analysis complete"}

        # Generate each shot
        for idx, shot_key in enumerate(shots):
            shot_info = SHOT_TYPE_MAP.get(shot_key)
            if not shot_info:
                continue

            try:
                prompt = self._build_prompt(
                    shot_key=shot_key,
                    product_name=product_name,
                    brand_name=brand_name,
                    liquid_color=liquid_color,
                    product_dna=product_dna,
                    scene_analysis=scene_analysis,
                    has_box=(shot_info["uses_box"] and len(box_parts) > 0),
                )

                # ALL shots use reference scene + bottle refs
                # "with_box" additionally gets box refs
                shot_parts = self._build_content_parts(
                    reference_parts=reference_parts,
                    bottle_parts=bottle_parts,
                    box_parts=box_parts if shot_info["uses_box"] else [],
                    prompt=prompt,
                )

                image_url = await self._generate_image(shot_parts, shot_key)

                yield {
                    "event": "image",
                    "shot_type": shot_key,
                    "label": shot_info["label"],
                    "image_url": image_url,
                    "prompt": prompt,
                    "index": idx,
                    "total": len(shots),
                }
            except Exception as e:
                logger.exception("Failed to generate %s", shot_key)
                yield {
                    "event": "error",
                    "shot_type": shot_key,
                    "label": shot_info["label"],
                    "message": str(e),
                    "index": idx,
                    "total": len(shots),
                }

    # ─── Public: Single Shot Regeneration ─────────────────────────

    async def generate_single_shot(
        self,
        shot_type: str,
        product_images: list[str],
        reference_images: list[str],
        product_name: str,
        brand_name: str = "",
        liquid_color: str = "",
        product_dna: dict | None = None,
        bottle_images: list[str] | None = None,
        box_images: list[str] | None = None,
    ) -> dict:
        """Generate a single shot for regeneration."""
        shot_info = SHOT_TYPE_MAP.get(shot_type)
        if not shot_info:
            raise ValueError(f"Unknown shot type: {shot_type}")

        bottle_urls = bottle_images if bottle_images else product_images
        box_urls = box_images or []

        bottle_parts = await self._load_images(bottle_urls)
        box_parts = await self._load_images(box_urls) if box_urls else []
        reference_parts = await self._load_images(reference_images)

        if not reference_parts:
            raise ValueError("No reference images could be loaded")

        scene_analysis = await self._analyze_reference_scene(reference_images[0])

        prompt = self._build_prompt(
            shot_key=shot_type,
            product_name=product_name,
            brand_name=brand_name,
            liquid_color=liquid_color,
            product_dna=product_dna,
            scene_analysis=scene_analysis,
            has_box=(shot_info["uses_box"] and len(box_parts) > 0),
        )

        shot_parts = self._build_content_parts(
            reference_parts=reference_parts,
            bottle_parts=bottle_parts,
            box_parts=box_parts if shot_info["uses_box"] else [],
            prompt=prompt,
        )

        image_url = await self._generate_image(shot_parts, shot_type)

        return {
            "shot_type": shot_type,
            "label": shot_info["label"],
            "image_url": image_url,
            "prompt": prompt,
        }

    # ─── Scene Analysis ───────────────────────────────────────────

    async def _analyze_reference_scene(self, image_url: str) -> dict | None:
        """Quick scene analysis with Gemini Vision."""
        try:
            img_data = await self._load_single_image(image_url)
            if not img_data:
                return None

            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=img_data["bytes"], mime_type=img_data["mime_type"]),
                    SCENE_ANALYSIS_PROMPT,
                ],
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=1024,
                    response_mime_type="application/json",
                ),
            )

            text = (response.text or "").strip()
            return _extract_json(text) if text else None
        except Exception as e:
            logger.warning("Scene analysis failed: %s", e)
            return None

    # ─── Content Parts Assembly ───────────────────────────────────

    def _build_content_parts(
        self,
        reference_parts: list[types.Part],
        bottle_parts: list[types.Part],
        box_parts: list[types.Part],
        prompt: str,
    ) -> list[types.Part]:
        """Assemble: prompt text FIRST, then images in order.

        Putting the text instruction before the images helps the model
        understand the ROLE of each image as it processes them.
        """
        all_parts: list[types.Part] = []

        # Text instruction FIRST — model reads this then interprets images
        all_parts.append(types.Part.from_text(text=prompt))

        # Images in order: reference scene → bottle → box
        all_parts.extend(reference_parts)
        all_parts.extend(bottle_parts)
        all_parts.extend(box_parts)

        return all_parts

    # ─── Prompt Building — NATURAL LANGUAGE STYLE ──────────────────

    def _build_prompt(
        self,
        shot_key: str,
        product_name: str,
        brand_name: str,
        liquid_color: str,
        product_dna: dict | None,
        scene_analysis: dict | None,
        has_box: bool,
    ) -> str:
        """Build prompt in natural conversational style — like how a human instructs Gemini.

        Pattern: "Using these reference images: Take [X] from [scene image].
        Remove [old product]. Place [our bottle] (same shape as [bottle image]) in its place.
        Change [specific text]. Keep [everything else]."
        """

        liquid = liquid_color or "as shown in the bottle reference"

        if shot_key == "hero_replace":
            prompt = (
                f"Using these reference images: "
                f"Take the background setting, surface, props, and lighting from the first image. "
                f"Remove the existing bottle. "
                f"Place a {brand_name} perfume bottle (same exact shape, glass, and cap as the second image) in its place. "
                f"The perfume liquid should be {liquid}. "
                f"On the bottle's black label band, replace the product name with '{product_name}' using white serif typography. "
                f"Keep '{brand_name}' logo and 'ESSENCE' text exactly as shown on the second image, but make all text white. "
                f"Maintain the same dramatic lighting, camera angle, and composition from the first image. "
                f"No box — bottle only. "
                f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
            )

        elif shot_key == "with_box":
            if has_box:
                prompt = (
                    f"Using these reference images: "
                    f"Take the background setting, surface, props, and lighting from the first image. "
                    f"Remove the existing bottle. "
                    f"Place a {brand_name} perfume bottle (same exact shape as the second image) and "
                    f"the {brand_name} packaging box (same exact design as the third image) side by side. "
                    f"The perfume liquid should be {liquid}. "
                    f"On the bottle's black label band, replace the product name with '{product_name}' in white text. "
                    f"Keep '{brand_name}' logo and 'ESSENCE' text exactly as shown on the bottle reference, but all text in white. "
                    f"The box should be cloned exactly from the third image — same gradient, same typography, same proportions. "
                    f"Bottle slightly in front, box beside it, both sitting naturally on the surface. "
                    f"Maintain the same lighting and atmosphere from the first image. "
                    f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
                )
            else:
                prompt = (
                    f"Using these reference images: "
                    f"Take the background setting, surface, props, and lighting from the first image. "
                    f"Remove the existing bottle. "
                    f"Place a {brand_name} perfume bottle (same exact shape as the second image) and a packaging box side by side. "
                    f"The perfume liquid should be {liquid}. "
                    f"On the bottle's black label band, replace the product name with '{product_name}' in white text. "
                    f"Keep '{brand_name}' logo and 'ESSENCE' text exactly as shown. "
                    f"Maintain the same lighting from the first image. "
                    f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
                )

        elif shot_key == "single_shot":
            prompt = (
                f"Using these reference images: "
                f"Take the background setting, surface, and lighting from the first image. "
                f"Remove the existing bottle and any clutter. "
                f"Place a {brand_name} perfume bottle (same exact shape, glass, and cap as the second image) as the sole hero subject. "
                f"The perfume liquid should be {liquid}. "
                f"On the bottle's black label band, replace the product name with '{product_name}' using white serif typography. "
                f"Keep '{brand_name}' logo and 'ESSENCE' text exactly as shown on the second image, but make all text white. "
                f"Clean composition — bottle fills 60-70% of frame. "
                f"Maintain the same lighting and mood from the first image. "
                f"No box — bottle only. "
                f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
            )

        elif shot_key == "dynamic_angle":
            prompt = (
                f"Using these reference images: "
                f"Take the background setting, surface, props, and lighting from the first image. "
                f"Remove the existing bottle. "
                f"Place a {brand_name} perfume bottle (same exact shape as the second image) tilted at a dramatic ~30° angle, "
                f"leaning against a prop in the scene. "
                f"The perfume liquid should be {liquid}. "
                f"On the bottle's black label band, replace the product name with '{product_name}' in white text. "
                f"Keep '{brand_name}' logo and 'ESSENCE' text exactly as shown on the second image, but all text in white. "
                f"The tilt should look intentional and artistic. Liquid shifts naturally with gravity. "
                f"Maintain the same dramatic lighting from the first image. "
                f"No box — bottle only. "
                f"Professional luxury perfume commercial photography. 1:1 aspect ratio."
            )

        elif shot_key == "detail_closeup":
            prompt = (
                f"Using these reference images: "
                f"Take the lighting direction and color palette from the first image. "
                f"Create an extreme close-up/macro shot of the {brand_name} perfume bottle from the second image. "
                f"The perfume liquid should be {liquid}. "
                f"Tight crop on the label and cap area. "
                f"On the black label band, the product name '{product_name}' and '{brand_name}' logo must be tack-sharp "
                f"and clearly readable — all in white text. "
                f"Keep the exact same bottle shape, cap (gold ring + black ribbed), and label band design from the second image. "
                f"Shallow depth of field — label sharp, edges soft. Bottle fills 85%+ of frame. "
                f"Professional luxury perfume macro photography. 1:1 aspect ratio."
            )

        else:
            prompt = (
                f"Using these reference images: "
                f"Take the background from the first image. Replace the bottle with the one from the second image. "
                f"Change the product name to '{product_name}', make all label text white. "
                f"Keep everything else exactly the same. 1:1 aspect ratio."
            )

        return prompt

    # ─── Image Generation ─────────────────────────────────────────

    async def _generate_image(self, parts: list[types.Part], shot_key: str) -> str:
        """Try multiple models to generate the image."""
        for model_name in MODELS_TO_TRY:
            try:
                logger.info("Image gen [%s]: trying %s (%d parts)", shot_key, model_name, len(parts))
                config = types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                    image_config=types.ImageConfig(aspect_ratio="1:1"),
                )
                response = await asyncio.to_thread(
                    self._client.models.generate_content,
                    model=model_name,
                    contents=[types.Content(role="user", parts=parts)],
                    config=config,
                )
                image_url = self._extract_and_save(response, shot_key)
                if image_url:
                    logger.info("Image gen [%s]: %s succeeded", shot_key, model_name)
                    return image_url
                logger.warning("Image gen [%s]: %s returned no image", shot_key, model_name)
            except Exception as e:
                logger.warning("Image gen [%s]: %s failed: %s", shot_key, model_name, e)
                continue

        return await self._imagen_fallback(parts, shot_key)

    # ─── Image Loading ────────────────────────────────────────────

    async def _load_images(self, urls: list[str]) -> list[types.Part]:
        """Load images and return as Gemini Parts."""
        parts: list[types.Part] = []
        for url in urls:
            img_data = await self._load_single_image(url)
            if img_data:
                parts.append(
                    types.Part.from_bytes(data=img_data["bytes"], mime_type=img_data["mime_type"])
                )
        return parts

    async def _load_single_image(self, url_path: str) -> dict | None:
        """Load image bytes from local path or URL, compressing if needed."""
        image_bytes: bytes | None = None
        mime_type: str = "image/jpeg"

        try:
            if url_path.startswith("/uploads/"):
                file_path = _FRONTEND_DIR / "public" / url_path.lstrip("/")
                if file_path.exists():
                    image_bytes = file_path.read_bytes()
                    ext = file_path.suffix.lower()
                    mime_type = {
                        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                        ".png": "image/png", ".webp": "image/webp",
                    }.get(ext, "image/jpeg")
                else:
                    logger.warning("Image not found: %s", file_path)
                    return None
            elif url_path.startswith("http"):
                import httpx
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.get(url_path)
                    resp.raise_for_status()
                    content_type = resp.headers.get("content-type", "image/jpeg")
                    mime_type = content_type.split(";")[0].strip()
                    image_bytes = resp.content
            else:
                file_path = Path(url_path)
                if file_path.exists():
                    image_bytes = file_path.read_bytes()
                else:
                    logger.warning("Image not found: %s", url_path)
                    return None

            if image_bytes is None:
                return None

            original_size = len(image_bytes)
            image_bytes, mime_type = self._compress_image(image_bytes, mime_type)
            logger.info("Loaded: %s (%s → %s bytes)", url_path[:60], f"{original_size:,}", f"{len(image_bytes):,}")
            return {"bytes": image_bytes, "mime_type": mime_type}

        except Exception as e:
            logger.warning("Failed to load %s: %s", url_path, e)
            return None

    @staticmethod
    def _compress_image(image_bytes: bytes, mime_type: str, max_bytes: int = MAX_REF_IMAGE_BYTES) -> tuple[bytes, str]:
        """Compress image to JPEG if over max_bytes."""
        if len(image_bytes) <= max_bytes:
            return image_bytes, mime_type
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(image_bytes))
            max_dim = 2048
            if max(img.size) > max_dim:
                img.thumbnail((max_dim, max_dim), Image.LANCZOS)
            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")
            for q in (85, 75, 60, 45, 30):
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=q, optimize=True)
                if buf.tell() <= max_bytes:
                    return buf.getvalue(), "image/jpeg"
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=30, optimize=True)
            return buf.getvalue(), "image/jpeg"
        except Exception as e:
            logger.warning("Compression failed: %s", e)
            return image_bytes, mime_type

    # ─── Save / Extract ───────────────────────────────────────────

    def _extract_and_save(self, response: types.GenerateContentResponse, prefix: str) -> str:
        """Extract image from Gemini response and save."""
        if not response.candidates:
            return ""
        candidate = response.candidates[0]
        if not candidate.content or not candidate.content.parts:
            return ""
        for part in candidate.content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                image_bytes = part.inline_data.data
                if image_bytes:
                    return self._save_image(image_bytes, prefix)
        return ""

    def _save_image(self, image_bytes: bytes, prefix: str) -> str:
        """Save image bytes to uploads directory."""
        _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{prefix}-{uuid.uuid4().hex[:8]}.png"
        filepath = _UPLOADS_DIR / filename
        with open(filepath, "wb") as f:
            f.write(image_bytes)
        url = f"/uploads/image-generator/{filename}"
        logger.info("Saved: %s (%d bytes)", url, len(image_bytes))
        return url

    async def _imagen_fallback(self, parts: list[types.Part], prefix: str) -> str:
        """Fallback to Imagen text-only."""
        # Extract text from parts for Imagen
        prompt_text = ""
        for part in parts:
            if hasattr(part, "text") and part.text:
                prompt_text = part.text
                break
        if not prompt_text:
            return ""
        try:
            response = await asyncio.to_thread(
                self._client.models.generate_images,
                model="imagen-4.0-fast-generate-001",
                prompt=prompt_text,
                config=types.GenerateImagesConfig(number_of_images=1, aspect_ratio="1:1"),
            )
            if response.generated_images:
                image = response.generated_images[0]
                if hasattr(image, "image") and image.image and hasattr(image.image, "image_bytes") and image.image.image_bytes:
                    return self._save_image(image.image.image_bytes, f"{prefix}-imagen")
        except Exception as e:
            logger.exception("Imagen fallback failed: %s", e)
        return ""
