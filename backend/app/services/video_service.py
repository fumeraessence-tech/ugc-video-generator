"""Video generation service using Veo 3.1 with reference image support."""

import logging
import time
import uuid
from pathlib import Path

from google import genai
from google.genai import types
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Available Veo models
VEO_MODELS = {
    "veo-3.1": "veo-3.1-generate-preview",
    "veo-3.1-fast": "veo-3.1-fast-generate-preview",
    "veo-3.0": "veo-3.0-generate-001",
    "veo-3.0-fast": "veo-3.0-fast-generate-001",
    "veo-2.0": "veo-2.0-generate-001",
}


class VideoService:
    """Generates video clips using Veo 3.1 with reference image support."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)

    async def generate_scene_videos(
        self,
        scene_number: int,
        prompt: str,
        storyboard_image_url: str | None = None,
        product_images: list[str] | None = None,
        avatar_images: list[str] | None = None,
        num_clips: int = 1,
        duration_seconds: int = 8,
        aspect_ratio: str = "9:16",
        model: str = "veo-3.1",
        generate_audio: bool = False,
    ) -> list[dict]:
        """Generate multiple video clips for a single scene.

        Args:
            scene_number: Scene number for identification
            prompt: Detailed scene prompt
            storyboard_image_url: Storyboard image to use as style reference
            product_images: Product images to use as asset references
            avatar_images: Avatar images for character consistency
            num_clips: Number of video clips to generate (1-3)
            duration_seconds: Duration per clip (max 8)
            aspect_ratio: Video aspect ratio (9:16, 16:9, 1:1)
            model: Veo model to use
            generate_audio: Whether to generate audio with the video

        Returns:
            List of dicts with video_url, status, clip_number
        """
        if self._client is None:
            logger.warning("No Gemini API key -- returning mock videos")
            return [self._mock_video(scene_number, i + 1) for i in range(num_clips)]

        # Get the actual model name
        model_name = VEO_MODELS.get(model, VEO_MODELS["veo-3.1"])

        # Load reference images
        reference_images = []

        # Max 4 reference images total - prioritize: product (2) + avatar (1) + storyboard (1)
        remaining_slots = 4

        # Add product images as ASSET references (for product consistency)
        if product_images and remaining_slots > 0:
            for img_url in product_images[:min(2, remaining_slots)]:
                img_data = await self._load_image(img_url)
                if img_data:
                    ref = types.VideoGenerationReferenceImage(
                        image=types.Image(
                            image_bytes=img_data["bytes"],
                            mime_type=img_data["mime_type"],
                        ),
                        reference_type=types.VideoGenerationReferenceType.ASSET,
                    )
                    reference_images.append(ref)
                    remaining_slots -= 1
                    logger.info("Added product/packaging image as ASSET reference")

        # Add avatar images as ASSET references (for character consistency)
        if avatar_images and remaining_slots > 0:
            for img_url in avatar_images[:min(1, remaining_slots)]:
                img_data = await self._load_image(img_url)
                if img_data:
                    ref = types.VideoGenerationReferenceImage(
                        image=types.Image(
                            image_bytes=img_data["bytes"],
                            mime_type=img_data["mime_type"],
                        ),
                        reference_type=types.VideoGenerationReferenceType.ASSET,
                    )
                    reference_images.append(ref)
                    remaining_slots -= 1
                    logger.info("Added avatar image as ASSET reference")

        # Add storyboard image as ASSET reference (STYLE not supported by Veo API)
        if storyboard_image_url and remaining_slots > 0:
            img_data = await self._load_image(storyboard_image_url)
            if img_data:
                ref = types.VideoGenerationReferenceImage(
                    image=types.Image(
                        image_bytes=img_data["bytes"],
                        mime_type=img_data["mime_type"],
                    ),
                    reference_type=types.VideoGenerationReferenceType.ASSET,
                )
                reference_images.append(ref)
                remaining_slots -= 1
                logger.info("Added storyboard image as ASSET reference")

        logger.info(f"🎬 Generating {num_clips} video clip(s) for scene {scene_number}")
        logger.info(f"   Model: {model_name}")
        logger.info(f"   Duration: {duration_seconds}s")
        logger.info(f"   Aspect ratio: {aspect_ratio}")
        logger.info(f"   Reference images: {len(reference_images)}")
        logger.info(f"   Generate audio: {generate_audio}")

        results = []

        for clip_num in range(1, num_clips + 1):
            try:
                result = await self._generate_single_video(
                    scene_number=scene_number,
                    clip_number=clip_num,
                    prompt=prompt,
                    reference_images=reference_images,
                    duration_seconds=duration_seconds,
                    aspect_ratio=aspect_ratio,
                    model_name=model_name,
                    generate_audio=generate_audio,
                )
                results.append(result)
            except Exception as e:
                logger.exception(f"Failed to generate clip {clip_num} for scene {scene_number}: {e}")
                results.append({
                    "scene_number": scene_number,
                    "clip_number": clip_num,
                    "video_url": "",
                    "status": "failed",
                    "error": str(e),
                })

        return results

    async def _generate_single_video(
        self,
        scene_number: int,
        clip_number: int,
        prompt: str,
        reference_images: list,
        duration_seconds: int,
        aspect_ratio: str,
        model_name: str,
        generate_audio: bool,
    ) -> dict:
        """Generate a single video clip."""

        logger.info(f"🎥 Starting generation: Scene {scene_number}, Clip {clip_number}")

        # Build config - note: personGeneration not supported with reference images
        # Veo API requires duration between 5-8 seconds
        config_kwargs = {
            "aspect_ratio": aspect_ratio,
            "duration_seconds": max(5, min(duration_seconds, 8)),  # Range: 5-8s
        }

        if generate_audio:
            config_kwargs["generate_audio"] = True

        if reference_images:
            config_kwargs["reference_images"] = reference_images
        else:
            # Only add person_generation when not using reference images
            config_kwargs["person_generation"] = "allow_all"

        try:
            operation = self._client.models.generate_videos(
                model=model_name,
                prompt=prompt,
                config=types.GenerateVideosConfig(**config_kwargs),
            )

            logger.info(f"   Operation started: {operation.name if hasattr(operation, 'name') else 'unknown'}")

            # Poll until complete with timeout
            start_time = time.time()
            max_wait = 300  # 5 minutes max
            poll_interval = 10

            while not operation.done:
                elapsed = time.time() - start_time
                if elapsed > max_wait:
                    logger.warning(f"   Timeout after {max_wait}s")
                    return {
                        "scene_number": scene_number,
                        "clip_number": clip_number,
                        "video_url": "",
                        "status": "timeout",
                        "error": f"Generation timed out after {max_wait}s",
                    }

                logger.info(f"   Processing... ({int(elapsed)}s elapsed)")
                time.sleep(poll_interval)
                operation = self._client.operations.get(operation)

            # Check result
            if operation.result and operation.result.generated_videos:
                video = operation.result.generated_videos[0]
                video_uri = video.video.uri if video.video else ""

                if video_uri:
                    # Download and save video locally
                    local_url = await self._download_and_save_video(
                        video_uri, scene_number, clip_number
                    )

                    logger.info(f"✅ Scene {scene_number} Clip {clip_number} generated: {local_url}")
                    return {
                        "scene_number": scene_number,
                        "clip_number": clip_number,
                        "video_url": local_url,
                        "original_uri": video_uri,
                        "status": "completed",
                    }

            logger.warning(f"❌ No video in result for Scene {scene_number} Clip {clip_number}")
            return {
                "scene_number": scene_number,
                "clip_number": clip_number,
                "video_url": "",
                "status": "failed",
                "error": "No video in response",
            }

        except Exception as e:
            logger.exception(f"Video generation failed: {e}")
            return {
                "scene_number": scene_number,
                "clip_number": clip_number,
                "video_url": "",
                "status": "failed",
                "error": str(e),
            }

    async def _download_and_save_video(
        self,
        video_uri: str,
        scene_number: int,
        clip_number: int,
    ) -> str:
        """Download video from Gemini and save locally."""
        try:
            # Enable redirects to handle 302 responses from Gemini
            async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
                response = await client.get(video_uri)
                response.raise_for_status()

                video_bytes = response.content
                logger.info(f"Downloaded video: {len(video_bytes)} bytes")

                # Save to frontend public directory
                backend_dir = Path(__file__).resolve().parents[2]
                frontend_dir = backend_dir.parent / "frontend"
                uploads_dir = frontend_dir / "public" / "uploads" / "videos"
                uploads_dir.mkdir(parents=True, exist_ok=True)

                filename = f"scene-{scene_number}-clip-{clip_number}-{uuid.uuid4().hex[:8]}.mp4"
                filepath = uploads_dir / filename

                with open(filepath, 'wb') as f:
                    f.write(video_bytes)

                local_url = f"/uploads/videos/{filename}"
                logger.info(f"💾 Saved video: {local_url}")
                return local_url

        except Exception as e:
            logger.exception(f"Failed to download/save video: {e}")
            return video_uri  # Return original URI as fallback

    async def _load_image(self, image_url: str) -> dict | None:
        """Load an image from local path or URL."""
        try:
            if image_url.startswith('/uploads/'):
                # Local file
                backend_dir = Path(__file__).resolve().parents[2]
                frontend_dir = backend_dir.parent / "frontend"
                file_path = frontend_dir / "public" / image_url.lstrip('/')

                if file_path.exists():
                    with open(file_path, 'rb') as f:
                        image_bytes = f.read()
                    ext = file_path.suffix.lower()
                    mime_type = {
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                        '.webp': 'image/webp',
                    }.get(ext, 'image/jpeg')
                    logger.info(f"✅ Loaded local image: {file_path} ({len(image_bytes)} bytes)")
                    return {"bytes": image_bytes, "mime_type": mime_type}
                else:
                    logger.warning(f"❌ File not found: {file_path}")
                    return None

            elif image_url.startswith('http://') or image_url.startswith('https://'):
                # Remote URL
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(image_url)
                    resp.raise_for_status()
                    content_type = resp.headers.get('content-type', 'image/jpeg')
                    mime_type = content_type.split(';')[0].strip()
                    logger.info(f"✅ Downloaded image: {image_url[:50]}... ({len(resp.content)} bytes)")
                    return {"bytes": resp.content, "mime_type": mime_type}

            else:
                logger.warning(f"❌ Unsupported URL format: {image_url}")
                return None

        except Exception as e:
            logger.warning(f"❌ Failed to load {image_url}: {e}")
            return None

    async def generate_video(
        self,
        scene_prompt: str,
        reference_images: list[str] | None = None,
        duration: int = 8,
    ) -> dict[str, str]:
        """Generate a video clip for a single scene (legacy method).

        Returns dict with keys: video_url, status.
        """
        results = await self.generate_scene_videos(
            scene_number=1,
            prompt=scene_prompt,
            product_images=reference_images,
            num_clips=1,
            duration_seconds=duration,
        )

        if results and results[0].get("status") == "completed":
            return {
                "video_url": results[0].get("video_url", ""),
                "status": "completed",
            }
        return {"video_url": "", "status": "failed"}

    async def extend_video(
        self,
        video_uri: str,
        prompt: str,
        scene_number: int = 1,
        extension_number: int = 1,
    ) -> dict:
        """Extend an existing Veo-generated video by ~7 seconds.

        Args:
            video_uri: Original Veo video URI (NOT a local /uploads/ path).
            prompt: Prompt for the extension content.
            scene_number: Scene number for file naming.
            extension_number: Extension sequence number (1-20).

        Returns:
            Dict with video_url, original_uri, status, scene_number,
            extension_number.

        Notes:
            - Max 20 extensions per video (148 s total from 8 s base).
            - Resolution locked to 720p for extensions.
            - Input video must be a Veo-generated URI, not a local path.
        """
        if self._client is None:
            logger.warning("No Gemini API key -- returning mock extended video")
            return self._mock_video(scene_number, extension_number)

        # Extensions require the original Veo URI
        if video_uri.startswith("/uploads/"):
            logger.error("Extension requires original Veo URI, not local path")
            return {
                "scene_number": scene_number,
                "extension_number": extension_number,
                "video_url": "",
                "status": "failed",
                "error": "Extension requires original Veo-generated video URI",
            }

        logger.info(
            "Extending video scene %d (ext #%d): %s",
            scene_number, extension_number, video_uri[:80],
        )

        try:
            operation = self._client.models.generate_videos(
                model="veo-3.1-generate-preview",
                prompt=prompt,
                video=video_uri,
                config=types.GenerateVideosConfig(
                    resolution="720p",  # Extensions are locked to 720p
                ),
            )

            logger.info(
                "Extension operation started: %s",
                operation.name if hasattr(operation, "name") else "unknown",
            )

            # Poll until complete
            start_time = time.time()
            max_wait = 300  # 5 minutes
            poll_interval = 10

            while not operation.done:
                elapsed = time.time() - start_time
                if elapsed > max_wait:
                    logger.warning("Extension timeout after %ds", max_wait)
                    return {
                        "scene_number": scene_number,
                        "extension_number": extension_number,
                        "video_url": "",
                        "status": "timeout",
                        "error": f"Extension timed out after {max_wait}s",
                    }

                logger.info("  Extension processing... (%ds elapsed)", int(elapsed))
                time.sleep(poll_interval)
                operation = self._client.operations.get(operation)

            # Extract result
            if operation.result and operation.result.generated_videos:
                video = operation.result.generated_videos[0]
                extended_uri = video.video.uri if video.video else ""

                if extended_uri:
                    local_url = await self._download_and_save_video(
                        extended_uri, scene_number, extension_number,
                    )
                    logger.info(
                        "Scene %d ext #%d complete: %s",
                        scene_number, extension_number, local_url,
                    )
                    return {
                        "scene_number": scene_number,
                        "extension_number": extension_number,
                        "video_url": local_url,
                        "original_uri": extended_uri,
                        "status": "completed",
                    }

            logger.warning("No video in extension result")
            return {
                "scene_number": scene_number,
                "extension_number": extension_number,
                "video_url": "",
                "status": "failed",
                "error": "No video in extension response",
            }

        except Exception as e:
            logger.exception("Video extension failed: %s", e)
            return {
                "scene_number": scene_number,
                "extension_number": extension_number,
                "video_url": "",
                "status": "failed",
                "error": str(e),
            }

    @staticmethod
    def _mock_video(scene_number: int = 1, clip_number: int = 1) -> dict:
        return {
            "scene_number": scene_number,
            "clip_number": clip_number,
            "video_url": f"https://placeholder.ugcgen.ai/video/scene-{scene_number}-clip-{clip_number}.mp4",
            "status": "completed",
        }
