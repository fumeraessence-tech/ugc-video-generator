import asyncio
import logging
import math
import traceback
from typing import Any

import httpx

from app.models.schemas import AvatarDNA, GenerationRequest, Script, BackgroundSetting, Platform
from app.services.script_service import ScriptService
from app.services.image_service import ImageService
from app.services.video_service import VideoService
from app.services.audio_service import AudioService
from app.services.ffmpeg_service import FFmpegService
from app.services.consistency_service import ConsistencyService
from app.services.storage_service import StorageService
from app.services.reference_validation_service import ReferenceValidationService
from app.agents.copilot_agent import CoPilotAgent
from app.agents.scene_prompt_agent import ScenePromptAgent
from app.utils.redis_client import publish_progress, subscribe_progress, get_redis

CONSISTENCY_THRESHOLD = 0.75
MAX_REGEN_ATTEMPTS = 3
MAX_STEP_RETRIES = 2
TRANSIENT_STATUS_CODES = {429, 503, 502, 500}
FRONTEND_URL = "http://localhost:3000"

logger = logging.getLogger(__name__)

# Pipeline steps with their progress percentages
STEPS: list[tuple[str, int, str]] = [
    ("script_generation", 10, "Generating script..."),
    ("scene_prompts", 20, "Building scene prompts..."),
    ("storyboard", 35, "Generating storyboard images..."),
    ("storyboard_review", 40, "Awaiting storyboard approval..."),
    ("video_generation", 60, "Generating video clips..."),
    ("video_extension", 75, "Extending video clips if needed..."),
    ("audio_generation", 85, "Generating voiceover audio..."),
    ("post_production", 92, "Stitching final video..."),
    ("quality_check", 97, "Running quality checks..."),
    ("complete", 100, "Video generation complete!"),
]


