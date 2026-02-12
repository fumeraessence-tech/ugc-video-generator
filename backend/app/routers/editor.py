"""
Editor API Router

Endpoints for the post-production video editor:
- TTS voiceover generation
- Music file upload
- Music library listing
- Video compilation with transitions, audio mixing, captions
"""

import asyncio
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.middleware.auth import AuthUser, get_current_user

from app.services.audio_service import AudioService
from app.services.ffmpeg_service import FFmpegService
from app.utils.redis_client import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/editor", tags=["editor"])

# Audio output directory
AUDIO_DIR = Path(__file__).resolve().parents[3] / "frontend" / "public" / "uploads" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


# ── Schemas ──────────────────────────────────────────────────────────────────


class VoiceoverRequest(BaseModel):
    scene_number: int
    text: str
    language_code: str = "en-US"
    voice_name: str = "en-US-Studio-O"
    pitch: float = 0.0
    speaking_rate: float = 1.0


class VoiceoverResponse(BaseModel):
    scene_number: int
    audio_url: str
    duration_seconds: float
    status: str


class MusicTrackResponse(BaseModel):
    id: str
    name: str
    artist: str
    duration: float
    url: str
    category: str
    bpm: int | None = None
    is_preset: bool = True


class UploadMusicResponse(BaseModel):
    id: str
    name: str
    url: str
    duration: float


# ── Preset Music Library ─────────────────────────────────────────────────────

PRESET_MUSIC: list[dict] = [
    {
        "id": "music-upbeat-1",
        "name": "Energy Boost",
        "artist": "UGCGen Library",
        "duration": 30.0,
        "url": "/uploads/audio/presets/energy-boost.mp3",
        "category": "upbeat",
        "bpm": 128,
        "is_preset": True,
    },
    {
        "id": "music-calm-1",
        "name": "Gentle Morning",
        "artist": "UGCGen Library",
        "duration": 45.0,
        "url": "/uploads/audio/presets/gentle-morning.mp3",
        "category": "calm",
        "bpm": 80,
        "is_preset": True,
    },
    {
        "id": "music-dramatic-1",
        "name": "Rising Action",
        "artist": "UGCGen Library",
        "duration": 35.0,
        "url": "/uploads/audio/presets/rising-action.mp3",
        "category": "dramatic",
        "bpm": 110,
        "is_preset": True,
    },
    {
        "id": "music-corporate-1",
        "name": "Business Forward",
        "artist": "UGCGen Library",
        "duration": 40.0,
        "url": "/uploads/audio/presets/business-forward.mp3",
        "category": "corporate",
        "bpm": 100,
        "is_preset": True,
    },
    {
        "id": "music-fun-1",
        "name": "Happy Days",
        "artist": "UGCGen Library",
        "duration": 30.0,
        "url": "/uploads/audio/presets/happy-days.mp3",
        "category": "fun",
        "bpm": 120,
        "is_preset": True,
    },
    {
        "id": "music-ambient-1",
        "name": "Soft Focus",
        "artist": "UGCGen Library",
        "duration": 60.0,
        "url": "/uploads/audio/presets/soft-focus.mp3",
        "category": "ambient",
        "bpm": 70,
        "is_preset": True,
    },
]


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/generate-voiceover", response_model=VoiceoverResponse)
async def generate_voiceover(req: VoiceoverRequest, current_user: AuthUser = Depends(get_current_user)):
    """Generate TTS voiceover for a scene's dialogue."""
    try:
        audio_service = AudioService()
        result = await audio_service.generate_tts(
            text=req.text,
            voice_config={
                "language_code": req.language_code,
                "name": req.voice_name,
                "pitch": str(req.pitch),
                "speed": str(req.speaking_rate),
            },
        )

        audio_url = result.get("audio_url", "")
        duration = float(result.get("duration_seconds", "0"))

        return VoiceoverResponse(
            scene_number=req.scene_number,
            audio_url=audio_url,
            duration_seconds=duration,
            status=result.get("status", "completed"),
        )
    except Exception as e:
        logger.exception("Voiceover generation failed for scene %d", req.scene_number)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/music-library", response_model=list[MusicTrackResponse])
