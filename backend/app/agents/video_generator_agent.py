"""Video Generator Agent with Veo 3.1 frame continuity."""

import logging
import uuid

from app.models.schemas import (
    Script,
    ScriptScene,
    VideoScene,
    VideoGeneration,
    Storyboard,
)
from app.services.video_service import VideoService
from app.services.ffmpeg_service import FFmpegService

logger = logging.getLogger(__name__)


class VideoGeneratorAgent:
    """Generate videos with Veo 3.1 and frame continuity."""

    def __init__(self, api_key: str | None = None):
        """Initialize the video generator agent."""
        self._api_key = api_key
        self._video_service = VideoService(api_key=api_key)
        self._ffmpeg_service = FFmpegService()

    async def generate_video(
        self,
        script: Script,
        storyboard: Storyboard,
        avatar_data: dict | None = None,
        product_images: list[str] = None,
    ) -> VideoGeneration:
        """Generate complete video with frame continuity."""
        if not self._api_key:
            logger.warning("No API key provided, returning placeholder videos")
            return self._generate_placeholder_videos(script, storyboard)

        product_images = product_images or []
        video_scenes = []
        previous_last_frame = None

        for idx, scene in enumerate(script.scenes):
            logger.info(f"Generating video for scene {scene.scene_number}")

            # Get selected storyboard image for this scene
            storyboard_scene = next(
                (s for s in storyboard.scenes if s.scene_number == scene.scene_number),
                None,
            )

            if not storyboard_scene:
                logger.warning(f"No storyboard found for scene {scene.scene_number}")
                continue

            # Get selected variant (default to first variant if none selected)
            selected_variant = next(
                (
                    v
                    for v in storyboard_scene.variants
                    if v.variant_number == storyboard_scene.selected_variant
                ),
                storyboard_scene.variants[0] if storyboard_scene.variants else None,
            )

            if not selected_variant:
                logger.warning(f"No variant found for scene {scene.scene_number}")
                continue

            # Generate video scene with frame continuity
            video_scene = await self._generate_scene_video(
                scene=scene,
                storyboard_image_url=selected_variant.image_url,
                previous_last_frame=previous_last_frame,
                avatar_data=avatar_data,
                product_images=product_images,
            )

            video_scenes.append(video_scene)
            previous_last_frame = video_scene.last_frame_url

        # Stitch all scenes together
        final_video_url = await self._stitch_scenes(video_scenes)

        total_duration = sum(scene.duration for scene in video_scenes)

        return VideoGeneration(
            video_scenes=video_scenes,
            final_video_url=final_video_url,
            total_duration=total_duration,
        )

    async def _generate_scene_video(
        self,
        scene: ScriptScene,
        storyboard_image_url: str,
        previous_last_frame: str | None,
        avatar_data: dict | None,
        product_images: list[str],
    ) -> VideoScene:
        """Generate video for a single scene with Veo 3.1."""
        try:
            # Build a detailed prompt from scene data
            prompt_parts = []
            if scene.visual_description:
                prompt_parts.append(scene.visual_description)
            if scene.description:
                prompt_parts.append(scene.description)
            if scene.character_action:
                prompt_parts.append(f"Action: {scene.character_action}")
            if scene.location:
                prompt_parts.append(f"Setting: {scene.location}")
            if scene.camera_notes:
                prompt_parts.append(f"Camera: {scene.camera_notes}")

            prompt = ". ".join(prompt_parts) if prompt_parts else scene.description

            # Extract avatar images if available
            avatar_images = None
            if avatar_data and avatar_data.get("reference_images"):
                avatar_images = avatar_data["reference_images"]

            # Generate video clip(s) via VideoService
            results = await self._video_service.generate_scene_videos(
                scene_number=scene.scene_number,
                prompt=prompt,
                storyboard_image_url=storyboard_image_url,
                product_images=product_images if product_images else None,
                avatar_images=avatar_images,
                num_clips=1,
                duration_seconds=int(scene.duration_seconds),
                aspect_ratio="9:16",
            )

            # Use the first successfully generated clip
            video_url = ""
            for result in results:
                if result.get("status") == "completed" and result.get("video_url"):
                    video_url = result["video_url"]
                    break

            if not video_url:
                logger.warning(
                    f"No successful video generated for scene {scene.scene_number}, "
                    f"results: {results}"
                )
                video_url = f"https://placeholder.com/video/scene{scene.scene_number}.mp4"

            logger.info(
                f"Generated video for scene {scene.scene_number}: {video_url}"
            )

            return VideoScene(
                scene_number=scene.scene_number,
                video_url=video_url,
                first_frame_url=previous_last_frame or storyboard_image_url,
                last_frame_url=storyboard_image_url,
                duration=scene.duration_seconds,
            )

        except Exception as e:
            logger.error(f"Video generation failed for scene {scene.scene_number}: {e}")
            raise

    async def _stitch_scenes(self, video_scenes: list[VideoScene]) -> str:
        """Stitch all scene videos into final video using ffmpeg."""
        try:
            if not video_scenes:
                logger.warning("No video scenes to stitch")
                return ""

            # If only one scene, return its URL directly
            if len(video_scenes) == 1:
                return video_scenes[0].video_url

            # Build clips list for FFmpegService
            clips = []
            for scene in video_scenes:
                clips.append({
                    "video_url": scene.video_url,
                    "trim_start": 0,
                    "trim_end": 0,
                    "duration": scene.duration,
                    "scene_number": scene.scene_number,
                })

            # Build fade transitions between each pair of consecutive clips
            transitions = []
            for i in range(len(clips) - 1):
                transitions.append({
                    "after_clip_index": i,
                    "type": "fade",
                    "duration": 0.5,
                })

            # Compile with FFmpegService
            result = await self._ffmpeg_service.compile_video(
                clips=clips,
                transitions=transitions,
                settings={"resolution": "1080p", "format": "mp4", "quality": "standard"},
            )

            if result.get("status") == "complete" and result.get("output_url"):
                logger.info(
                    f"Stitched {len(video_scenes)} scenes into final video: "
                    f"{result['output_url']}"
                )
                return result["output_url"]

            logger.error(f"Video stitching failed: {result.get('error', 'unknown error')}")
            # Fall back to the first scene's video
            return video_scenes[0].video_url

        except Exception as e:
            logger.error(f"Video stitching failed: {e}")
            raise

    def _generate_placeholder_videos(
        self,
        script: Script,
        storyboard: Storyboard,
    ) -> VideoGeneration:
        """Generate placeholder video data when no API key."""
        video_scenes = []

        for scene in script.scenes:
            video_scenes.append(
                VideoScene(
                    scene_number=scene.scene_number,
                    video_url=f"https://placeholder.com/video/scene{scene.scene_number}.mp4",
                    first_frame_url=f"https://placeholder.com/frames/scene{scene.scene_number}_first.jpg",
                    last_frame_url=f"https://placeholder.com/frames/scene{scene.scene_number}_last.jpg",
                    duration=scene.duration_seconds,
                )
            )

        return VideoGeneration(
            video_scenes=video_scenes,
            final_video_url="https://placeholder.com/video/final.mp4",
            total_duration=sum(scene.duration_seconds for scene in script.scenes),
        )
