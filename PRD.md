# UGC Video Generator (UGCGen) — Product Requirements Document

**Project Name:** UGC Video Generator (UGCGen)
**Version:** 2.0
**Last Updated:** 2026-02-08
**Author:** Narayan Vaish
**Status:** Development Complete — Ready for API Integration Testing

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Tech Stack](#4-tech-stack)
5. [Backend Architecture](#5-backend-architecture)
6. [Frontend Architecture](#6-frontend-architecture)
7. [AI Pipeline — 10-Step Orchestrator](#7-ai-pipeline--10-step-orchestrator)
8. [Core Modules — Backend Services](#8-core-modules--backend-services)
9. [Core Modules — AI Agents](#9-core-modules--ai-agents)
10. [Character DNA System](#10-character-dna-system)
11. [Production Bible System](#11-production-bible-system)
12. [Chat Experience — Smart Copilot](#12-chat-experience--smart-copilot)
13. [Mass Generator Wizard](#13-mass-generator-wizard)
14. [Video Editor — Post-Production](#14-video-editor--post-production)
15. [Library & Job Management](#15-library--job-management)
16. [Database Schema](#16-database-schema)
17. [API Reference — Backend](#17-api-reference--backend)
18. [API Reference — Frontend Routes](#18-api-reference--frontend-routes)
19. [Authentication & Security](#19-authentication--security)
20. [State Management](#20-state-management)
21. [Real-Time Communication](#21-real-time-communication)
22. [Character Consistency Enforcement](#22-character-consistency-enforcement)
23. [Ultra-Realism Requirements](#23-ultra-realism-requirements)
24. [Configuration & Environment](#24-configuration--environment)
25. [Infrastructure](#25-infrastructure)
26. [Deployment Guide](#26-deployment-guide)
27. [Risk Assessment](#27-risk-assessment)
28. [Roadmap](#28-roadmap)

---

## 1. Executive Summary

UGCGen is an AI-powered platform that generates ultra-realistic User-Generated Content (UGC) style videos end-to-end. The system orchestrates multiple AI agents — script writing, storyboard generation, character DNA management, video generation, voiceover synthesis, and post-production — into a seamless pipeline that produces professional-quality UGC videos indistinguishable from real human-recorded content.

**What's Built:**
- Full-stack application with FastAPI backend and Next.js 16 frontend
- 10-step video generation pipeline with resumability
- AI copilot chat with Server-Sent Events streaming
- Character DNA extraction and consistency enforcement
- Production Bible assembly (Product DNA + Avatar DNA + Style + Camera + Lighting + Realism)
- Mass Generator 6-step wizard
- Timeline-based video editor with multi-track support
- Avatar management with reference angle validation
- Library with job history, search, filtering, and pagination
- Real-time progress tracking via Redis pub/sub + webhooks

**Core AI Models (Google Ecosystem):**

| Function | Primary Model | Model ID | Fallback |
|----------|--------------|----------|----------|
| Script Generation | Gemini 2.5 Pro | `gemini-2.5-pro-preview-06-05` | Gemini 2.5 Flash |
| Scene Prompts | Gemini 2.5 Pro | `gemini-2.5-pro-preview-06-05` | Gemini 2.5 Flash |
| Storyboard Images | Imagen 4 Ultra | `imagen-4.0-ultra-generate-exp-05-20` | Imagen 4 Generate |
| Video Generation | Veo 3.1 | `veo-3.1-generate-preview` | Veo 3.1 Fast → Veo 2 |
| Voiceover TTS | Gemini TTS | `gemini-2.5-flash-preview-tts` | Google Cloud TTS |
| DNA Extraction | Gemini 2.5 Pro Vision | `gemini-2.5-pro-preview-06-05` | Gemini 2.5 Flash |
| Consistency Scoring | Gemini 2.5 Flash | `gemini-2.5-flash` | — |
| Intent Detection | Gemini 2.5 Flash | `gemini-2.5-flash` | Falls back to CHAT intent |

---

## 2. Problem Statement

Creating consistent, high-quality UGC videos with AI is currently fragmented and manual:

1. **Character drift** — Character appearance changes across clips (face shapes, skin tones, accessories)
2. **8-second clip limit** — Even with Veo 3.1 extension (up to 148s), managing continuity across scenes requires orchestration
3. **No unified pipeline** — No system connecting script → storyboard → video → audio → final output
4. **Color/lighting breaks** — Continuity breaks between AI-generated scenes
5. **AI tells** — Plastic skin, perfect symmetry, uniform teeth make content look artificial
6. **Product inconsistency** — Products appear differently across scenes, wrong colors/labels/proportions

UGCGen solves all of these with a multi-layer consistency system, production bible approach, and 10-step orchestrated pipeline.

---

## 3. System Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                         UGCGen Platform                                │
├──────────────────────────┬────────────────────────────────────────────┤
│                          │                                             │
│   FRONTEND (Next.js 16)  │    BACKEND (FastAPI)                       │
│   ┌──────────────────┐   │    ┌──────────────────────────────────┐   │
│   │ Chat Copilot      │   │    │ AI Agents                        │   │
│   │ (SSE Streaming)   │◄──┼───►│ • CoPilot Agent                  │   │
│   ├──────────────────┤   │    │ • Script Agent                   │   │
│   │ Mass Generator    │   │    │ • Scene Prompt Agent             │   │
│   │ (6-Step Wizard)   │◄──┼───►│ • Storyboard Agent               │   │
│   ├──────────────────┤   │    │ • Video Generator Agent          │   │
│   │ Video Editor      │   │    │ • DNA Extractor Agent            │   │
│   │ (Timeline-based)  │   │    │ • Prompt Engineering Agent       │   │
│   ├──────────────────┤   │    │ • Requirements Agent             │   │
│   │ Avatar Manager    │   │    └───────────────┬──────────────────┘   │
│   ├──────────────────┤   │    ┌───────────────▼──────────────────┐   │
│   │ Library           │   │    │ Services                         │   │
│   │ (Jobs + History)  │   │    │ • ScriptService                  │   │
│   └──────────────────┘   │    │ • ImageService (Imagen 4)        │   │
│                          │    │ • VideoService (Veo 3.1)         │   │
│   Zustand Stores:        │    │ • AudioService (Gemini TTS)      │   │
│   • chat-store           │    │ • FFmpegService                  │   │
│   • editor-store         │    │ • ConsistencyService             │   │
│   • mass-generator-store │    │ • StorageService (GCS/Local)     │   │
│                          │    │ • AvatarVisionService            │   │
│   Prisma + PostgreSQL    │    │ • ProductVisionService           │   │
│                          │    │ • ProductionBibleService         │   │
│                          │    │ • ReferenceValidationService     │   │
│                          │    └───────────────┬──────────────────┘   │
│                          │    ┌───────────────▼──────────────────┐   │
│                          │    │ Video Pipeline (10 Steps)        │   │
│                          │    │ script → prompts → storyboard → │   │
│                          │    │ review → video → extend →       │   │
│                          │    │ audio → post → QC → complete    │   │
│                          │    └──────────────────────────────────┘   │
├──────────────────────────┼────────────────────────────────────────────┤
│        PostgreSQL        │         Redis (Pub/Sub + Celery)          │
└──────────────────────────┴────────────────────────────────────────────┘
```

---

## 4. Tech Stack

### 4.1 Backend

| Component | Technology |
|-----------|-----------|
| Language | Python 3.12 |
| Framework | FastAPI |
| Task Queue | Celery + Redis |
| Pub/Sub | Redis (real-time progress) |
| Storage | Google Cloud Storage (GCS) + Local fallback |
| Database | PostgreSQL (via Prisma on frontend) |
| Video Processing | FFmpeg + MoviePy |
| AI SDK | `google-genai` (Google Generative AI SDK) |
| HTTP Client | httpx (async) |
| Config | pydantic-settings with `.env` |

### 4.2 Frontend

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict mode) |
| UI Library | Tailwind CSS + Shadcn/ui |
| State | Zustand (3 stores with persist middleware) |
| Auth | NextAuth.js v5 (Google OAuth + Credentials) |
| Database ORM | Prisma |
| Database | PostgreSQL |
| Streaming | Server-Sent Events (SSE) |
| Validation | Zod |

### 4.3 Infrastructure

| Component | Technology |
|-----------|-----------|
| Containers | Docker Compose |
| Database | PostgreSQL 16 (port 5432) |
| Cache/Queue | Redis 7 (port 6379) |
| Backend | FastAPI on port 8000 |
| Frontend | Next.js on port 3000 |

---

## 5. Backend Architecture

### 5.1 Directory Structure

```
backend/
├── app/
│   ├── agents/               # AI Agent implementations
│   │   ├── copilot_agent.py          # UGC directing copilot (Gemini 2.5 Pro)
│   │   ├── script_agent.py           # Script generation agent
│   │   ├── scene_prompt_agent.py     # Scene-to-prompt conversion (16.6KB)
│   │   ├── storyboard_agent.py       # Storyboard generation (11.5KB)
│   │   ├── video_generator_agent.py  # Video generation with Veo 3.1 (9KB)
│   │   ├── dna_extractor_agent.py    # Character DNA extraction
│   │   ├── prompt_engineering_agent.py # Prompt best practices (15.1KB)
│   │   └── requirements_agent.py     # Generation requirements checker (9.7KB)
│   ├── config/
│   │   └── settings.py       # pydantic-settings configuration
│   ├── models/
│   │   └── schemas.py        # Pydantic models (enums, camera, lighting, scenes)
│   ├── pipelines/
│   │   └── video_pipeline.py # 10-step pipeline orchestrator
│   ├── routers/              # FastAPI route handlers
│   │   ├── health.py         # GET /health
│   │   ├── generation.py     # POST /api/v1/generation/start
│   │   ├── jobs.py           # GET/PATCH /api/v1/jobs/{id}
│   │   ├── avatars.py        # CRUD /api/v1/avatars (10.2KB)
│   │   ├── copilot.py        # POST /api/v1/copilot/generate-script
│   │   ├── storyboard.py     # POST /api/v1/storyboard/generate (5.5KB)
│   │   ├── video.py          # POST /api/v1/video/generate (7.8KB)
│   │   ├── editor.py         # POST /api/v1/editor/compile (9.9KB)
│   │   └── mass_generator.py # POST /api/v1/mass-generator/* (8.4KB)
│   ├── services/             # Business logic services
│   │   ├── script_service.py
│   │   ├── image_service.py           # Imagen 4 Ultra integration
│   │   ├── video_service.py           # Veo 3.1 integration
│   │   ├── audio_service.py           # Gemini TTS integration
│   │   ├── ffmpeg_service.py          # Video post-processing
│   │   ├── consistency_service.py     # Multi-layer consistency scoring
│   │   ├── storage_service.py         # GCS + local storage
│   │   ├── avatar_vision_service.py   # Avatar image analysis
│   │   ├── product_vision_service.py  # Product DNA extraction
│   │   ├── production_bible_service.py # Master prompt assembly
│   │   └── reference_validation_service.py # Angle validation
│   ├── utils/
│   │   └── redis_client.py   # Redis pub/sub helpers
│   └── main.py               # FastAPI app entry point
├── .env
└── pyproject.toml / requirements.txt
```

### 5.2 Service Initialization Pattern

All services follow a consistent pattern:

```python
class ServiceName:
    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)
```

This allows per-user API keys (from the frontend) to override the system-level key.

---

## 6. Frontend Architecture

### 6.1 Directory Structure

```
frontend/
├── prisma/
│   └── schema.prisma         # Database schema (10 models)
├── src/
│   ├── app/
│   │   ├── (auth)/           # Login + Register pages
│   │   ├── (dashboard)/      # Main app layout with sidebar
│   │   │   ├── chat/         # Chat hub + /chat/[chatId]
│   │   │   ├── avatars/      # Avatar management
│   │   │   ├── library/      # Job history (scripts, audio, storyboards)
│   │   │   ├── generate/     # Mass Generator wizard
│   │   │   ├── editor/       # Timeline-based video editor
│   │   │   ├── settings/     # Profile + API keys
│   │   │   ├── explore/      # Community discovery
│   │   │   └── categories/   # Content categories
│   │   └── api/              # 32+ API route handlers
│   │       ├── auth/         # NextAuth + registration
│   │       ├── chat/         # Chat CRUD + messages (SSE)
│   │       ├── avatars/      # Avatar CRUD + DNA extraction
│   │       ├── upload/       # Generic file upload
│   │       ├── products/     # Product image upload
│   │       ├── copilot/      # Script generation proxy
│   │       ├── storyboard/   # Storyboard generation proxy
│   │       ├── video/        # Video generation proxy
│   │       ├── jobs/         # Job progress + decisions
│   │       ├── library/      # Job listing + management
│   │       ├── settings/     # Profile + API keys
│   │       └── editor/       # Upload music, voiceover, compile
│   ├── components/
│   │   ├── chat/             # Chat UI (container, input, messages, toolbar)
│   │   ├── avatars/          # Avatar cards, selector, detail dialog
│   │   ├── editor/           # Video editor (timeline, preview, panels)
│   │   ├── generation/       # Product upload, background selector
│   │   ├── mass-generator/   # 6-step wizard components
│   │   ├── library/          # Scene breakdown, job cards
│   │   ├── layout/           # Sidebar, topbar, mobile nav
│   │   └── ui/               # Shadcn base components
│   ├── stores/
│   │   ├── chat-store.ts     # Chat + generation settings state
│   │   ├── editor-store.ts   # Video editor state
│   │   └── mass-generator-store.ts # Wizard state
│   ├── types/
│   │   ├── generation.ts     # Generation mode, model, camera, lighting types
│   │   ├── editor.ts         # Timeline, clip, audio, caption types
│   │   └── mass-generator.ts # ProductDNA, ProductionBible, Scene types
│   ├── hooks/
│   │   ├── use-editor-init.ts # Editor initialization from wizard
│   │   ├── use-sidebar.ts     # Sidebar toggle + chat history
│   │   └── use-toast.ts       # Toast notifications
│   ├── lib/
│   │   ├── auth.ts           # NextAuth configuration
│   │   ├── prisma.ts         # Prisma client singleton
│   │   ├── utils.ts          # cn() utility
│   │   ├── crypto.ts         # API key encryption/decryption
│   │   └── wpm-calculator.ts # Words-per-minute validation
│   └── middleware.ts         # Route protection
├── public/
│   └── uploads/              # Local file storage
├── next.config.ts
├── package.json
└── tailwind.config.ts
```

### 6.2 Pages

| Route | Purpose | Key Components |
|-------|---------|---------------|
| `/login` | Authentication | Credentials + Google OAuth |
| `/register` | User registration | Form with validation |
| `/chat` | Chat hub | Quick action cards, setup guide |
| `/chat/[chatId]` | Active conversation | MessageList, ChatInput, streaming |
| `/generate` | Mass Generator | 6-step wizard |
| `/editor` | Video editor | Timeline, preview, properties |
| `/avatars` | Avatar management | System + user avatars, DNA editing |
| `/library` | Job history | Grid view, status badges, search |
| `/library/scripts` | Script library | Script-focused view |
| `/library/audio` | Audio library | Audio-focused view |
| `/library/storyboards` | Storyboard library | Storyboard-focused view |
| `/settings` | User settings | Profile, API keys, preferences |
| `/explore` | Community | Discovery features |
| `/categories` | Content categories | Category browsing |

---

## 7. AI Pipeline — 10-Step Orchestrator

**File:** `backend/app/pipelines/video_pipeline.py`

The pipeline orchestrates the entire video generation process with progress tracking, resumability, and consistency enforcement.

### 7.1 Pipeline Steps

| Step | Progress | Action | Service/Agent |
|------|----------|--------|--------------|
| 1. `script_generation` | 10% | Generate video script from user brief | CoPilotAgent → ScriptService |
| 2. `scene_prompts` | 20% | Convert script scenes to detailed prompts | ScenePromptAgent |
| 3. `storyboard` | 35% | Generate reference images per scene | ImageService (Imagen 4) |
| 4. `storyboard_review` | 40% | Pause for user approval/regeneration | Webhook → Frontend |
| 5. `video_generation` | 60% | Generate video clips per scene | VideoService (Veo 3.1) |
| 6. `video_extension` | 75% | Extend clips for continuity | VideoService (Veo 3.1 extend) |
| 7. `audio_generation` | 85% | Generate voiceover audio | AudioService (Gemini TTS) |
| 8. `post_production` | 92% | FFmpeg stitching + transitions + audio | FFmpegService |
| 9. `quality_check` | 97% | Validate consistency + quality | ConsistencyService |
| 10. `complete` | 100% | Final delivery | StorageService |

### 7.2 Pipeline Configuration

```python
CONSISTENCY_THRESHOLD = 0.75     # Minimum storyboard face similarity
MAX_REGEN_ATTEMPTS = 3           # Auto-regeneration retry limit
MAX_STEP_RETRIES = 2             # Transient failure retry limit
TRANSIENT_STATUS_CODES = {429, 503, 502, 500}
```

### 7.3 Resumability

Each step stores artifacts in the Job model's `stepArtifacts` field:

```json
{
  "script_generation": { "script_url": "..." },
  "storyboard": { "scene_urls": ["..."] },
  "video_generation": { "clip_urls": ["..."] }
}
```

If the pipeline fails, it resumes from `lastCompletedStep` on restart. The `version` and `parentJobId` fields enable iterative refinement.

### 7.4 Progress Tracking

Progress is reported via two channels:
1. **Redis pub/sub** — Real-time to all subscribers on `job:{jobId}:progress`
2. **Webhook callback** — POST to `frontend/api/jobs/[jobId]/progress` which creates assistant messages for milestones

---

## 8. Core Modules — Backend Services

### 8.1 ScriptService

**File:** `backend/app/services/script_service.py`

Generates structured video scripts using Gemini 2.5 Pro with JSON output schema.

**Key Methods:**
- `generate_script(request: GenerationRequest) -> Script` — Takes brand brief, product info, avatar DNA, platform constraints; returns structured scene breakdown
- Enforces WPM constraints (default 150 WPM = 20 words max per 8-second scene)

**Output Format:**
```json
{
  "title": "Product Testimonial",
  "total_duration": 40,
  "scenes": [
    {
      "scene_number": 1,
      "scene_type": "hook",
      "duration_seconds": 8,
      "dialogue": "Okay so I finally got my hands on this...",
      "action": "Character holds product, turns to camera",
      "expression": "Excited, genuine surprise",
      "camera": { "shot_type": "medium", "angle": "eye_level", "movement": "handheld" },
      "lighting": { "type": "natural", "direction": "front_45" },
      "product_visibility": "primary",
      "product_action": "held in hand, label facing camera"
    }
  ],
  "audio_direction": "Warm conversational, authentic UGC energy"
}
```

### 8.2 ImageService

**File:** `backend/app/services/image_service.py`

Generates storyboard images using Google Imagen 4.

**Key Methods:**
- `generate_image(prompt: str, negative_prompt: str, reference_images: list) -> bytes` — Single image generation
- `generate_storyboard(scenes: list, avatar_dna: AvatarDNA, reference_images: list) -> list` — Batch scene generation
- Supports up to 14 reference images simultaneously (Imagen 4 Ultra)
- Returns 2-4 variants per scene for selection

**Models:**
- **Primary:** `imagen-4.0-ultra-generate-exp-05-20` (4K, thinking mode)
- **Fast:** `imagen-4.0-generate-exp-05-20` (draft iterations)

### 8.3 VideoService

**File:** `backend/app/services/video_service.py`

Generates video clips using Google Veo 3.1 via the Gemini API.

**Key Methods:**
- `generate_video(prompt, config, reference_images) -> str` — Single video generation
- `extend_video(video_file, prompt) -> str` — Extend existing video by 7s
- `generate_with_first_frame(prompt, first_frame_image) -> str` — Image-to-video
- `generate_with_frames(prompt, first_frame, last_frame) -> str` — First+last frame interpolation

**Capabilities:**

| Feature | Details |
|---------|---------|
| Ingredients to Video | Up to 3 reference images for consistency |
| Video Extension | Up to 148 seconds total (20 extensions) |
| Image-to-Video | First frame control |
| First + Last Frame | Scene transition interpolation |
| Native Audio | Dialogue, SFX, ambient generated in video |
| Resolution | 720p (default), 1080p, 4K |
| Aspect Ratio | 16:9, 9:16, 1:1 |
| Duration | 4s, 6s, 8s per generation |

**Reference Image Strategy (3 slots):**

| Slot | Image | Purpose |
|------|-------|---------|
| 1 | Character front portrait | Face identity anchor |
| 2 | Angle matching scene camera | Angle-appropriate reference |
| 3 | Approved storyboard frame | Scene composition anchor |

### 8.4 AudioService

**File:** `backend/app/services/audio_service.py`

Generates voiceover audio using Gemini TTS.

**Key Methods:**
- `generate_voiceover(text, voice_config) -> bytes` — Single TTS generation
- `generate_scene_audio(scenes, voice_config) -> list` — Per-scene audio
- `generate_continuous_voiceover(script, voice_config) -> bytes` — Full continuous VO

**Models:**
- **Primary:** `gemini-2.5-flash-preview-tts` (Gemini TTS)
- **Fallback:** Google Cloud TTS Neural2/WaveNet

**Voice Profiles:** Kore, Sage, Mica, Lyra + custom via voice config (pitch, rate, style prompt)

### 8.5 FFmpegService

**File:** `backend/app/services/ffmpeg_service.py`

Handles all video post-production operations.

**Key Methods:**
- `stitch_clips(clips, transitions) -> str` — Combine scene clips with transitions
- `add_audio_track(video, audio, volume) -> str` — Mix audio onto video
- `apply_color_grade(video, lut_path) -> str` — Color grading via LUT
- `extract_last_frame(video) -> str` — Frame extraction for chaining
- `apply_realism_filters(video, config) -> str` — Grain, vignette, shake

**Transition Types:**

| Transition | Duration | Use Case |
|-----------|----------|----------|
| Hard cut | 0s | Same setting, different angle |
| Dissolve | 0.3-1.0s | Emotional shift, scene change |
| Crossfade | 0.8s | Different setting, same character |
| Dip to black | 0.5s | Topic change |
| Whip/zoom | 0.2s | Energy increase |

### 8.6 ConsistencyService

**File:** `backend/app/services/consistency_service.py`

Multi-layer character consistency validation using Gemini Vision.

**Key Methods:**
- `score_storyboard(frame, reference_images) -> float` — Storyboard-level scoring
- `score_video_frames(video, reference_images, sample_rate) -> list[float]` — Frame-by-frame scoring
- `cross_scene_consistency(scenes) -> float` — Standard deviation across scenes

**Thresholds:**

| Check | Threshold | Action on Failure |
|-------|-----------|-------------------|
| Storyboard similarity | > 0.75 | Auto-regenerate (up to 3x) |
| Video frame similarity | > 0.65 | Flag for regeneration |
| Cross-scene std dev | < 0.10 | Regenerate outlier scenes |

### 8.7 StorageService

**File:** `backend/app/services/storage_service.py`

Dual-mode storage — Google Cloud Storage for production, local filesystem for development.

**Key Methods:**
- `upload(file_bytes, path) -> str` — Upload file, returns public URL
- `download(path) -> bytes` — Download file
- `list_files(prefix) -> list[str]` — List files by prefix

**Storage Paths:**
- Local: `frontend/public/uploads/{type}/{userId}/{filename}`
- GCS: `gs://ugcgen-assets/{type}/{userId}/{filename}`

### 8.8 ProductVisionService

**File:** `backend/app/services/product_vision_service.py`

Extracts Product DNA from uploaded product images using Gemini Vision.

**Output (ProductDNA):**
```json
{
  "product_type": "skincare_serum",
  "product_name": "Vitamin C Glow Serum",
  "colors": { "primary": "#FFD700", "secondary": "#FFFFFF", "packaging": "#000000" },
  "shape": "cylindrical_dropper_bottle",
  "materials": ["glass", "metal_cap"],
  "texture": "smooth, translucent liquid",
  "branding_text": ["Vitamin C", "30ml", "Made in Korea"],
  "logo_description": "Minimalist gold leaf icon on black label",
  "distinctive_features": ["gold foil accent", "frosted glass body"],
  "prohibited_variations": ["Never change label text", "Never alter bottle shape"]
}
```

### 8.9 ProductionBibleService

**File:** `backend/app/services/production_bible_service.py`

Assembles the master Production Bible from all DNA components.

**Bible Components:**
1. **Product DNA** — From ProductVisionService
2. **Avatar DNA** — From DNAExtractorAgent
3. **Style Config** — Platform, duration, style, tone, pacing
4. **Creative Brief** — Hook strategy, pain points, selling points, CTA
5. **Camera Language** — Default shots, angles, movements, lens specs
6. **Lighting Bible** — Setup, direction, color temp, intensities
7. **Realism Rules** — Skin, face, hands, environment, product fidelity
8. **Master Prompt** — Assembled mega-prompt for all generation steps

### 8.10 AvatarVisionService

**File:** `backend/app/services/avatar_vision_service.py`

Analyzes uploaded avatar images for angle classification and quality.

**Key Methods:**
- `classify_angle(image) -> ReferenceAngle` — Determine which angle (front, left_profile, etc.)
- `validate_coverage(images) -> dict` — Check if required angles are covered

### 8.11 ReferenceValidationService

**File:** `backend/app/services/reference_validation_service.py`

Validates that avatar reference images meet quality and coverage requirements.

**Required Angles:** front, left_profile, right_profile (minimum)
**Optional Angles:** back, three_quarter_left, three_quarter_right

---

## 9. Core Modules — AI Agents

### 9.1 CoPilotAgent

**File:** `backend/app/agents/copilot_agent.py` (12.7KB)

AI director with 30+ years of UGC expertise. Generates scripts with product integration rules.

**System Prompt Personality:**
- Expert in UGC directing for Nike, Apple, Sephora, Amazon
- Psychology, storytelling, platform optimization
- 80% product visibility rule enforcement
- Natural integration phrases
- Per-platform timing (Instagram 30-60s, TikTok 15-30s, YouTube Shorts 30-60s)

**Key Methods:**
- `generate_script(prompt, product_name, background, platform, avatar_dna) -> Script`
- `refine_script(script, feedback) -> Script`

### 9.2 ScenePromptAgent

**File:** `backend/app/agents/scene_prompt_agent.py` (16.6KB)

Converts script scenes into detailed prompts for image and video generation.

**Master Prompt Template Structure:**
```
[REALISM_HEADER]           → Ultra-realistic UGC, shot on iPhone 17 Pro Max...
[CHARACTER_DNA_BLOCK]      → Full character appearance description
[SCENE_SPECIFIC_BLOCK]     → This scene's action, expression, dialogue
[ENVIRONMENT_BLOCK]        → Setting, lighting, props, background
[CAMERA_BLOCK]             → Shot type, angle, movement, DOF
[SKIN_REALISM_BLOCK]       → Pores, blemishes, texture, natural sheen
[AUDIO_DESCRIPTION_BLOCK]  → Dialogue delivery, ambient sound
[CONSISTENCY_LOCK_BLOCK]   → Attributes that must NOT change
[NEGATIVE_PROMPT_BLOCK]    → What to avoid
```

**Output per Scene:**
- `storyboard_prompt` — For Imagen 4 (static frame)
- `video_prompt` — For Veo 3.1 (animated scene)
- `negative_prompt` — Universal negative constraints
- `ingredient_references` — Which DNA images to inject

### 9.3 StoryboardAgent

**File:** `backend/app/agents/storyboard_agent.py` (11.5KB)

Generates storyboard images with character + product consistency.

**Features:**
- 4 variants per scene for selection
- Character + product reference image injection
- Consistency scoring (0-100)
- Professional cinematography prompts (ARRI Alexa, RED Komodo specs)

**Prompt Includes:**
- Character unique ID (e.g., `aria_sharma_casual_creator_id_001`)
- Natural skin texture requirements (NO plastic)
- Camera specs: body, lens, shot type, angle, movement, focus
- Lighting specs: type, direction, color temp, key/fill/rim intensity
- Product visibility instructions
- Negative prompt (AI artifacts, distortion, etc.)

### 9.4 VideoGeneratorAgent

**File:** `backend/app/agents/video_generator_agent.py` (9KB)

Generates video clips with Veo 3.1 and frame continuity chaining.

**Process:**
1. Generate Scene 1 video (uses storyboard image as ingredient)
2. Extract last frame from Scene 1
3. Generate Scene 2 (first frame = Scene 1 last frame, last frame = Scene 2 storyboard)
4. Repeat for all scenes
5. Stitch all scenes into final video via FFmpeg

**Generation Modes:**
- `FIRST_AND_LAST_FRAMES_2_VIDEO` — Interpolation between two frames
- `ingredients` — Reference image-based generation
- `text` — Text prompt only
- `image` — Image-to-video
- `extend` — Video extension

### 9.5 DNAExtractorAgent

**File:** `backend/app/agents/dna_extractor_agent.py` (4.8KB)

Extracts character DNA from uploaded reference images using Gemini Vision.

**Methods:**
- `extract_from_base64(images: list[dict]) -> AvatarDNA` — From base64 images
- `extract(image_urls: list[str]) -> AvatarDNA` — From URLs

**Output (AvatarDNA):**
```json
{
  "face": "Oval face, high cheekbones, refined chin...",
  "skin": "Warm honey-brown, Fitzpatrick Type IV...",
  "eyes": "Almond-shaped, deep amber-brown with golden flecks...",
  "hair": "Rich dark brown, Type 2B waves, mid-back length...",
  "body": "5'6\", slim with soft feminine curves...",
  "voice": "Warm, medium-pitch, slight Indian-English accent...",
  "wardrobe": "Elegant casual, silk blouse, minimal gold jewelry...",
  "prohibited_drift": "Eye color NEVER changes, skin tone NEVER changes..."
}
```

### 9.6 PromptEngineeringAgent

**File:** `backend/app/agents/prompt_engineering_agent.py` (15.1KB)

Applies research-backed prompting best practices for artifact-free generation.

**Components:**
- `PromptComponents` dataclass (subject, context, style, camera, lighting, quality, constraints, negative)
- Comprehensive negative prompt library (universal, anatomy, product, video)
- Quality modifiers (photo, cinematic, product, portrait, ugc)
- Camera specs presets (close_up, medium, wide, product, cinematic)
- Lighting presets (natural, golden_hour, studio, soft, dramatic)

**Key Method:**
- `engineer_image_prompt(scene, character, product, camera, lighting, quality) -> (positive_prompt, negative_prompt)`

### 9.7 RequirementsAgent

**File:** `backend/app/agents/requirements_agent.py` (9.7KB)

Checks generation readiness and identifies missing requirements.

**Validates:**
- Avatar selected + DNA available
- Product images uploaded (for VIDEO_READY intent)
- Platform configured
- Script generated and approved
- API keys available and valid

---

## 10. Character DNA System

### 10.1 DNA Structure

Each avatar has a comprehensive Character DNA profile stored as JSON:

```json
{
  "face": "Oval face, balanced features, high cheekbones, refined chin",
  "skin": "Warm honey-brown, Fitzpatrick Type IV, visible pores, light freckles",
  "eyes": "Almond-shaped, deep amber-brown with golden flecks, full dark brows",
  "hair": "Rich dark brown with auburn highlights, Type 2B waves, mid-back length",
  "body": "5'6\", slim with soft feminine curves, confident posture",
  "voice": "Warm, medium-pitch, slightly husky, neutral Indian-English accent",
  "wardrobe": "Elegant casual, silk blouse, minimal gold jewelry, no logos",
  "prohibited_drift": "Eye color ALWAYS amber-brown, skin ALWAYS honey-brown, hair ALWAYS dark brown, beauty mark ALWAYS on right jawline"
}
```

### 10.2 Reference Image System

Avatars store reference images with angle classification:

**Required Angles:** front, left_profile, right_profile
**Optional Angles:** back, three_quarter_left, three_quarter_right

```json
{
  "referenceAngles": {
    "front": "/uploads/avatars/user123/front.jpg",
    "left_profile": "/uploads/avatars/user123/left.jpg",
    "right_profile": "/uploads/avatars/user123/right.jpg"
  },
  "angleValidation": {
    "front": true,
    "left_profile": true,
    "right_profile": true,
    "back": false,
    "three_quarter_left": false,
    "three_quarter_right": false
  }
}
```

### 10.3 DNA Extraction Pipeline

1. User uploads 3-10 photos from multiple angles
2. AvatarVisionService classifies each image's angle
3. ReferenceValidationService checks coverage (front + 2 profiles minimum)
4. DNAExtractorAgent analyzes images with Gemini Vision
5. Structured AvatarDNA JSON is generated and stored
6. User can review and manually adjust DNA fields

---

## 11. Production Bible System

The Production Bible is a master document assembled per-job that ensures consistency across all pipeline steps.

### 11.1 Bible Components

| Component | Source | Purpose |
|-----------|--------|---------|
| Product DNA | ProductVisionService | Product appearance consistency |
| Avatar DNA | DNAExtractorAgent | Character appearance consistency |
| Style Config | User selection | Platform, duration, tone, pacing |
| Creative Brief | User + AI expansion | Hook, pain points, CTA strategy |
| Camera Language | User + defaults | Shot types, angles, movements, lens |
| Lighting Bible | User + defaults | Setup, direction, color temp, intensity |
| Realism Rules | System defaults | Skin, face, hands, environment rules |
| Master Prompt | Auto-assembled | Combined mega-prompt for all steps |

### 11.2 Realism Rules

```json
{
  "skin": "Visible pores, micro-imperfections, natural sebaceous activity, fine vellus hair",
  "face": "Natural asymmetry, one eyebrow slightly higher, natural tooth variation",
  "hands": "Correct finger count, natural proportions, visible veins and tendons",
  "environment": "Natural window light, subtle shadows, authentic room details",
  "product_fidelity": "Exact label text, correct colors, accurate proportions, real reflections",
  "text_overlays": "Legible, correctly spelled, properly positioned"
}
```

---

## 12. Chat Experience — Smart Copilot

### 12.1 Architecture

The chat system uses Server-Sent Events (SSE) for real-time streaming and has three-way intent detection.

**Flow:**
```
User Message → Intent Detection (Gemini Flash, 5s timeout)
                    ↓
          ┌─────────┼──────────┐
          ▼         ▼          ▼
       CHAT    VIDEO_NEEDS   VIDEO_READY
    (general     INPUT       (start pipeline)
     chat)    (guidance)
```

### 12.2 Intent Detection

**Model:** Gemini 2.5 Flash with `temperature: 0`
**Timeout:** 5 seconds (falls back to CHAT on timeout)

**Strict matching:** Only exact matches for `VIDEO_READY`, `VIDEO_NEEDS_INPUT`, `CHAT` — no substring matching.

**VIDEO_READY triggers when:** User has selected an avatar, provided product info, and gives a clear generation instruction.

### 12.3 Chat Features

- **SSE Streaming** — Real-time token-by-token response
- **AbortController** — Cancel in-flight streams via "Stop generating" button
- **Smart Auto-Scroll** — Only scrolls if user is within 150px of bottom
- **Error Recovery** — Error banner with dismiss, not silent failures
- **Attachment Upload** — Images/videos uploaded via `/api/upload`, URLs passed in message body
- **Polling Guard** — Polling paused during active stream to prevent state clobber
- **Mode Indicator** — Shows "Ready to generate" (green), "Add avatar/product" (amber), or "Chat mode" (muted)

### 12.4 Toolbar

Simplified to 4 items: `[+Attach] [Avatar] [Settings Gear] — spacer — [Send]`

All generation controls (mode, aspect ratio, duration, camera, lighting, audio, model selection) consolidated into the Settings gear panel.

---

## 13. Mass Generator Wizard

### 13.1 6-Step Process

| Step | Name | Action |
|------|------|--------|
| 1 | **Product** | Upload product images → extract Product DNA via Gemini Vision |
| 2 | **Avatar** | Select existing avatar or create new one with DNA extraction |
| 3 | **Brief** | User provides creative brief → AI expands with hook strategy, selling points, CTA |
| 4 | **Script** | AI generates structured scene-by-scene script → user reviews/edits |
| 5 | **Generate** | Pipeline generates storyboard images + video clips per scene |
| 6 | **Video** | Continue to editor for final assembly |

### 13.2 State (mass-generator-store.ts)

```typescript
interface WizardState {
  currentStep: WizardStep;
  productImages: string[];
  productName: string;
  brandName: string;
  productDNA: ProductDNA | null;
  selectedAvatarId: string | null;
  avatarDNA: AvatarDNA | null;
  platform: Platform;
  style: VideoStyle;
  tone: Tone;
  duration: number;
  userPrompt: string;
  creativeBrief: CreativeBrief | null;
  productionBible: ProductionBible | null;
  script: Script | null;
}
```

Persisted via Zustand persist middleware for recovery across sessions.

---

## 14. Video Editor — Post-Production

### 14.1 Layout

```
┌─────────────────────────────────────────────────┐
│  Editor Toolbar (undo, redo, clip selector, export)  │
├───────────────────────────────┬─────────────────┤
│                               │                  │
│   Video Preview Panel         │  Properties      │
│   (live canvas + playback)    │  Panel           │
│                               │  (clip, audio,   │
│                               │   caption props) │
├───────────────────────────────┴─────────────────┤
│  Timeline Editor (300px height)                      │
│  ┌─ Time Ruler ────────────────────────────────┐    │
│  │ Video Track    [Clip 1][Trans][Clip 2]...   │    │
│  │ Audio Track    [Voiceover]                   │    │
│  │ Music Track    [Background Music]            │    │
│  │ Captions Track [Caption 1][Caption 2]...     │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 14.2 Features

- **Multi-track timeline** — Video, voiceover, music, SFX, captions
- **Clip trimming** — Adjust start/end points per clip
- **Clip cropping** — Percentage-based crop settings
- **Transitions** — 12+ types (fade, crossfade, slide, wipe, zoom, dissolve)
- **Playback** — Play/pause/stop/seek with playhead indicator
- **Caption editing** — Per-caption timing, style (font, size, color, animation)
- **Audio mixing** — Per-track volume, fade in/out, master volume
- **Voiceover generation** — In-editor TTS via Gemini
- **Music library** — Upload or select background music
- **Export** — Resolution (720p, 1080p, 4K), format (MP4, WebM), quality (draft, standard, high)

### 14.3 State (editor-store.ts)

```typescript
interface EditorState {
  projectId: string | null;
  sceneClips: Record<number, TimelineClip[]>;
  scriptScenes: Scene[];
  timelineClips: TimelineClip[];
  transitions: TimelineTransition[];
  playbackState: 'stopped' | 'playing' | 'paused';
  currentTime: number;
  zoom: number; // 1-10
  aspectRatio: AspectRatio;
  voiceoverClips: AudioClip[];
  musicClips: AudioClip[];
  sfxClips: AudioClip[];
  masterVolume: number;
  captions: Caption[];
  captionStyle: CaptionStyle;
  exportSettings: ExportSettings;
  exportProgress: ExportProgress;
}
```

---

## 15. Library & Job Management

### 15.1 Job Lifecycle

```
queued → running → paused (storyboard_review) → running → completed
                                                        → failed
                                                        → cancelled
```

### 15.2 Library UI

- **Grid view** with thumbnails and status badges
- **Search** by job title/product name
- **Filter** by status (all, completed, running, failed, queued)
- **Pagination** (page-based, configurable limit)
- **Quick actions:**
  - Download final video
  - Continue in chat
  - Re-generate (version chaining)
  - Delete job
- **Detail dialog** with 3 tabs:
  - **Preview** — Video player
  - **Scenes** — Scene-by-scene breakdown (script + storyboard + video)
  - **Details** — Metadata, consistency scores, timestamps

### 15.3 Script Editing

Users can edit scripts in-place after generation:

- Per-scene editing (dialogue, action, camera, lighting)
- Track which scenes were modified
- Reset individual scene edits or all edits
- Regenerate only modified scenes

---

## 16. Database Schema

### 16.1 Prisma Models (10 Total)

#### User
```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  passwordHash  String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  sessions      Session[]
  chats         Chat[]
  avatars       Avatar[]
  jobs          Job[]
  apiKeys       UserApiKey[]
}
```

#### Avatar
```prisma
model Avatar {
  id               String   @id @default(cuid())
  name             String
  tag              String
  uniqueIdentifier String?  @unique
  isSystem         Boolean  @default(false)
  thumbnailUrl     String?
  referenceSheet   String?
  referenceImages  String[]
  dna              Json?
  detailedDNA      String?  @db.Text
  referenceAngles  Json?
  angleValidation  Json?
  userId           String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  user             User?    @relation(...)
  chats            Chat[]
  jobs             Job[]
}
```

#### Chat + Message
```prisma
model Chat {
  id        String    @id @default(cuid())
  title     String    @default("New Chat")
  userId    String
  avatarId  String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  user      User      @relation(...)
  avatar    Avatar?   @relation(...)
  messages  Message[]
  jobs      Job[]
}

model Message {
  id        String   @id @default(cuid())
  chatId    String
  role      Role     // user | assistant | system
  content   String   @db.Text
  metadata  Json?
  createdAt DateTime @default(now())
  chat      Chat     @relation(...)
}
```

#### Job (Production Pipeline)
```prisma
model Job {
  id                 String        @id @default(cuid())
  chatId             String?
  avatarId           String?
  userId             String
  status             JobStatus     // queued | running | paused | completed | failed | cancelled
  currentStep        PipelineStep  // 10 enum values
  progress           Int           @default(0)
  script             Json?
  storyboard         Json?
  storyboardScenes   Json[]
  videoUrls          Json?
  videoScenes        Json[]
  audioUrl           String?
  finalVideoUrl      String?
  errorMessage       String?

  // Product & Config
  productName        String?
  productImages      String[]
  backgroundSetting  String?
  platform           String?
  maxSceneDuration   Int           @default(8)
  wordsPerMinute     Int           @default(150)

  // Consistency
  consistencyScores  Json?
  regenerationLog    Json?
  avatarDNA          Json?
  avatarRefImages    String[]

  // Resumability
  lastCompletedStep  PipelineStep?
  stepArtifacts      Json?
  version            Int           @default(1)
  parentJobId        String?

  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  user               User          @relation(...)
  chat               Chat?         @relation(...)
  avatar             Avatar?       @relation(...)
}
```

#### PipelineStep Enum
```prisma
enum PipelineStep {
  script_generation
  scene_prompts
  storyboard
  storyboard_review
  video_generation
  video_extension
  audio_generation
  post_production
  quality_check
  complete
}
```

#### API Key Models
```prisma
model UserApiKey {
  id           String       @id @default(cuid())
  userId       String
  label        String
  service      PoolType     // google_ai | gcs
  encryptedKey String       @db.Text
  iv           String
  status       ApiKeyStatus // active | rate_limited | exhausted | error
  lastUsedAt   DateTime?
  errorCount   Int          @default(0)
  user         User         @relation(...)
}

model ApiPoolKey {
  id           String       @id @default(cuid())
  service      PoolType
  encryptedKey String       @db.Text
  iv           String
  status       ApiKeyStatus @default(active)
  lastUsedAt   DateTime?
  errorCount   Int          @default(0)
}
```

---

## 17. API Reference — Backend

### 17.1 Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Returns `{"status": "ok", "version": "0.1.0"}` |

### 17.2 Generation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/generation/start` | Start full pipeline (creates Job, launches pipeline) |

### 17.3 Jobs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/jobs/{id}` | Get job status and data |
| PATCH | `/api/v1/jobs/{id}` | Update job status/progress |

### 17.4 Avatars

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/avatars` | List all avatars |
| POST | `/api/v1/avatars` | Create avatar with DNA |
| GET | `/api/v1/avatars/{id}` | Get avatar details |
| PATCH | `/api/v1/avatars/{id}` | Update avatar |
| DELETE | `/api/v1/avatars/{id}` | Delete avatar |
| POST | `/api/v1/avatars/extract-dna` | Extract DNA from images |
| POST | `/api/v1/avatars/upload` | Upload reference images |
| POST | `/api/v1/avatars/{id}/validate-angles` | Validate reference angle coverage |

### 17.5 Copilot

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/copilot/generate-script` | Generate script from creative brief |

### 17.6 Storyboard

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/storyboard/generate` | Generate storyboard images |
| POST | `/api/v1/storyboard/regenerate-scene` | Regenerate single scene |
| POST | `/api/v1/storyboard/regenerate-all` | Regenerate all scenes |

### 17.7 Video

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/video/generate` | Generate video clips from script + storyboard |

### 17.8 Editor

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/editor/compile` | Compile final video with FFmpeg |

### 17.9 Mass Generator

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/mass-generator/analyze-product` | Extract Product DNA |
| POST | `/api/v1/mass-generator/expand-brief` | AI-expand creative brief |
| POST | `/api/v1/mass-generator/generate-bible` | Assemble Production Bible |

---

## 18. API Reference — Frontend Routes

### 18.1 Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | User registration |
| `[...nextauth]` | `/api/auth/*` | NextAuth.js handlers |

### 18.2 Chat

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/chat` | List user chats |
| POST | `/api/chat` | Create new chat |
| GET | `/api/chat/[chatId]` | Get chat metadata |
| DELETE | `/api/chat/[chatId]` | Delete chat |
| GET | `/api/chat/[chatId]/messages` | Get messages (cursor pagination) |
| POST | `/api/chat/[chatId]/messages` | Send message (SSE stream response) |

### 18.3 Avatars

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/avatars` | List system + user avatars |
| POST | `/api/avatars` | Create avatar |
| GET | `/api/avatars/[avatarId]` | Get avatar details |
| PATCH | `/api/avatars/[avatarId]` | Update avatar |
| DELETE | `/api/avatars/[avatarId]` | Delete avatar |
| POST | `/api/avatars/extract-dna` | Extract DNA from images |
| POST | `/api/avatars/upload` | Upload reference images |
| GET | `/api/avatars/[avatarId]/images` | Get reference images |

### 18.4 Jobs & Progress

| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/jobs/[jobId]/progress` | Webhook for backend progress updates |
| GET | `/api/jobs/[jobId]/stream` | SSE stream for real-time progress |
| POST | `/api/jobs/[jobId]/decision` | Submit user decision (approve/reject) |
| POST | `/api/jobs/[jobId]/reopen` | Re-open completed job |
| POST | `/api/jobs/[jobId]/update-artifacts` | Update step outputs |

### 18.5 Library

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/library` | Paginated job list |
| GET | `/api/library/[jobId]` | Get job details |
| DELETE | `/api/library/[jobId]` | Delete job |

### 18.6 Generation Proxies

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/copilot/generate-script` | Proxy to backend copilot |
| POST | `/api/storyboard/generate` | Proxy to backend storyboard |
| POST | `/api/storyboard/regenerate-scene` | Proxy to backend regenerate scene |
| POST | `/api/storyboard/regenerate-all` | Proxy to backend regenerate all |
| POST | `/api/video/generate` | Proxy to backend video generation |

### 18.7 File Uploads

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Generic file upload (images, videos) |
| POST | `/api/products/upload` | Product image upload |
| POST | `/api/editor/upload-music` | Music file upload |
| POST | `/api/editor/generate-voiceover` | Generate TTS audio |
| GET | `/api/editor/music-library` | Available music tracks |

### 18.8 Editor

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/editor/compile/[jobId]` | Compile final video export |

### 18.9 Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings/profile` | Get user profile |
| PATCH | `/api/settings/profile` | Update profile |
| GET | `/api/settings/api-keys` | List API keys |
| POST | `/api/settings/api-keys` | Add API key |
| DELETE | `/api/settings/api-keys/[keyId]` | Remove API key |
| PATCH | `/api/settings/api-keys/[keyId]` | Update key status |

---

## 19. Authentication & Security

### 19.1 Auth System

**Provider:** NextAuth.js v5 with two providers:
1. **Google OAuth** — SSO via Google
2. **Credentials** — Email/password with bcrypt v12 hashing

**Session Strategy:** JWT tokens

**Password Requirements:** 6-100 characters, bcrypt hashed

### 19.2 Route Protection

**Middleware** (`src/middleware.ts`) protects all dashboard routes:
- `/chat/*`, `/avatars/*`, `/library/*`, `/explore/*`, `/categories/*`, `/settings/*`

**API Route Guards:** Every API route checks `auth()` session and verifies `session.user.id`.

### 19.3 API Key Security

User API keys are encrypted before database storage:
- AES-256-GCM encryption
- Per-key initialization vector (IV)
- Keys decrypted only at request time, never stored in memory

### 19.4 File Upload Security

- MIME type validation (image/*, video/* only)
- File size limits (10MB per file)
- Filename sanitization (replace non-alphanumeric chars)
- User-scoped upload directories

---

## 20. State Management

### 20.1 Chat Store (`chat-store.ts`)

**36+ state fields** covering:

| Category | Fields |
|----------|--------|
| Chat | activeChatId, messages, isStreaming, streamingContent |
| Error | error, lastFailedContent |
| Generation | generationMode, selectedModel (script, storyboard, video, tts) |
| Video | aspectRatio, duration, cameraSetup, lightingSetup |
| Style | videoStyle, platform, resolution, realismFilters, colorGrading |
| Avatar | selectedAvatarId, avatarReferenceImages, avatarDNA |
| Audio | audioEnabled |
| Product | productImages, productName, backgroundSetting |
| Script Edit | activeJobId, editingScript, originalScript, editedSceneNumbers |

**Persistence:** Generation settings persisted via Zustand persist middleware.

### 20.2 Editor Store (`editor-store.ts`)

**30+ state fields** covering timeline, playback, audio, captions, export.

### 20.3 Mass Generator Store (`mass-generator-store.ts`)

**20+ state fields** covering the 6-step wizard progress.

---

## 21. Real-Time Communication

### 21.1 Server-Sent Events (SSE)

Used for two purposes:

**Chat Streaming:**
- POST `/api/chat/[chatId]/messages` returns SSE stream
- Events: `user_message`, `stream` (token chunks), `assistant_message`, `error`, `done`
- AbortController enables client-side cancellation

**Job Progress:**
- GET `/api/jobs/[jobId]/stream` polls every 1s, max 10 minutes
- Returns progress percentage, current step, status updates

### 21.2 Redis Pub/Sub

**Channel:** `job:{jobId}:progress`

Pipeline steps publish progress updates:
```python
await publish_progress(job_id, {
    "status": "running",
    "currentStep": "video_generation",
    "progress": 60,
    "message": "Generating scene 3 of 5..."
})
```

### 21.3 Webhook Callbacks

Backend calls frontend webhook on pipeline milestones:
```
POST http://localhost:3000/api/jobs/{jobId}/progress
Body: { status, currentStep, progress, message, data }
```

The webhook creates assistant messages in the chat for user-facing updates.

### 21.4 Message Polling

- Normal: Every 3 seconds
- During streaming: Paused (prevents state clobber)
- After stream ends: Immediate poll to catch webhook-injected messages

---

## 22. Character Consistency Enforcement

### 22.1 Six-Layer Strategy

```
Layer 1: CHARACTER DNA PROMPT INJECTION
  → Every prompt includes full character DNA description
  → Prohibited drift list as negative instructions

Layer 2: VISUAL REFERENCE INJECTION
  → Veo 3.1 ingredients: 3 reference images per scene
  → Imagen 4: Up to 14 reference images
  → Angle-matched references based on scene camera

Layer 3: STORYBOARD VALIDATION
  → Generated frames compared to reference images
  → Gemini Vision similarity scoring > 0.75

Layer 4: VIDEO FRAME VALIDATION
  → Sample frames at 1/sec from generated clips
  → Each frame compared to character reference
  → Frames below 0.65 flagged for regeneration

Layer 5: CROSS-SCENE CONSISTENCY CHECK
  → Standard deviation of similarity across all scenes < 0.10
  → Outlier scenes auto-regenerated

Layer 6: AUTO-REGENERATION
  → Failed scenes regenerated up to 3 times
  → Different seed/prompt variation on each retry
```

### 22.2 Consistency Scoring

**Model:** Gemini 2.5 Flash (vision capabilities)
**Sample Rate:** 1 frame per second of video
**Thresholds:** Storyboard 0.75, Video 0.65, Cross-scene std dev 0.10

---

## 23. Ultra-Realism Requirements

### 23.1 Anti-AI-Detection Measures

| AI Tell | Countermeasure |
|---------|---------------|
| Plastic/smooth skin | Prompt: "visible pores, micro-imperfections, vellus hair" |
| Perfect facial symmetry | Prompt: "natural facial asymmetry" |
| Uniform perfect teeth | Prompt: "natural tooth variation" |
| Over-saturated colors | Post-process: reduce saturation 5-10% |
| No camera imperfections | Add: film grain, chromatic aberration, lens distortion |
| Too stable footage | Add: subtle micro camera shake (1-2px jitter) |
| No compression artifacts | Re-encode at social media bitrates |
| Missing EXIF metadata | Inject realistic metadata (iPhone model, GPS, timestamp) |

### 23.2 Skin Realism Block

Appended to every generation prompt:
```
SKIN REALISM (MANDATORY):
- Visible skin pores across nose, cheeks, forehead
- Subtle natural blemishes: micro-freckles, tiny moles, faint redness
- Fine vellus hair visible on face contour when backlit
- Natural oil/moisture sheen on T-zone
- Faint undereye hollows
- Slight redness around nostrils and lip corners
- Visible individual eyebrow hairs
- NO porcelain/plastic/airbrushed skin appearance
```

### 23.3 Post-Processing Filters

| Filter | Implementation | Intensity |
|--------|---------------|-----------|
| Film grain | FFmpeg `noise=alls=3:allf=t+u` | 2-4% |
| Vignette | Gradual edge darkening | 5-10% |
| Micro shake | Random sub-pixel jitter | 1-2px |
| Chromatic aberration | RGB channel offset at edges | Subtle |
| Lens distortion | Barrel distortion filter | 0.5-1% |

---

## 24. Configuration & Environment

### 24.1 Backend Settings (`backend/app/config/settings.py`)

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection |
| `GEMINI_API_KEY` | `None` | Google Gemini API key |
| `GCS_BUCKET` | `ugcgen-assets` | GCS bucket name |
| `GCS_PROJECT_ID` | `ugcgen-project` | GCP project ID |
| `GCS_CREDENTIALS_PATH` | `None` | Path to GCP service account JSON |
| `CONSISTENCY_MODEL` | `gemini-2.5-flash` | Model for consistency scoring |
| `CONSISTENCY_THRESHOLD` | `0.75` | Minimum similarity score |
| `CONSISTENCY_FRAME_SAMPLE_RATE` | `1` | Frames per second to sample |
| `LOCAL_STORAGE_ROOT` | `frontend/public/uploads` | Local file storage path |
| `CELERY_BROKER_URL` | `redis://localhost:6379/1` | Celery broker |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/2` | Celery results |
| `APP_VERSION` | `0.1.0` | Application version |
| `DEBUG` | `false` | Debug mode |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend base URL |

### 24.2 Frontend Environment

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | JWT signing secret |
| `NEXTAUTH_URL` | NextAuth base URL |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `BACKEND_URL` | Backend API base URL |
| `API_KEY_ENCRYPTION_SECRET` | 32-byte hex key for API key encryption |

---

## 25. Infrastructure

### 25.1 Docker Compose

```yaml
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: ugcgen
      POSTGRES_USER: ugcgen
      POSTGRES_PASSWORD: ugcgen_password
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

### 25.2 Local Development

```bash
# Start infrastructure
docker compose up -d

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npx prisma db push
npx prisma generate
npm run dev
```

---

## 26. Deployment Guide

### 26.1 Prerequisites

- PostgreSQL 16+
- Redis 7+
- Python 3.12+
- Node.js 20+
- FFmpeg 7.x
- Google Cloud account with Gemini API access

### 26.2 Environment Setup

1. Copy `.env.example` to `.env` in both `backend/` and `frontend/`
2. Set `GEMINI_API_KEY` (required for all AI features)
3. Set `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
4. Set Google OAuth credentials if using Google login
5. Optionally set GCS credentials for cloud storage

### 26.3 Database Initialization

```bash
cd frontend
npx prisma db push     # Create tables
npx prisma generate    # Generate Prisma client
```

### 26.4 Verification

```bash
# Backend health
curl http://localhost:8000/health
# Expected: {"status":"ok","version":"0.1.0"}

# Frontend
curl http://localhost:3000
# Expected: 200 OK (or 307 redirect to /login)

# TypeScript
cd frontend && npx tsc --noEmit
# Expected: 0 errors
```

---

## 27. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Character identity drift | HIGH | 6-layer consistency + auto-regeneration + reference images |
| Veo 3.1 extension limited to 720p | MEDIUM | Use extension for draft, generate final at 1080p/4K individually |
| 148s extension limit | MEDIUM | Break into scenes, extend within each, stitch between |
| API rate limits / cost | MEDIUM | Multi-key pool rotation + fallback models + fast drafts |
| AI detection by platforms | LOW | Ultra-realism post-processing + metadata injection |
| Color inconsistency | MEDIUM | LUT standardization + histogram matching |
| Veo videos expire after 2 days | LOW | Download immediately after generation |
| Product appearance drift | MEDIUM | Product DNA + reference images + prohibited variations |
| Lip sync quality | MEDIUM | Prefer Veo 3.1 native audio; minimize visible speaking faces |
| Intent detection false positives | LOW | Strict exact matching + 5s timeout fallback to CHAT |

---

## 28. Roadmap

### Completed (Current State)

- [x] Full-stack application (FastAPI + Next.js 16)
- [x] 10-step pipeline orchestrator with resumability
- [x] AI copilot chat with SSE streaming
- [x] Character DNA extraction and management
- [x] Product DNA extraction
- [x] Production Bible assembly
- [x] 6-step Mass Generator wizard
- [x] Timeline-based video editor
- [x] Avatar management with angle validation
- [x] Library with job history
- [x] Real-time progress tracking (Redis + SSE + webhooks)
- [x] Multi-layer consistency enforcement
- [x] Script editing with selective regeneration
- [x] Chat stabilization (10 UX fixes)
- [x] Authentication (Google OAuth + credentials)
- [x] API key management with encryption

### Next Phase — API Integration

- [ ] Connect Imagen 4 Ultra API for real storyboard generation
- [ ] Connect Veo 3.1 API for real video generation
- [ ] Connect Gemini TTS for real voiceover generation
- [ ] Implement actual FFmpeg compilation pipeline
- [ ] Set up Google Cloud Storage for production media
- [ ] Add Celery workers for background job processing
- [ ] Implement rate limiting and usage quotas

### Future Phase — Scale & Polish

- [ ] Multi-character scenes with separate DNA ingredients
- [ ] Voice cloning (with consent)
- [ ] A/B testing of video variants
- [ ] Analytics dashboard with cost tracking
- [ ] Batch generation with cost estimation
- [ ] LoRA training for open-source model fallback
- [ ] Multi-language support with dubbing
- [ ] Webhooks for third-party integration

---

## Appendix A: Pydantic Models (Backend)

### Enums

| Enum | Values |
|------|--------|
| `SceneType` | intro, hook, problem, solution, demonstration, unboxing, application, testimonial, cta |
| `ProductVisibility` | primary, secondary, background, none |
| `BackgroundSetting` | modern_bedroom, kitchen, office, car, outdoor, custom |
| `Platform` | instagram_reels, tiktok, youtube_shorts, general |
| `ReferenceAngle` | front, left_profile, right_profile, back, three_quarter_left, three_quarter_right |

### Core Models

| Model | Key Fields |
|-------|-----------|
| `CameraSetup` | body, lens, shot_type, angle, movement, focus |
| `LightingSetup` | type, direction, color_temp, intensity, key_intensity, fill_intensity, rim |
| `ScriptScene` | scene_number, scene_type, duration_seconds, dialogue, action, expression, camera, lighting, product_visibility, product_action, audio_notes |
| `Script` | title, total_duration, scenes[], audio_direction |
| `StoryboardFrame` | scene_number, variants[] (up to 4), consistency_score |
| `VideoScene` | scene_number, video_url, first_frame_url, last_frame_url, consistency_score |
| `AvatarDNA` | face, skin, eyes, hair, body, voice, wardrobe, prohibited_drift |
| `GenerationRequest` | prompt, avatar_dna, product_name, product_images, background, platform, max_scene_duration, words_per_minute |

---

## Appendix B: TypeScript Types (Frontend)

### Generation Types (`types/generation.ts`)

| Type | Values |
|------|--------|
| `GenerationMode` | ingredients, text, image, extend |
| `ScriptModel` | gemini-2.5-pro, gemini-2.5-flash |
| `StoryboardModel` | nano-banana-pro, nano-banana-flash |
| `VideoModel` | veo-3.1, veo-3.1-fast, veo-2 |
| `TTSModel` | gemini-tts, google-cloud-tts |
| `VideoStyle` | testimonial, product-showcase, brand-story, social-reel, comparison-review |
| `Platform` | instagram-reels, tiktok, youtube-shorts, youtube, custom |
| `ShotType` | close-up, medium, wide, extreme-close-up, over-shoulder |
| `CameraAngle` | eye-level, low-angle, high-angle, dutch-angle, birds-eye |
| `CameraMovement` | static, pan-left/right, tilt-up/down, dolly-in/out, tracking, handheld |

### Editor Types (`types/editor.ts`)

| Type | Description |
|------|-------------|
| `TimelineClip` | id, sceneNumber, clipNumber, videoUrl, duration, trimStart, trimEnd, order, crop |
| `TransitionKind` | 12+ types (fade, crossfade, slide-*, wipe-*, zoom-*, dissolve) |
| `AudioClip` | id, type, url, duration, volume, startTime, fadeIn, fadeOut |
| `Caption` | id, text, startTime, endTime, sceneNumber |
| `CaptionStyle` | font, size, color, bg, position, animation, outline |
| `ExportSettings` | resolution (720p/1080p/4K), format (mp4/webm), quality (draft/standard/high) |

### Mass Generator Types (`types/mass-generator.ts`)

| Type | Description |
|------|-------------|
| `ProductDNA` | product_type, colors, shape, materials, texture, branding_text, distinctive_features |
| `CreativeBrief` | hook_strategy, pain_point, key_selling_points, emotional_journey, cta_approach |
| `ProductionBible` | product_dna + avatar_dna + style_config + creative_brief + camera + lighting + realism |
| `Scene` | scene_number, scene_type, duration, dialogue, action, camera, lighting, audio_notes |

---

## Appendix C: File Counts

| Category | Count |
|----------|-------|
| Backend Services | 11 |
| Backend Agents | 8 |
| Backend Routers | 9 |
| Frontend API Routes | 32+ |
| Frontend Pages | 13 |
| React Components | 50+ |
| Zustand Stores | 3 |
| Type Definition Files | 3 |
| Database Models | 10 |
| Pipeline Steps | 10 |
| **Total Lines of Code** | **~25,000+** |
