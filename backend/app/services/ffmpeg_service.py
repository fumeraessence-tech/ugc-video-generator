"""
FFmpeg Video Compilation Service

Handles final video compilation:
- Clip trimming and concatenation
- Transition effects (xfade)
- Audio mixing (voiceover + music)
- Caption burn-in via drawtext filter
"""

import logging
import subprocess
import tempfile
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_FRONTEND_DIR = _BACKEND_DIR.parent / "frontend"
_FRONTEND_PUBLIC = _FRONTEND_DIR / "public"
EXPORT_DIR = _FRONTEND_PUBLIC / "uploads" / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)


class FFmpegService:
    """Compiles timeline clips into a final video using ffmpeg."""

    def __init__(self) -> None:
        self._check_ffmpeg()

    def _check_ffmpeg(self) -> None:
        """Verify ffmpeg is available."""
        try:
            result = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                logger.info("FFmpeg found: %s", result.stdout.split("\n")[0])
            else:
                logger.warning("FFmpeg not found or returned error")
        except FileNotFoundError:
            logger.warning("FFmpeg binary not found on system PATH")
        except Exception as e:
            logger.warning("FFmpeg check failed: %s", e)

    # ── Public API ───────────────────────────────────────────────────────────

    async def compile_video(
        self,
        clips: list[dict],
        transitions: list[dict],
        audio: dict | None = None,
        captions: dict | None = None,
        settings: dict | None = None,
        progress_callback=None,
    ) -> dict:
        """
        Compile clips into a final video with transitions, audio, and captions.

        Args:
            clips: [{video_url, trim_start, trim_end, duration, scene_number}]
            transitions: [{after_clip_index, type, duration}]
            audio: {voiceover_clips: [{url, start_time, volume, fade_in, fade_out}],
                    music_clips: [{url, start_time, volume, fade_in, fade_out}]}
            captions: {items: [{text, start_time, end_time}], style: {...}, burn_in: bool}
            settings: {resolution, format, quality}
            progress_callback: async fn(percent, message)
        """
        settings = settings or {}
        audio = audio or {}
        captions = captions or {}

        resolution = settings.get("resolution", "1080p")
        fmt = settings.get("format", "mp4")
        quality = settings.get("quality", "standard")

        job_id = uuid.uuid4().hex[:8]
        output_filename = f"export-{job_id}.{fmt}"
        output_path = EXPORT_DIR / output_filename

        try:
            if progress_callback:
                await progress_callback(5, "Preparing clips...")

            # Step 1 — resolve clip paths
            resolved_clips = self._resolve_clip_paths(clips)
            if not resolved_clips:
                return {"output_url": "", "error": "No valid video clips provided", "status": "error"}

            if progress_callback:
                await progress_callback(15, "Building video filter graph...")

            # Step 2 — build the full ffmpeg command
            cmd = self._build_command(
                resolved_clips=resolved_clips,
                transitions=transitions,
                audio=audio,
                captions=captions,
                resolution=resolution,
                quality=quality,
                fmt=fmt,
                output_path=output_path,
            )

            if progress_callback:
                await progress_callback(40, "Encoding video...")

            # Step 3 — run ffmpeg
            logger.info("Running FFmpeg: %s", " ".join(cmd[:15]) + " ...")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,
            )

            if result.returncode != 0:
                logger.error("FFmpeg stderr: %s", result.stderr[-800:])
                return {
                    "output_url": "",
                    "error": f"FFmpeg encoding failed: {result.stderr[-300:]}",
                    "status": "error",
                }

            if progress_callback:
                await progress_callback(95, "Finalizing...")

            file_size = output_path.stat().st_size if output_path.exists() else 0
            total_duration = sum(
                c.get("duration", 0) - c.get("trim_start", 0) - c.get("trim_end", 0)
                for c in clips
            )

            if progress_callback:
                await progress_callback(100, "Complete!")

            return {
                "output_url": f"/uploads/exports/{output_filename}",
                "duration": total_duration,
                "file_size": file_size,
                "status": "complete",
            }

        except subprocess.TimeoutExpired:
            return {"output_url": "", "error": "FFmpeg encoding timed out", "status": "error"}
        except Exception as e:
            logger.exception("Video compilation failed")
            return {"output_url": "", "error": str(e), "status": "error"}

    # ── Path resolution ──────────────────────────────────────────────────────

    def _resolve_clip_paths(self, clips: list[dict]) -> list[dict]:
        """Resolve clip URLs to absolute local paths."""
        resolved = []
        for clip in clips:
            url = clip.get("video_url", "")
            if not url:
                continue

            if url.startswith("http"):
                # HTTP URLs are passed directly to ffmpeg (it can handle them)
                resolved.append({**clip, "_path": url})
            else:
                local = _FRONTEND_PUBLIC / url.lstrip("/")
                if local.exists():
                    resolved.append({**clip, "_path": str(local)})
                else:
                    logger.warning("Clip file not found: %s", local)
        return resolved

    def _resolve_audio_path(self, url: str) -> str | None:
        """Resolve an audio URL to an absolute local path."""
        if not url:
            return None
        if url.startswith("http"):
            return url
        local = _FRONTEND_PUBLIC / url.lstrip("/")
        return str(local) if local.exists() else None

    # ── Command builder ──────────────────────────────────────────────────────

    def _build_command(
        self,
        resolved_clips: list[dict],
        transitions: list[dict],
        audio: dict,
        captions: dict,
        resolution: str,
        quality: str,
        fmt: str,
        output_path: Path,
    ) -> list[str]:
        """Build the complete ffmpeg command."""
        scale = {"720p": "1280:720", "1080p": "1920:1080", "4k": "3840:2160"}.get(
            resolution, "1920:1080"
        )
        crf = {"draft": "28", "standard": "23", "high": "18"}.get(quality, "23")

        # ── collect inputs ───────────────────────────────────────────────
        cmd = ["ffmpeg", "-y"]

        # video inputs
        for clip in resolved_clips:
            cmd.extend(["-i", clip["_path"]])
        n_video = len(resolved_clips)

        # audio inputs
        voiceover_clips = audio.get("voiceover_clips", [])
        music_clips = audio.get("music_clips", [])
        audio_paths: list[str] = []
        audio_meta: list[dict] = []

        for vo in voiceover_clips:
            p = self._resolve_audio_path(vo.get("url", ""))
            if p:
                audio_paths.append(p)
                audio_meta.append(vo)
        for mus in music_clips:
            p = self._resolve_audio_path(mus.get("url", ""))
            if p:
                audio_paths.append(p)
                audio_meta.append(mus)

        for p in audio_paths:
            cmd.extend(["-i", p])
        n_audio = len(audio_paths)

        # ── build filter_complex ─────────────────────────────────────────
        filter_parts: list[str] = []

        # 1. Trim + scale each video input
        clip_durations: list[float] = []
        for i, clip in enumerate(resolved_clips):
            ts = clip.get("trim_start", 0) or 0
            te = clip.get("trim_end", 0) or 0
            dur = (clip.get("duration", 8) or 8) - ts - te
            dur = max(0.5, dur)
            clip_durations.append(dur)

            filter_parts.append(
                f"[{i}:v]trim=start={ts}:duration={dur},setpts=PTS-STARTPTS,"
                f"scale={scale}:force_original_aspect_ratio=decrease,"
                f"pad={scale}:(ow-iw)/2:(oh-ih)/2,setsar=1[v{i}]"
            )
            # Also prepare audio from video (if present)
            filter_parts.append(
                f"[{i}:a]atrim=start={ts}:duration={dur},asetpts=PTS-STARTPTS[va{i}]"
            )

        # 2. Build video chain (xfade transitions or concat)
        video_out = self._build_video_chain(
            n_clips=n_video,
            clip_durations=clip_durations,
            transitions=transitions,
            filter_parts=filter_parts,
        )

        # 3. Caption burn-in
        if captions.get("burn_in") and captions.get("items"):
            caption_filter = self._build_caption_filter(
                captions["items"], captions.get("style", {})
            )
            if caption_filter:
                filter_parts.append(f"{video_out}{caption_filter}[vcap]")
                video_out = "[vcap]"

        # 4. Build audio chain (video-audio concat + voiceover + music)
        audio_out = self._build_audio_chain(
            n_video=n_video,
            n_audio=n_audio,
            clip_durations=clip_durations,
            audio_meta=audio_meta,
            filter_parts=filter_parts,
        )

        # ── assemble final command ───────────────────────────────────────
        filter_complex = ";".join(filter_parts)
        cmd.extend(["-filter_complex", filter_complex])

        # map outputs
        cmd.extend(["-map", video_out])
        if audio_out:
            cmd.extend(["-map", audio_out])

        # encoding settings
        cmd.extend([
            "-c:v", "libx264",
            "-crf", crf,
            "-preset", "medium",
            "-c:a", "aac" if fmt == "mp4" else "libvorbis",
            "-b:a", "192k",
            "-shortest",
            str(output_path),
        ])

        return cmd

    # ── Video chain (transitions) ────────────────────────────────────────────

    def _build_video_chain(
        self,
        n_clips: int,
        clip_durations: list[float],
        transitions: list[dict],
        filter_parts: list[str],
    ) -> str:
        """Build the xfade transition chain or simple concat."""
        if n_clips == 1:
            return "[v0]"

        # Build transition lookup: after_clip_index -> {type, duration}
        trans_map: dict[int, dict] = {}
        for t in transitions:
            idx = t.get("after_clip_index", -1)
            if idx >= 0:
                trans_map[idx] = {
                    "type": self._normalise_transition(t.get("type", "fade")),
                    "duration": min(float(t.get("duration", 0.5)), 2.0),
                }

        # If no transitions at all, use simple concat
        if not trans_map:
            inputs = "".join(f"[v{i}]" for i in range(n_clips))
            filter_parts.append(f"{inputs}concat=n={n_clips}:v=1:a=0[vconcat]")
            return "[vconcat]"

        # Build xfade chain
        current_label = "v0"
        cumulative_offset = 0.0

        for i in range(n_clips - 1):
            trans = trans_map.get(i, {"type": "fade", "duration": 0.5})
            t_type = trans["type"]
            t_dur = trans["duration"]

            cumulative_offset += clip_durations[i] - t_dur
            next_input = f"v{i + 1}"
            out_label = f"vx{i}" if i < n_clips - 2 else "vout"

            filter_parts.append(
                f"[{current_label}][{next_input}]xfade="
                f"transition={t_type}:duration={t_dur}:offset={cumulative_offset:.3f}"
                f"[{out_label}]"
            )
            current_label = out_label

        return f"[{current_label}]"

    @staticmethod
    def _normalise_transition(name: str) -> str:
        """Map frontend transition names to ffmpeg xfade transition names."""
        mapping = {
            "fade": "fade",
            "crossfade": "fade",
            "dissolve": "dissolve",
            "slide-left": "slideleft",
            "slide-right": "slideright",
            "slide-up": "slideup",
            "slide-down": "slidedown",
            "wipe-left": "wipeleft",
            "wipe-right": "wiperight",
            "zoom-in": "zoomin",
            "zoom-out": "fadeblack",
            "none": "fade",
        }
        return mapping.get(name, "fade")

    # ── Audio chain ──────────────────────────────────────────────────────────

    def _build_audio_chain(
        self,
        n_video: int,
        n_audio: int,
        clip_durations: list[float],
        audio_meta: list[dict],
        filter_parts: list[str],
    ) -> str | None:
        """Build audio mixing filter: video audio + voiceover + music."""
        audio_labels: list[str] = []

        # 1. Concat the video-embedded audio tracks
        if n_video > 1:
            va_inputs = "".join(f"[va{i}]" for i in range(n_video))
            filter_parts.append(f"{va_inputs}concat=n={n_video}:v=0:a=1[abase]")
            audio_labels.append("[abase]")
        elif n_video == 1:
            audio_labels.append("[va0]")

        # 2. Process each external audio input (voiceover + music)
        for idx, meta in enumerate(audio_meta):
            input_idx = n_video + idx
            label = f"aext{idx}"

            parts: list[str] = []

            # Volume adjustment (0-100 -> 0.0-1.0)
            vol = float(meta.get("volume", 100)) / 100.0
            parts.append(f"volume={vol:.2f}")

            # Delay to start_time (adelay expects milliseconds)
            start_ms = int(float(meta.get("start_time", 0)) * 1000)
            if start_ms > 0:
                parts.append(f"adelay={start_ms}|{start_ms}")

            # Fade in
            fade_in = float(meta.get("fade_in", 0))
            if fade_in > 0:
                parts.append(f"afade=t=in:d={fade_in}")

            # Fade out
            fade_out = float(meta.get("fade_out", 0))
            if fade_out > 0:
                parts.append(f"afade=t=out:d={fade_out}")

            chain = ",".join(parts) if parts else "anull"
            filter_parts.append(f"[{input_idx}:a]{chain}[{label}]")
            audio_labels.append(f"[{label}]")

        if not audio_labels:
            return None

        if len(audio_labels) == 1:
            return audio_labels[0]

        # Mix all audio streams together
        mix_inputs = "".join(audio_labels)
        filter_parts.append(
            f"{mix_inputs}amix=inputs={len(audio_labels)}:"
            f"duration=longest:normalize=0[amixed]"
        )
        return "[amixed]"

    # ── Caption filter ───────────────────────────────────────────────────────

    @staticmethod
    def _build_caption_filter(items: list[dict], style: dict) -> str:
        """Build drawtext filters for caption burn-in."""
        font_size = style.get("fontSize", 32)
        font_color = style.get("color", "white")
        bg_color = style.get("backgroundColor", "black")
        bg_opacity = float(style.get("backgroundOpacity", 0.6))
        position = style.get("position", "bottom")

        # ffmpeg boxcolor with alpha
        box_color = f"{bg_color}@{bg_opacity:.1f}"

        # Position coordinates
        coords = {
            "top": "x=(w-text_w)/2:y=50",
            "center": "x=(w-text_w)/2:y=(h-text_h)/2",
            "bottom": "x=(w-text_w)/2:y=h-text_h-80",
        }.get(position, "x=(w-text_w)/2:y=h-text_h-80")

        parts: list[str] = []
        for cap in items:
            text = (
                cap.get("text", "")
                .replace("\\", "\\\\")
                .replace("'", "\u2019")  # smart quote to avoid shell issues
                .replace(":", "\\:")
                .replace("%", "%%")
            )
            start = cap.get("start_time", 0)
            end = cap.get("end_time", 999)

            parts.append(
                f"drawtext=text='{text}':"
                f"fontsize={font_size}:fontcolor={font_color}:"
                f"box=1:boxcolor={box_color}:boxborderw=10:"
                f"{coords}:"
                f"enable='between(t\\,{start}\\,{end})'"
            )

        return "," + ",".join(parts) if parts else ""

    # ── Utility ──────────────────────────────────────────────────────────────

    @staticmethod
    async def get_duration_ffprobe(filepath: str | Path) -> float:
        """Get media duration using ffprobe."""
        try:
            result = subprocess.run(
                [
                    "ffprobe", "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    str(filepath),
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0 and result.stdout.strip():
                return round(float(result.stdout.strip()), 1)
        except Exception as e:
            logger.warning("ffprobe failed: %s", e)

        return 0.0