async def get_music_library(category: str | None = None, current_user: AuthUser = Depends(get_current_user)):
    """Return the preset music library, optionally filtered by category."""
    tracks = PRESET_MUSIC
    if category:
        tracks = [t for t in tracks if t["category"] == category]
    return [MusicTrackResponse(**t) for t in tracks]


@router.post("/upload-music", response_model=UploadMusicResponse)
async def upload_music(file: UploadFile = File(...), current_user: AuthUser = Depends(get_current_user)):
    """Upload a custom music file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Validate file type
    allowed_types = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm"}
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Allowed: {', '.join(allowed_types)}",
        )

    # Save file
    file_id = str(uuid.uuid4())[:8]
    ext = os.path.splitext(file.filename)[1] or ".mp3"
    filename = f"custom-{file_id}{ext}"
    filepath = AUDIO_DIR / filename

    try:
        content = await file.read()
        filepath.write_bytes(content)

        # Get actual duration using ffprobe
        duration = await FFmpegService.get_duration_ffprobe(filepath)
        if duration <= 0:
            # Fallback: rough estimate from file size (~128 kbps)
            duration = round(len(content) / (128 * 1024 / 8), 1)

        return UploadMusicResponse(
            id=f"custom-{file_id}",
            name=file.filename,
            url=f"/uploads/audio/{filename}",
            duration=duration,
        )
    except Exception as e:
        logger.exception("Music upload failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Compile Endpoints (Redis-backed) ─────────────────────────────────────────


class CompileRequest(BaseModel):
    clips: list[dict]
    transitions: list[dict] = []
    audio: dict | None = None
    captions: dict | None = None
    settings: dict | None = None


class CompileResponse(BaseModel):
    job_id: str
    status: str


class CompileStatusResponse(BaseModel):
    status: str
    percent: int
    message: str
    output_url: str | None = None


@router.post("/compile", response_model=CompileResponse)
async def compile_video(req: CompileRequest, current_user: AuthUser = Depends(get_current_user)):
    """Start video compilation. Returns a job_id for progress polling."""
    job_id = uuid.uuid4().hex[:8]

    # Store initial state in Redis
    r = await get_redis()
    await r.hset(f"compile:{job_id}", mapping={
        "status": "preparing",
        "percent": "0",
        "message": "Preparing compilation...",
        "output_url": "",
    })

    async def run_compile():
        try:
            ffmpeg = FFmpegService()

            async def progress_cb(percent: int, message: str):
                await r.hset(f"compile:{job_id}", mapping={
                    "status": "rendering" if percent < 100 else "complete",
                    "percent": str(percent),
                    "message": message,
                    "output_url": "",
                })

            result = await ffmpeg.compile_video(
                clips=req.clips,
                transitions=req.transitions,
                audio=req.audio,
                captions=req.captions,
                settings=req.settings,
                progress_callback=progress_cb,
            )

            if result.get("status") == "error":
                await r.hset(f"compile:{job_id}", mapping={
                    "status": "error",
                    "percent": "0",
                    "message": result.get("error", "Compilation failed"),
                    "output_url": "",
                })
            else:
                await r.hset(f"compile:{job_id}", mapping={
                    "status": "complete",
                    "percent": "100",
                    "message": "Export complete!",
                    "output_url": result.get("output_url", ""),
                })
        except Exception as e:
            logger.exception("Compilation job %s failed", job_id)
            await r.hset(f"compile:{job_id}", mapping={
                "status": "error",
                "percent": "0",
                "message": str(e),
                "output_url": "",
            })

    # Run compilation in background
    asyncio.create_task(run_compile())

    return CompileResponse(job_id=job_id, status="preparing")


@router.get("/compile/{job_id}/status", response_model=CompileStatusResponse)
async def get_compile_status(job_id: str, current_user: AuthUser = Depends(get_current_user)):
    """Poll compilation progress from Redis."""
    r = await get_redis()
    job = await r.hgetall(f"compile:{job_id}")

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return CompileStatusResponse(
        status=job.get("status", "unknown"),
        percent=int(job.get("percent", "0")),
        message=job.get("message", ""),
        output_url=job.get("output_url") or None,
    )