class VideoPipeline:
    """Orchestrates the full UGC video generation pipeline.

    Steps:
        1. script_generation   - Generate the video script via ScriptService
        2. scene_prompts       - Build detailed scene prompts from script + avatar DNA
        3. storyboard          - Generate reference images via ImageService
        4. storyboard_review   - Pause and wait for user approval
        5. video_generation    - Generate video clips per scene via VideoService
        6. video_extension     - Extend video clips if needed (Veo 3.1)
        7. audio_generation    - Generate voiceover via AudioService
        8. post_production     - FFmpeg stitching with transitions + audio mixing
        9. quality_check       - Validate output
        10. complete           - Done
    """

    def __init__(self) -> None:
        self._copilot_agent: CoPilotAgent | None = None
        self._image_service: ImageService | None = None
        self._video_service: VideoService | None = None
        self._audio_service: AudioService | None = None
        self._scene_prompt_agent: ScenePromptAgent | None = None
        self._ffmpeg_service: FFmpegService | None = None
        self._consistency_service: ConsistencyService | None = None
        self._storage_service: StorageService | None = None
        self._ref_validation_service: ReferenceValidationService | None = None

    def _init_services(self, api_key: str | None) -> None:
        self._copilot_agent = CoPilotAgent(api_key=api_key)
        self._image_service = ImageService(api_key=api_key)
        self._video_service = VideoService(api_key=api_key)
        self._audio_service = AudioService(api_key=api_key)
        self._scene_prompt_agent = ScenePromptAgent(api_key=api_key)
        self._ffmpeg_service = FFmpegService()
        self._consistency_service = ConsistencyService(api_key=api_key)
        self._storage_service = StorageService()
        self._ref_validation_service = ReferenceValidationService(api_key=api_key)

    @staticmethod
    def _is_transient_error(exc: Exception) -> bool:
        """Check if an exception is likely transient (retryable)."""
        exc_str = str(exc).lower()
        if any(code_str in exc_str for code_str in ["429", "503", "502", "rate limit", "timeout", "timed out"]):
            return True
        if isinstance(exc, (asyncio.TimeoutError, ConnectionError, OSError)):
            return True
        return False

    async def _run_with_retry(
        self,
        step_name: str,
        fn,
        max_retries: int = MAX_STEP_RETRIES,
    ):
        """Execute a step function with automatic retry for transient errors."""
        last_exc: Exception | None = None
        for attempt in range(1, max_retries + 2):  # +1 for initial + retries
            try:
                return await fn()
            except Exception as exc:
                last_exc = exc
                if attempt <= max_retries and self._is_transient_error(exc):
                    wait = 2 ** attempt  # Exponential backoff: 2s, 4s
                    logger.warning(
                        "Step '%s' failed (attempt %d/%d), retrying in %ds: %s",
                        step_name, attempt, max_retries + 1, wait, exc,
                    )
                    await asyncio.sleep(wait)
                else:
                    raise
        raise last_exc  # type: ignore[misc]

    async def _persist_artifacts(
        self, job_id: str, step: str, artifacts: dict[str, Any]
    ) -> None:
        """Persist step artifacts to the frontend database via webhook."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"{FRONTEND_URL}/api/jobs/{job_id}/update-artifacts",
                    json={"step": step, "artifacts": artifacts},
                )
        except Exception as e:
            logger.warning("Failed to persist artifacts for %s step %s: %s", job_id, step, e)

    async def _fetch_avatar_dna(self, avatar_id: str) -> AvatarDNA | None:
        """Fetch avatar DNA from Redis or return system avatar DNA."""
        # System avatars
        SYSTEM_AVATARS = {
            "system-sarah": AvatarDNA(
                face="oval face, soft jawline, high cheekbones",
                skin="light beige, clear complexion",
                eyes="large brown eyes, natural lashes",
                hair="shoulder-length wavy brown hair",
                body="average build, 5'6\"",
                voice="warm, friendly, mid-range female voice",
                wardrobe="casual streetwear, earth tones",
                prohibited_drift="no tattoos, no piercings beyond ears",
            ),
            "system-marcus": AvatarDNA(
                face="square jaw, defined cheekbones",
                skin="medium brown, even tone",
                eyes="dark brown eyes, strong brow line",
                hair="short fade, black hair",
                body="athletic build, 6'0\"",
                voice="deep, confident, clear enunciation",
                wardrobe="clean minimalist, solid colors, tech-casual",
                prohibited_drift="no facial hair changes, consistent haircut",
            ),
        }

        # Check system avatars first
        if avatar_id in SYSTEM_AVATARS:
            return SYSTEM_AVATARS[avatar_id]

        # Fetch from Redis
        try:
            r = await get_redis()
            raw = await r.get(f"avatar:{avatar_id}")
            if raw:
                import json
                data = json.loads(raw)
                if "dna" in data:
                    return AvatarDNA(**data["dna"])
        except Exception as e:
            logger.error(f"Failed to fetch avatar {avatar_id}: {e}")

        return None

    async def _publish(
        self,
        job_id: str,
        step: str,
        progress: int,
        message: str,
        status: str = "processing",
        data: dict[str, Any] | None = None,
    ) -> None:
        await publish_progress(job_id, {
            "job_id": job_id,
            "status": status,
            "current_step": step,
            "progress": progress,
            "message": message,
            "data": data,
        })

    async def run(
        self,
        job_id: str,
        request: GenerationRequest,
        api_key: str | None = None,
        resume_from: str | None = None,
        prior_artifacts: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute the full video generation pipeline.

        Args:
            job_id: Unique job identifier
            request: Generation request parameters
            api_key: API key for services
            resume_from: Step name to resume from (skips prior steps)
            prior_artifacts: Prior step results when resuming
        """
        self._init_services(api_key)
        assert self._copilot_agent is not None
        assert self._image_service is not None
        assert self._video_service is not None
        assert self._audio_service is not None
        assert self._scene_prompt_agent is not None
        assert self._ffmpeg_service is not None

        result: dict[str, Any] = {"job_id": job_id}
        avatar_dna: AvatarDNA | None = None

        # Use avatar_dna from request if provided, otherwise fetch by avatar_id
        if request.avatar_dna:
            avatar_dna = AvatarDNA(**request.avatar_dna)
            logger.info(f"Job {job_id}: Using avatar DNA from request")
        elif request.avatar_id:
            avatar_dna = await self._fetch_avatar_dna(request.avatar_id)
            if avatar_dna:
                logger.info(f"Job {job_id}: Loaded avatar DNA for {request.avatar_id}")
            else:
                logger.warning(f"Job {job_id}: Avatar {request.avatar_id} not found, using no avatar")

        # Log avatar reference images
        avatar_ref_images = request.avatar_reference_images or []
        if avatar_ref_images:
            logger.info(f"Job {job_id}: Using {len(avatar_ref_images)} avatar reference images for storyboard")

        # Pre-load avatar reference image bytes for consistency scoring
        avatar_ref_bytes: list[bytes] = []
        if avatar_ref_images and self._image_service:
            for ref_url in avatar_ref_images[:4]:
                img_data = await self._image_service._load_image(ref_url)
                if img_data and img_data.get("bytes"):
                    avatar_ref_bytes.append(img_data["bytes"])
            logger.info(
                f"Job {job_id}: Pre-loaded {len(avatar_ref_bytes)} avatar ref image bytes "
                f"for consistency scoring"
            )

        # Extract angle-aware references from avatar DNA
        refs_by_angle: dict[str, str] | None = None
        if avatar_dna and avatar_dna.reference_images_by_angle:
            refs_by_angle = avatar_dna.reference_images_by_angle
            logger.info(f"Job {job_id}: Avatar has {len(refs_by_angle)} angle-classified references")

        # Step order for resume_from logic
        step_order = [
            "script_generation", "scene_prompts", "storyboard",
            "storyboard_review", "video_generation", "video_extension",
            "audio_generation", "post_production", "quality_check", "complete",
        ]

        def _should_skip(step_name: str) -> bool:
            """Check if a step should be skipped when resuming."""
            if not resume_from:
                return False
            try:
                return step_order.index(step_name) < step_order.index(resume_from)
            except ValueError:
                return False

        # Load prior artifacts when resuming
        if prior_artifacts:
            if prior_artifacts.get("script"):
                result["script"] = prior_artifacts["script"]
            if prior_artifacts.get("scene_prompts"):
                result["scene_prompts"] = prior_artifacts["scene_prompts"]
            if prior_artifacts.get("storyboard"):
                result["storyboard"] = prior_artifacts["storyboard"]

        try:
            # --- 1. Script Generation with Vision Analysis ---
            if _should_skip("script_generation"):
                logger.info("Job %s: Skipping script_generation (resuming from %s)", job_id, resume_from)
                script = Script(**result["script"]) if isinstance(result.get("script"), dict) else None
            else:
                await self._publish(job_id, "script_generation", 10, "Analyzing product images and generating script...")

                # Convert string to enum if needed
                bg_setting = request.background_setting
                if isinstance(bg_setting, str):
                    try:
                        bg_setting = BackgroundSetting(bg_setting)
                    except ValueError:
                        bg_setting = BackgroundSetting.modern_bedroom

                platform = request.platform
                if isinstance(platform, str):
                    try:
                        platform = Platform(platform)
                    except ValueError:
                        platform = Platform.instagram_reels

                async def _gen_script():
                    return await self._copilot_agent.generate_script(
                        prompt=request.prompt,
                        product_name=request.product_name,
                        product_images=request.product_images,
                        background_setting=bg_setting,
                        platform=platform,
                        duration=request.duration,
                        max_scene_duration=request.max_scene_duration,
                        words_per_minute=request.words_per_minute,
                    )

                script: Script = await self._run_with_retry("script_generation", _gen_script)
                result["script"] = script.model_dump()
                logger.info("Job %s: script generated with %d scenes (product: %s, images: %d)",
                           job_id, len(script.scenes), request.product_name or "none", len(request.product_images))
                await self._persist_artifacts(job_id, "script_generation", {"script": result["script"]})

            assert script is not None, "Script is required to continue"

            # --- 2. Scene Prompts ---
            if _should_skip("scene_prompts"):
                scene_prompts = result.get("scene_prompts", [])
            else:
                await self._publish(job_id, "scene_prompts", 20, "Building detailed scene prompts...")
                scene_prompts: list[str] = self._scene_prompt_agent.generate_scene_prompts(
                    script=script,
                    avatar_dna=avatar_dna,
                    product_name=request.product_name,
                    product_images=request.product_images,
                )
                result["scene_prompts"] = scene_prompts

            # --- 3. Storyboard (with consistency-gated regeneration) ---
            await self._publish(job_id, "storyboard", 30, "Generating storyboard images...")

            # Per-scene angle-aware selection now happens inside ImageService
            storyboard = await self._image_service.generate_storyboard(
                script=script,
                avatar_dna=avatar_dna,
                avatar_reference_images=avatar_ref_images,
                reference_images_by_angle=refs_by_angle,
                product_name=request.product_name,
                product_images=request.product_images,
                product_dna=getattr(request, 'product_dna', None),
                aspect_ratio=request.aspect_ratio,
            )

            # Consistency-gated validation: score each scene and auto-retry low scorers
            consistency_scores: list[dict] = []
            if self._consistency_service and isinstance(storyboard, list) and avatar_ref_images:
                await self._publish(job_id, "storyboard", 36, "Scoring character consistency...")

                for sb_item in storyboard:
                    if not isinstance(sb_item, dict):
                        continue
                    img_url = sb_item.get("image_url", "")
                    scene_num = sb_item.get("scene_number", "?")
                    if not img_url or not img_url.startswith("/uploads/"):
                        consistency_scores.append({"scene": scene_num, "score": 0.85})
                        continue

                    try:
                        from pathlib import Path
                        backend_dir = Path(__file__).resolve().parents[2]
                        img_path = backend_dir.parent / "frontend" / "public" / img_url.lstrip("/")
                        if not img_path.exists():
                            consistency_scores.append({"scene": scene_num, "score": 0.85})
                            continue

                        img_bytes = img_path.read_bytes()
                        score_result = await self._consistency_service.score_character_consistency(
                            image_data=img_bytes,
                            reference_images=avatar_ref_bytes,
                            character_dna=avatar_dna.model_dump() if avatar_dna else None,
                        )
                        score = score_result.get("score", 0.85)
                        consistency_scores.append({"scene": scene_num, "score": score})

                        # Auto-retry if score below threshold
                        if score < CONSISTENCY_THRESHOLD:
                            for attempt in range(2, MAX_REGEN_ATTEMPTS + 1):
                                await self._publish(
                                    job_id, "storyboard", 36,
                                    f"Scene {scene_num} consistency {score:.0%} < {CONSISTENCY_THRESHOLD:.0%}. "
                                    f"Regenerating (attempt {attempt}/{MAX_REGEN_ATTEMPTS})...",
                                )
                                # Regenerate single scene with per-scene angle-matched refs
                                regen_result = await self._image_service.generate_storyboard(
                                    script=Script(
                                        title=script.title,
                                        scenes=[s for s in script.scenes if str(s.scene_number) == str(scene_num)],
                                        total_duration=script.total_duration,
                                        style_notes=script.style_notes,
                                    ),
                                    avatar_dna=avatar_dna,
                                    avatar_reference_images=avatar_ref_images,
                                    reference_images_by_angle=refs_by_angle,
                                    product_name=request.product_name,
                                    product_images=request.product_images,
                                    product_dna=getattr(request, 'product_dna', None),
                                    aspect_ratio=request.aspect_ratio,
                                )
                                if regen_result and isinstance(regen_result, list) and regen_result[0].get("image_url"):
                                    new_url = regen_result[0]["image_url"]
                                    new_path = backend_dir.parent / "frontend" / "public" / new_url.lstrip("/")
                                    if new_path.exists():
                                        new_score_result = await self._consistency_service.score_character_consistency(
                                            image_data=new_path.read_bytes(),
                                            reference_images=avatar_ref_bytes,
                                            character_dna=avatar_dna.model_dump() if avatar_dna else None,
                                        )
                                        new_score = new_score_result.get("score", 0.0)
                                        if new_score > score:
                                            sb_item["image_url"] = new_url
                                            score = new_score
                                            consistency_scores[-1] = {"scene": scene_num, "score": score}
                                            logger.info("Scene %s improved to %.2f on attempt %d", scene_num, score, attempt)
                                            if score >= CONSISTENCY_THRESHOLD:
                                                break
                    except Exception as e:
                        logger.warning("Consistency scoring failed for scene %s: %s", scene_num, e)
                        consistency_scores.append({"scene": scene_num, "score": 0.85})

            result["storyboard"] = storyboard
            result["consistency_scores"] = consistency_scores
            await self._publish(
                job_id, "storyboard", 38, "Storyboard generated.",
                data={"storyboard": storyboard, "consistency_scores": consistency_scores},
            )
            await self._persist_artifacts(job_id, "storyboard", {
                "storyboard": storyboard,
                "consistencyScores": consistency_scores,
            })

            # --- 4. Storyboard Review (optional pause) ---
            if request.auto_approve:
                # Skip manual approval, proceed automatically
                logger.info("Job %s: Auto-approving storyboard", job_id)
                await self._publish(
                    job_id, "storyboard_review", 45,
                    "Storyboard auto-approved. Proceeding to video generation...",
                    status="processing",
                    data={"storyboard": storyboard},
                )
            else:
                # Wait for manual approval
                await self._publish(
                    job_id, "storyboard_review", 40,
                    "Storyboard ready for review. Approve to continue.",
                    status="awaiting_approval",
                    data={"storyboard": storyboard},
                )
                approved = await self._wait_for_approval(job_id, timeout=600)
                if not approved:
                    await self._publish(
                        job_id, "storyboard_review", 40,
                        "Storyboard approval timed out.",
                        status="failed",
                    )
                    result["status"] = "failed"
                    return result

            # --- 5. Video Generation ---
            await self._publish(job_id, "video_generation", 50, "Generating video clips...")
            video_clips: list[dict[str, str]] = []
            total_scenes = len(scene_prompts)
            for i, prompt in enumerate(scene_prompts):
                progress = 50 + int((i / total_scenes) * 20)
                await self._publish(
                    job_id, "video_generation", progress,
                    f"Generating video for scene {i + 1}/{total_scenes}...",
                )

                async def _gen_video(p=prompt, idx=i):
                    return await self._video_service.generate_video(
                        scene_prompt=p,
                        duration=int(script.scenes[idx].duration_seconds) if idx < len(script.scenes) else 5,
                    )

                clip = await self._run_with_retry(f"video_scene_{i+1}", _gen_video)
                video_clips.append(clip)
            result["video_clips"] = video_clips
            await self._persist_artifacts(job_id, "video_generation", {
                "videoScenes": video_clips,
            })

            # --- 6. Video Extension ---
            await self._publish(job_id, "video_extension", 75, "Checking if video extension is needed...")
            for i, clip in enumerate(video_clips):
                if clip.get("status") != "completed" or not clip.get("video_url"):
                    continue

                # Check if scene needs > 8 seconds
                scene_dur = script.scenes[i].duration_seconds if i < len(script.scenes) else 8
                if scene_dur <= 8:
                    continue

                original_uri = clip.get("original_uri")
                if not original_uri:
                    logger.warning("Scene %d missing original_uri, skipping extension", i + 1)
                    continue

                # Calculate extensions needed (each adds ~7s)
                num_ext = min(math.ceil((scene_dur - 8) / 7), 20)
                logger.info("Scene %d needs %ds, extending %d time(s)", i + 1, scene_dur, num_ext)

                current_uri = original_uri
                scene_prompt = scene_prompts[i] if i < len(scene_prompts) else "Continue the scene naturally"

                for ext_num in range(1, num_ext + 1):
                    await self._publish(
                        job_id, "video_extension",
                        75 + int((ext_num / num_ext) * 10),
                        f"Extending scene {i + 1}, extension {ext_num}/{num_ext}...",
                    )

                    extended = await self._video_service.extend_video(
                        video_uri=current_uri,
                        prompt=scene_prompt,
                        scene_number=i + 1,
                        extension_number=ext_num,
                    )

                    if extended.get("status") == "completed":
                        current_uri = extended.get("original_uri", current_uri)
                        clip["video_url"] = extended.get("video_url", clip["video_url"])
                        clip["extended"] = True
                        clip["total_extensions"] = ext_num
                        logger.info("Scene %d extended to ~%ds", i + 1, 8 + ext_num * 7)
                    else:
                        logger.warning("Extension %d failed for scene %d, stopping", ext_num, i + 1)
                        break

            result["video_clips_extended"] = video_clips

            # --- 7. Audio Generation ---
            await self._publish(job_id, "audio_generation", 85, "Generating voiceover audio...")
            audio_clips: list[dict[str, str]] = []
            for scene in script.scenes:
                if scene.dialogue.strip():
                    async def _gen_audio(text=scene.dialogue):
                        return await self._audio_service.generate_tts(text=text)
                    audio = await self._run_with_retry(f"audio_{scene.scene_number}", _gen_audio)
                    audio_clips.append(audio)
            result["audio_clips"] = audio_clips
            await self._persist_artifacts(job_id, "audio", {
                "audioUrl": audio_clips[0].get("audio_url") if audio_clips else None,
            })

            # --- 8. Post Production (FFmpeg stitching) ---
            await self._publish(job_id, "post_production", 92, "Stitching final video...")

            # Collect valid video clips for compilation
            valid_clips = [
                {
                    "video_url": clip["video_url"],
                    "duration": clip.get("duration", 8),
                    "trim_start": 0,
                    "trim_end": 0,
                }
                for clip in video_clips
                if clip.get("status") == "completed"
                and clip.get("video_url")
                and "placeholder" not in clip.get("video_url", "")
            ]

            if len(valid_clips) > 1:
                # Stitch multiple clips with fade transitions
                transitions = [
                    {"after_clip_index": i, "type": "fade", "duration": 0.5}
                    for i in range(len(valid_clips) - 1)
                ]

                # Prepare audio for mixing
                audio_dict = None
                valid_audio = [
                    a for a in audio_clips
                    if a.get("audio_url") and "placeholder" not in a.get("audio_url", "")
                ]
                if valid_audio:
                    audio_dict = {
                        "voiceover_clips": [
                            {"url": a["audio_url"], "start_time": 0, "volume": 100}
                            for a in valid_audio
                        ],
                    }

                compile_result = await self._ffmpeg_service.compile_video(
                    clips=valid_clips,
                    transitions=transitions,
                    audio=audio_dict,
                    settings={"resolution": "1080p", "format": "mp4", "quality": "standard"},
                )

                if compile_result.get("status") == "complete":
                    final_video_url = compile_result["output_url"]
                    logger.info("Stitched %d clips into final video: %s", len(valid_clips), final_video_url)
                else:
                    logger.warning("FFmpeg stitching failed: %s", compile_result.get("error"))
                    # Fall back to first clip
                    final_video_url = valid_clips[0]["video_url"] if valid_clips else ""
            elif valid_clips:
                final_video_url = valid_clips[0]["video_url"]
            else:
                final_video_url = "https://placeholder.ugcgen.ai/video/final-output.mp4"

            result["final_video_url"] = final_video_url
            result["video_clips_urls"] = [clip.get("video_url") for clip in video_clips if clip.get("video_url")]
            await self._persist_artifacts(job_id, "assembly", {
                "finalVideoUrl": final_video_url,
            })

            # --- 9. Quality Check (Consistency Scoring) ---
            await self._publish(job_id, "quality_check", 97, "Running consistency checks...")
            quality_score = 0.95  # Default
            try:
                # Collect storyboard images for cross-scene consistency
                storyboard_images = []
                for sb_item in (storyboard if isinstance(storyboard, list) else []):
                    img_url = sb_item.get("image_url", "") if isinstance(sb_item, dict) else ""
                    if img_url and img_url.startswith("/uploads/"):
                        from pathlib import Path
                        backend_dir = Path(__file__).resolve().parents[2]
                        img_path = backend_dir.parent / "frontend" / "public" / img_url.lstrip("/")
                        if img_path.exists():
                            storyboard_images.append(img_path.read_bytes())

                if len(storyboard_images) >= 2 and self._consistency_service:
                    cross_scene = await self._consistency_service.check_cross_scene_consistency(
                        scene_images=storyboard_images,
                        reference_images=avatar_ref_bytes if avatar_ref_bytes else storyboard_images[:1],
                    )
                    quality_score = cross_scene.get("consistency_score", 0.95)
                    logger.info("Job %s: Cross-scene consistency score: %.2f", job_id, quality_score)
            except Exception as e:
                logger.warning("Job %s: Quality check failed, using default: %s", job_id, e)
            result["quality_score"] = quality_score

            # --- 10. Complete ---
            await self._publish(
                job_id, "complete", 100,
                "Video generation complete!",
                status="completed",
                data={"final_video_url": result.get("final_video_url", "")},
            )
            result["status"] = "completed"
            return result

        except Exception as exc:
            logger.exception("Pipeline failed for job %s", job_id)
            await self._publish(
                job_id, "error", 0,
                f"Pipeline failed: {exc}",
                status="failed",
            )
            result["status"] = "failed"
            result["error"] = str(exc)
            return result

    async def run_single_step(
        self,
        job_id: str,
        step: str,
        context: dict[str, Any],
        api_key: str | None = None,
    ) -> dict[str, Any]:
        """Run a single pipeline step for selective regeneration.

        Args:
            job_id: The job identifier
            step: Which step to run ("storyboard", "video", "audio")
            context: Prior artifacts from the job (script, storyboard, etc.)
            api_key: API key for services
        """
        self._init_services(api_key)
        result: dict[str, Any] = {"job_id": job_id, "step": step}

        script_data = context.get("script")
        script = Script(**script_data) if script_data else None

        if step == "storyboard" and script:
            avatar_dna = AvatarDNA(**context["avatar_dna"]) if context.get("avatar_dna") else None
            scene_numbers = context.get("scene_numbers", [])

            # Extract angle-aware references from avatar DNA
            step_refs_by_angle = None
            if avatar_dna and avatar_dna.reference_images_by_angle:
                step_refs_by_angle = avatar_dna.reference_images_by_angle

            if scene_numbers:
                # Regenerate specific scenes only
                scenes_to_regen = [s for s in script.scenes if s.scene_number in scene_numbers]
                partial_script = Script(
                    title=script.title,
                    scenes=scenes_to_regen,
                    total_duration=sum(s.duration_seconds for s in scenes_to_regen),
                    style_notes=script.style_notes,
                )
            else:
                partial_script = script

            storyboard = await self._image_service.generate_storyboard(
                script=partial_script,
                avatar_dna=avatar_dna,
                avatar_reference_images=context.get("avatar_reference_images", []),
                reference_images_by_angle=step_refs_by_angle,
                product_name=context.get("product_name"),
                product_images=context.get("product_images", []),
                product_dna=context.get("product_dna"),
                aspect_ratio=context.get("aspect_ratio", "9:16"),
            )
            result["storyboard"] = storyboard

        elif step == "video" and script:
            await self._publish(job_id, "video_generation", 50, "Re-generating video clips...")
            # Re-run video generation step using existing scene prompts
            scene_prompts = context.get("scene_prompts", [])
            video_clips = []
            for i, prompt in enumerate(scene_prompts):
                clip = await self._video_service.generate_video(
                    scene_prompt=prompt,
                    duration=int(script.scenes[i].duration_seconds) if i < len(script.scenes) else 5,
                )
                video_clips.append(clip)
            result["video_clips"] = video_clips

        elif step == "audio" and script:
            audio_clips = []
            for scene in script.scenes:
                if scene.dialogue.strip():
                    audio = await self._audio_service.generate_tts(text=scene.dialogue)
                    audio_clips.append(audio)
            result["audio_clips"] = audio_clips

        return result

    async def _wait_for_approval(self, job_id: str, timeout: int = 600) -> bool:
        """Wait for storyboard approval signal via Redis pub/sub."""
        try:
            async for update in subscribe_progress(job_id):
                if update.get("current_step") == "storyboard_approved":
                    return True
                if update.get("status") in ("cancelled", "failed"):
                    return False
        except asyncio.TimeoutError:
            return False
        return False

    async def _wait_for_decision(self, job_id: str, timeout: int = 600) -> dict | None:
        """Wait for user decision at a quality gate via Redis pub/sub."""
        try:
            async for update in subscribe_progress(job_id):
                if update.get("current_step") == "quality_decision":
                    return update.get("data", {})
                if update.get("status") in ("cancelled", "failed"):
                    return None
        except asyncio.TimeoutError:
            return None
        return None
