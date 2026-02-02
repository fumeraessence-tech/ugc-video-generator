# UGC Video Generator - Product Requirements Document (PRD)

**Project Name:** UGC Video Generator (UGCGen)
**Version:** 1.0
**Last Updated:** 2026-02-02
**Author:** Narayan Vaish

---

## 1. Executive Summary

UGCGen is an AI-powered platform that generates ultra-realistic User-Generated Content (UGC) style videos end-to-end. The system orchestrates multiple AI agents — script writing, storyboard generation, character DNA management, video generation, voiceover synthesis, and post-production — into a seamless pipeline that produces professional-quality UGC videos indistinguishable from real human-recorded content.

**Core Differentiators:**
- Multi-model architecture with fallback API pools
- Character DNA system ensuring identity consistency across all scenes
- Character DNA Extractor for user-uploaded avatar images
- Automated scene continuity pipeline bridging Flow's 8-second clip limitation
- Ultra-realistic output with deliberate skin imperfections, natural lighting artifacts, and anti-AI-detection measures
- Audio-video sync engine with voiceover alignment

---

## 2. Problem Statement

Creating consistent, high-quality UGC videos with AI is currently fragmented and manual:
- Character appearance drifts across clips (different face shapes, skin tones, accessories)
- 8-second video generation limits require manual stitching with visible seams
- No unified pipeline connecting script → storyboard → video → audio → final output
- Color, lighting, and camera continuity breaks between AI-generated scenes
- AI-generated content exhibits tells (plastic skin, perfect symmetry, uniform teeth) that make it look artificial

---

## 3. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      UGCGen Platform                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐   ┌──────────────┐   ┌───────────────────┐   │
│  │ Script    │──▶│ Scene Prompt │──▶│ Storyboard Gen    │   │
│  │ Agent     │   │ Agent        │   │ (Imagen 3 / Nano  │   │
│  │ (Gemini)  │   │ (Gemini)     │   │  Banana)          │   │
│  └──────────┘   └──────────────┘   └─────────┬─────────┘   │
│                                               │              │
│  ┌──────────────────────────────────────────┐ │              │
│  │         Character DNA Registry           │◀┘              │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐  │               │
│  │  │Avatar 1 │ │Avatar 2 │ │Avatar N  │  │               │
│  │  │7-panel  │ │7-panel  │ │7-panel   │  │               │
│  │  │ref sheet│ │ref sheet│ │ref sheet │  │               │
│  │  │+ DNA    │ │+ DNA    │ │+ DNA     │  │               │
│  │  └─────────┘ └─────────┘ └──────────┘  │               │
│  └──────────────────────┬───────────────────┘               │
│                         │                                    │
│  ┌──────────────────────▼───────────────────┐               │
│  │         Video Generation Engine           │               │
│  │  ┌──────┐  ┌──────┐  ┌──────┐           │               │
│  │  │Flow  │  │Veo 3 │  │Veo 2 │  ...      │               │
│  │  │(pri) │  │(sec) │  │(fall)│           │               │
│  │  └──────┘  └──────┘  └──────┘           │               │
│  │  + Ingredient injection                   │               │
│  │  + Last-frame chaining                    │               │
│  │  + Multi-candidate selection              │               │
│  └──────────────────────┬───────────────────┘               │
│                         │                                    │
│  ┌──────────────────────▼───────────────────┐               │
│  │          Audio Generation Engine          │               │
│  │  Gemini TTS / Google Cloud TTS            │               │
│  │  + Voiceover per scene                    │               │
│  │  + Background music mixing                │               │
│  └──────────────────────┬───────────────────┘               │
│                         │                                    │
│  ┌──────────────────────▼───────────────────┐               │
│  │       Post-Production Pipeline            │               │
│  │  FFmpeg + MoviePy                         │               │
│  │  + Clip stitching with xfade transitions  │               │
│  │  + Color grading (LUT + histogram match)  │               │
│  │  + Audio-video sync & J/L cuts            │               │
│  │  + Text overlays & captions               │               │
│  │  + Film grain & realism filters           │               │
│  │  + Lip sync (Wav2Lip/SadTalker fallback)  │               │
│  └──────────────────────┬───────────────────┘               │
│                         │                                    │
│                    [Final Video Output]                       │
│              1080p / 4K, 9:16 or 16:9                        │
│         Multiple video outcome selections                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Core Modules

### 4.1 Script Generation Agent

**Model:** Gemini 2.5 Pro (primary) / Gemini 2.5 Flash (fallback)

**Responsibilities:**
- Generate video scripts based on user input (brand brief, product info, target audience, tone)
- Break scripts into scene-by-scene segments, each ~8 seconds of spoken content
- Generate per-scene metadata: dialogue/narration text, emotional tone, camera direction, pacing notes
- Generate audio narration prompt for TTS voiceover styling

**Input:**
```json
{
  "brand_brief": "Perfume brand targeting Gen-Z women",
  "product_details": "100ml glass bottle, rose gold cap, notes: blackcurrant, rose, vanilla",
  "tone": "authentic, relatable, aspirational",
  "video_style": "UGC testimonial / unboxing",
  "duration_target": "30-60 seconds",
  "platform": "Instagram Reels / TikTok",
  "avatar_id": "ARIA_28_F_INDIAN_PERFUME_MODEL",
  "language": "English"
}
```

**Output:**
```json
{
  "title": "Perfume UGC - Blackcurrant Rose",
  "total_duration_estimate": 40,
  "scenes": [
    {
      "scene_number": 1,
      "duration_seconds": 8,
      "dialogue": "Okay so I finally got my hands on this and I need to talk about it.",
      "narration_prompt": "Warm, excited, slightly breathless, authentic unboxing energy",
      "emotional_tone": "excitement, anticipation",
      "camera_direction": "Medium shot, slight angle, natural handheld sway",
      "scene_type": "product_reveal",
      "props": ["perfume_bottle", "shipping_box"],
      "setting": "bedroom vanity, natural daylight"
    }
  ],
  "audio_style_prompt": "Natural conversational female voice, warm and relatable, slight Indian-English accent, no dramatic delivery"
}
```

**Structured Output:** Uses Gemini's `responseMimeType: "application/json"` with `responseSchema` to enforce the scene breakdown format consistently.

---

### 4.2 Scene Prompt Generation Agent

**Model:** Gemini 2.5 Pro

**Responsibilities:**
- Convert script scenes into detailed image prompts for storyboarding (Imagen 3)
- Convert script scenes into detailed video prompts for video generation (Flow/Veo)
- Inject Character DNA into every prompt automatically
- Inject master prompt template elements for consistency
- Generate negative prompts to prevent common AI artifacts

**Master Prompt Template Structure:**
Each scene prompt is assembled from these layers:

```
[REALISM_HEADER]           → Ultra-realistic UGC, shot on iPhone 17 Pro Max...
[CHARACTER_DNA_BLOCK]      → Full character appearance description (auto-injected)
[SCENE_SPECIFIC_BLOCK]     → This scene's unique action, expression, dialogue
[ENVIRONMENT_BLOCK]        → Setting, lighting, props, background
[CAMERA_BLOCK]             → Shot type, angle, movement, DOF
[SKIN_REALISM_BLOCK]       → Pores, blemishes, texture, natural sheen
[AUDIO_DESCRIPTION_BLOCK]  → Dialogue delivery, ambient sound
[CONSISTENCY_LOCK_BLOCK]   → LOCKED attributes that must not change
[NEGATIVE_PROMPT_BLOCK]    → What to avoid: AI plastic skin, wrong eye color, etc.
```

**Output per scene:**
- `storyboard_prompt` → For Imagen 3 (static frame)
- `video_prompt` → For Flow/Veo (animated scene)
- `negative_prompt` → Universal negative prompt
- `ingredient_references` → Which character DNA images to inject as Flow ingredients

---

### 4.3 Character DNA System

This is the centerpiece of consistency. Each avatar is defined by a comprehensive Character DNA profile.

#### 4.3.1 Character DNA Structure

```json
{
  "avatar_id": "ARIA_28_F_INDIAN_PERFUME_MODEL",
  "name": "Aria Sharma",
  "tag": "ARIA_28_F_INDIAN_PERFUME_MODEL",

  "face_structure": {
    "age": 28,
    "ethnicity": "South Asian (North Indian with subtle Mediterranean influence)",
    "face_shape": "Oval with soft, balanced proportions",
    "cheekbones": "High, defined with subtle natural contour",
    "chin": "Refined, slightly pointed, elegant V-line",
    "jawline": "Soft, feminine but defined",
    "nose": "Straight bridge, refined tip, medium width nostrils",
    "lips": "Medium-full, slight natural pink undertone, upper lip slightly thinner",
    "distinguishing_marks": ["Small beauty mark on right side of face, near jawline"]
  },

  "skin": {
    "base_tone": "Warm honey-brown with golden undertones (Fitzpatrick Type IV)",
    "texture": "Natural with visible pores on nose and inner cheeks",
    "imperfections": [
      "Light natural freckling across nose bridge and upper cheeks",
      "Minimal fine lines at outer eye corners",
      "Slight natural redness on cheeks and nose tip",
      "Visible skin on neck shows subtle horizontal lines"
    ],
    "finish": "Natural luminosity, NOT oily NOT matte",
    "realism_notes": "Real human skin imperfections present but minimal. NO heavy makeup texture."
  },

  "eyes": {
    "shape": "Almond-shaped with subtle upward tilt at outer corners",
    "iris_color": "Deep amber-brown with golden flecks near pupil",
    "iris_color_lock": "NEVER CHANGES",
    "eyebrows": "Thick, naturally full, dark brown, soft arch",
    "eyelashes": "Full, dark, naturally enhanced look, longer at outer corners"
  },

  "hair": {
    "color": "Rich dark brown with subtle natural auburn highlights in sunlight",
    "texture": "Wavy, Type 2B waves with soft S-pattern",
    "length": "Long, reaching mid-back (22-24 inches)",
    "styling": "Soft center part, slightly off-center, natural flyaways present",
    "realism_notes": "Subtle natural frizz at hairline and nape, healthy shine without greasy look"
  },

  "body": {
    "height": "5'6\" (167 cm)",
    "build": "Slim with soft, natural feminine curves",
    "posture": "Confident, relaxed, naturally upright",
    "hands": "Feminine, medium-length fingers, natural nail beds, visible veins"
  },

  "voice": {
    "tone": "Warm, medium-pitch, slightly husky undertones",
    "pace": "Natural, conversational (120-140 wpm)",
    "accent": "Neutral Indian-English with soft, modern inflection",
    "style": "Authentic, relatable, no dramatic delivery"
  },

  "wardrobe_default": {
    "style": "Elegant casual - silk blouse or soft knit, blush pink or warm cream",
    "neckline": "V-neck or soft scoop showing collarbones",
    "jewelry": "Minimal - small gold hoop earrings, delicate chain necklace",
    "restrictions": "NO logos, NO brand names, NO excessive accessories"
  },

  "prohibited_drift": [
    "Eye color change → ALWAYS amber-brown with golden flecks",
    "Skin tone change → ALWAYS warm honey-brown",
    "Hair color change → ALWAYS dark brown with auburn hints",
    "Hair length change → ALWAYS mid-back length",
    "Face shape change → ALWAYS oval with high cheekbones",
    "Beauty mark disappearing → ALWAYS present on right jawline",
    "NO glasses, NO dramatic makeup changes, NO tattoos"
  ],

  "consistency_tags": "Natural South Asian beauty, soft neutral tones, glowing skin texture, wavy dark brown hair, warm amber-brown eyes, elegant oval face, subtle freckles, minimal makeup glow, timeless feminine grace",

  "reference_sheet": {
    "front_full_body": "path/to/front_full.png",
    "left_profile_full_body": "path/to/left_full.png",
    "right_profile_full_body": "path/to/right_full.png",
    "back_full_body": "path/to/back_full.png",
    "front_portrait": "path/to/front_portrait.png",
    "left_profile_portrait": "path/to/left_portrait.png",
    "right_profile_portrait": "path/to/right_portrait.png",
    "composite_sheet": "path/to/composite_7panel.png"
  }
}
```

#### 4.3.2 Character Reference Sheet Generation

**Model:** Imagen 3 (Nano Banana)

The system generates a standardized 7-panel reference sheet for each avatar:

**Layout:**
```
Top Row:    [Front Full] [Left Profile Full] [Right Profile Full] [Back Full]
Bottom Row: [Front Portrait] [Left Profile Portrait] [Right Profile Portrait]
```

**Reference Sheet Generation Prompt Template:**
```
Create a professional character reference sheet, adhering strictly to
the following character description. Use a clean, plain neutral background
and present the layout as a technical model turnaround, ultra-realistic
rendering with natural textures, colour palette, shading treatment.

Layout: two horizontal rows with clean, even spacing and clear panel separation.

Top row: four full-body standing views, side-by-side:
1. Front view  2. Left profile  3. Right profile  4. Back view

Bottom row: three highly detailed close-up portraits:
1. Front portrait  2. Left profile portrait  3. Right profile portrait

Consistency requirements: maintain perfect identity consistency across every
panel. Keep the subject in a relaxed A-pose, consistent scale, alignment and
proportions. Ensure accurate anatomy, clear silhouette, uniform framing.

Lighting: identical across all panels (same direction, intensity, softness),
natural controlled shadows that preserve detail.

Output: crisp, sharp, print-ready reference sheet.

CHARACTER DESCRIPTION:
{CHARACTER_DNA_BLOCK}
```

**Seed Strategy:** Use a fixed seed per character for reproducibility. Store the seed in the Character DNA record.

#### 4.3.3 Character DNA Extractor

**Purpose:** Users upload their own avatar photos, and the system extracts a Character DNA profile automatically.

**Pipeline:**
1. **Image Analysis (Gemini Vision):** Analyze uploaded images (3-10 photos from multiple angles)
2. **Feature Extraction:** Extract face shape, skin tone (Fitzpatrick scale), eye color, hair details, distinguishing marks, body proportions
3. **DNA Generation:** Produce a structured Character DNA JSON matching the schema above
4. **Reference Sheet Generation:** Generate the 7-panel reference sheet from the extracted DNA
5. **Validation:** Display the generated reference sheet to the user for approval/adjustment

**Extraction Prompt Template:**
```
Analyze the following {N} reference images of a person. Extract an extremely
detailed character description covering:

1. Face structure (shape, cheekbones, chin, jawline, nose, lips)
2. Skin (exact tone using Fitzpatrick scale, texture, imperfections,
   freckles, moles, scars)
3. Eyes (shape, exact iris color, eyebrow details, eyelashes)
4. Hair (color with highlights/lowlights, texture type, length,
   styling tendencies)
5. Body (approximate height, build, posture, hand details)
6. Distinguishing marks (beauty marks, birthmarks, dimples,
   asymmetries)
7. Age estimate
8. Ethnicity/heritage indicators

Be EXHAUSTIVE. Include every visible detail that contributes to this
person's unique identity. This description must be detailed enough to
recreate this person's appearance consistently across multiple AI
image/video generations.

Format output as a structured JSON matching the Character DNA schema.
```

---

### 4.4 Storyboard Generation (Imagen 3 / Nano Banana)

**Purpose:** Generate static frame previews for each scene before committing to expensive video generation.

**Model:** Imagen 3 (`imagen-3.0-generate-001`)

**Process:**
1. Take the `storyboard_prompt` from the Scene Prompt Agent
2. Inject Character DNA reference images via `subjectImageConfig` (Vertex AI)
3. Generate 2-4 candidates per scene
4. Score candidates for character consistency (face similarity to reference sheet)
5. Present best candidates for user selection or auto-select highest-scoring

**Consistency Enforcement:**
- Use `referenceType: "SUBJECT_REFERENCE"` with the character's front portrait as reference
- Use fixed seed + detailed prompt for reproducibility
- Include full `CONSISTENCY_LOCK_BLOCK` and `NEGATIVE_PROMPT_BLOCK`
- Compare generated storyboard face against reference sheet face using face embedding similarity (InsightFace/ArcFace cosine similarity > 0.75 threshold)

**Storyboard Scene Prompt Template:**
```
{REALISM_HEADER}

{CHARACTER_DNA_FULL_DESCRIPTION}

Scene {N} of {TOTAL}: {SCENE_DESCRIPTION}

Setting: {ENVIRONMENT_DESCRIPTION}
Camera: {CAMERA_ANGLE_AND_FRAMING}
Expression: {FACIAL_EXPRESSION_AND_BODY_LANGUAGE}
Lighting: {LIGHTING_DESCRIPTION}
Props: {PROPS_LIST}

LOCKED ATTRIBUTES (do not deviate):
{PROHIBITED_DRIFT_LIST}

Negative prompt: {NEGATIVE_PROMPT}

Style: Ultra-realistic photograph, natural skin texture with visible pores
and micro-imperfections, shot on iPhone 17 Pro Max, natural lighting,
{ASPECT_RATIO} format.
```

---

### 4.5 Video Generation Engine

**Primary Model:** Google Flow (via ingredients system)
**Secondary Models:** Veo 3, Veo 2 (API-accessible fallbacks)
**Model Selection:** User can choose or system auto-selects based on scene complexity

#### 4.5.1 Flow Integration (Ingredients System)

Flow's Ingredients feature is the primary character consistency mechanism for video generation.

**Per-character ingredients to inject:**
1. Front portrait (from reference sheet)
2. 3/4 portrait (from reference sheet)
3. Side portrait (from reference sheet)
4. Full-body front (from reference sheet)
5. Approved storyboard frame for the current scene

**Video Prompt Assembly:**
```
{REALISM_HEADER}

[Ingredient 1 = character front portrait]
[Ingredient 2 = character 3/4 portrait]
[Ingredient 3 = approved storyboard frame for this scene]

{SCENE_VIDEO_PROMPT}

The woman shown in the ingredients ({CHARACTER_NAME}) performs the following
action: {ACTION_DESCRIPTION}

Camera: {CAMERA_MOVEMENT_DESCRIPTION}
Duration: 8 seconds
Aspect ratio: {ASPECT_RATIO}

CRITICAL CONSISTENCY: The character MUST match the uploaded ingredients exactly.
{PROHIBITED_DRIFT_AS_NEGATIVE_INSTRUCTIONS}

{NEGATIVE_PROMPT}
```

#### 4.5.2 Last-Frame Chaining for Scene Continuity

Since Flow/Veo generates 8-second clips, longer videos require stitching.

**Chaining Algorithm:**
```
FOR each scene S[i] where i > 0:
  1. Extract last frame of S[i-1]:
     ffmpeg -sseof -0.04 -i scene_{i-1}.mp4 -frames:v 1 last_frame_{i-1}.png

  2. Add last_frame_{i-1}.png as an additional ingredient for S[i]

  3. Prepend to S[i]'s prompt:
     "Continuing directly from the previous shot. The scene begins
      with the same composition as the reference frame..."

  4. Generate 3-4 candidates for S[i]

  5. Score each candidate:
     - SSIM between candidate's first frame and S[i-1]'s last frame (weight: 0.3)
     - Face embedding similarity to character DNA (weight: 0.4)
     - LPIPS perceptual similarity to storyboard (weight: 0.3)

  6. Select highest-scoring candidate
```

#### 4.5.3 Multi-Candidate Generation & Selection

For each scene, generate multiple video candidates and select the best:

**Selection Criteria:**
| Criterion | Weight | Measurement |
|-----------|--------|-------------|
| Character identity match | 40% | ArcFace cosine similarity to reference |
| Scene continuity | 30% | SSIM/LPIPS to previous clip's last frame |
| Prompt adherence | 20% | CLIP score between prompt and generated frame |
| Technical quality | 10% | Sharpness, no artifacts, stable motion |

#### 4.5.4 Multiple Video Outcome Selection

Users can select different output configurations:

| Output Type | Description |
|-------------|-------------|
| UGC Testimonial | Talking head + b-roll, 30-60s, 9:16 vertical |
| Product Showcase | Product-focused with model interaction, 15-30s |
| Story/Narrative | Multi-scene emotional narrative, 60-120s |
| Quick Reel | Fast-paced cuts, text overlays, 15s |
| Comparison/Review | Side-by-side, before/after, 30-60s |

---

### 4.6 Audio Generation Engine

#### 4.6.1 Voiceover Generation

**Primary:** Gemini TTS (`gemini-2.5-flash-preview-tts`)
**Fallback:** Google Cloud Text-to-Speech (Neural2/WaveNet voices)

**Process:**
1. Take per-scene dialogue text from Script Agent
2. Apply narration prompt styling (tone, pace, emotion)
3. Generate voiceover audio per scene
4. Generate full continuous voiceover (preferred for natural flow)
5. Segment the continuous voiceover at scene boundaries

**Audio Generation is FIRST in the pipeline** — video clips are generated to match audio timing, not the other way around.

**Voice Configuration per Avatar:**
```json
{
  "avatar_id": "ARIA_28_F_INDIAN_PERFUME_MODEL",
  "tts_config": {
    "model": "gemini-2.5-flash-preview-tts",
    "voice_name": "Kore",
    "language": "en-US",
    "speaking_rate": 1.0,
    "pitch": 0.0,
    "style_prompt": "Warm conversational female voice, authentic UGC feel, slight excitement, natural breath sounds between sentences"
  }
}
```

#### 4.6.2 Audio-Video Sync Strategy

```
1. Generate full voiceover audio → measure total duration
2. Segment audio into per-scene chunks at natural pause points
3. For each scene:
   a. Audio chunk duration = T seconds
   b. If T <= 8s: generate one 8-second video clip, trim to T
   c. If T > 8s: generate ceil(T/8) clips, chain them
   d. Apply slight speed adjustment (±10% max) via FFmpeg setpts
      to match video to audio duration exactly
4. Layer background music at 15-20% volume
5. Apply J-cuts: start next scene's audio 0.5s before video transition
6. Apply L-cuts: continue current scene's ambient audio 0.5s into next scene
```

#### 4.6.3 Lip Sync (When Showing Speaking Face)

**Approach:** Post-processing with dedicated lip-sync models

**Pipeline:**
1. Generate the video clip (mouth may not match audio)
2. If scene shows close-up of speaking face:
   - Apply **Wav2Lip** or **SadTalker** to re-render mouth region to match audio
3. If scene is medium/wide shot or subject isn't directly facing camera:
   - Skip lip sync (mismatch is imperceptible)

**Avoidance Strategy (Preferred):**
Design shots to minimize visible speaking faces:
- Use b-roll cutaways during voiceover
- Frame subject from chest up looking away
- Use text-on-screen over product shots
- Use J-cuts to hear audio before seeing the speaker

---

### 4.7 Post-Production Pipeline

**Tools:** FFmpeg (core), MoviePy (Python wrapper), custom pipeline orchestrator

#### 4.7.1 Clip Stitching

```bash
# Crossfade transitions between clips
ffmpeg -i scene1.mp4 -i scene2.mp4 -i scene3.mp4 \
  -filter_complex \
  "[0:v][1:v]xfade=transition=fade:duration=0.8:offset=7.2[v01]; \
   [v01][2:v]xfade=transition=fade:duration=0.8:offset=14.4[outv]" \
  -map "[outv]" stitched_video.mp4
```

**Transition types by scene context:**
| Scene Transition | Transition Type | Duration |
|-----------------|-----------------|----------|
| Same character, same setting | Hard cut or 0.3s dissolve | 0.3s |
| Same character, different setting | 0.8s crossfade | 0.8s |
| Different angle of same action | Match cut (hard) | 0s |
| Emotional shift | 1.0s dissolve | 1.0s |
| Topic change | Dip to black | 0.5s |
| Energy increase | Whip pan / zoom punch | 0.2s |

#### 4.7.2 Color Grading Pipeline

```
1. Extract "hero frame" from Scene 1 (sets the visual baseline)
2. For each subsequent clip:
   a. Histogram-match to hero frame (OpenCV)
   b. Apply unified LUT (.cube file) for consistent color grade
   c. Fine-tune: brightness ±5%, contrast ±5%, saturation ±3%
3. Apply global film grain (FFmpeg noise filter, 2-4% intensity)
4. Apply subtle vignette (5-10% edge darkening)
```

#### 4.7.3 Ultra-Realism Post-Processing

To ensure output does NOT look AI-generated:

| Technique | Implementation |
|-----------|---------------|
| Film grain | FFmpeg `noise=alls=3:allf=t+u` |
| Subtle lens distortion | Barrel distortion filter, 0.5-1% |
| Chromatic aberration | Slight RGB channel offset at edges |
| Micro camera shake | Random sub-pixel position jitter |
| Depth of field | Selective blur on background elements |
| Compression artifacts | Re-encode at social media bitrates |
| Skin texture overlay | Composite pore/texture layer at 10-15% opacity |
| Natural vignetting | Gradual 5% edge darkening |
| Metadata injection | Realistic EXIF data (iPhone camera model, GPS, timestamp) |

#### 4.7.4 Final Render Settings

```json
{
  "video_codec": "H.265 (HEVC)",
  "video_bitrate": "8-12 Mbps",
  "audio_codec": "AAC",
  "audio_bitrate": "256 kbps",
  "audio_sample_rate": 48000,
  "resolution": "1080x1920 (9:16) or 1920x1080 (16:9)",
  "frame_rate": 30,
  "color_space": "BT.709",
  "container": "MP4"
}
```

---

## 5. API Pool Management

### 5.1 Multi-API Pool Architecture

Each API service has a pool of API keys that rotate for load balancing and fallback.

```json
{
  "api_pools": {
    "gemini_text": {
      "primary": [
        {"key": "GEMINI_KEY_1", "model": "gemini-2.5-pro", "rpm_limit": 60, "status": "active"},
        {"key": "GEMINI_KEY_2", "model": "gemini-2.5-pro", "rpm_limit": 60, "status": "active"}
      ],
      "fallback": [
        {"key": "GEMINI_KEY_3", "model": "gemini-2.5-flash", "rpm_limit": 120, "status": "active"}
      ]
    },
    "imagen": {
      "primary": [
        {"key": "IMAGEN_KEY_1", "model": "imagen-3.0-generate-001", "rpm_limit": 30, "status": "active"}
      ],
      "fallback": [
        {"key": "IMAGEN_KEY_2", "model": "imagen-3.0-fast-generate-001", "rpm_limit": 60, "status": "active"}
      ]
    },
    "video_gen": {
      "primary": [
        {"key": "FLOW_KEY_1", "model": "flow", "rpm_limit": 10, "status": "active"}
      ],
      "fallback": [
        {"key": "VEO_KEY_1", "model": "veo-3", "rpm_limit": 10, "status": "active"},
        {"key": "VEO_KEY_2", "model": "veo-2", "rpm_limit": 10, "status": "active"}
      ]
    },
    "tts": {
      "primary": [
        {"key": "TTS_KEY_1", "model": "gemini-2.5-flash-preview-tts", "rpm_limit": 60, "status": "active"}
      ],
      "fallback": [
        {"key": "CLOUD_TTS_KEY_1", "model": "google-cloud-tts-neural2", "rpm_limit": 100, "status": "active"}
      ]
    }
  }
}
```

### 5.2 Failover Logic

```
1. Try primary pool (round-robin across active keys)
2. On failure (429/500/503):
   a. Mark key as "cooldown" for 60s
   b. Try next key in primary pool
   c. If all primary keys exhausted → switch to fallback pool
3. On fallback failure:
   a. Queue the request for retry after 120s
   b. Notify user of delay
4. Track per-key usage metrics for rate limit optimization
```

---

## 6. Character Consistency Enforcement Pipeline

This is the most critical system in the entire platform. Character inconsistency is the #1 quality issue in AI video generation.

### 6.1 Multi-Layer Consistency Strategy

```
Layer 1: CHARACTER DNA PROMPT INJECTION
  → Every single prompt includes the full character DNA description
  → Prohibited drift list included as negative instructions
  → Consistency tags appended to every prompt

Layer 2: VISUAL REFERENCE INJECTION
  → Flow ingredients: 3-5 reference images per character per scene
  → Veo: Reference image passed as input image
  → Imagen: subjectImageConfig with reference portrait

Layer 3: STORYBOARD VALIDATION
  → Generated storyboard frames are compared to reference sheet
  → ArcFace cosine similarity must be > 0.75
  → Scenes below threshold are regenerated (up to 3 retries)

Layer 4: VIDEO FRAME VALIDATION
  → Sample frames (1/sec) from generated video clips
  → Each sampled frame is compared to character reference
  → If any frame drops below 0.65 similarity → flag for regeneration

Layer 5: CROSS-SCENE CONSISTENCY CHECK
  → Compare character appearance across all scenes
  → Standard deviation of face similarity scores must be < 0.1
  → Outlier scenes are regenerated

Layer 6: POST-PROCESSING CORRECTION
  → If mild inconsistency detected: apply face-swap (FaceFusion)
    to correct the drifted frames
  → Last resort: regenerate the scene entirely
```

### 6.2 Character Consistency Scoring

**Face Similarity Pipeline:**
```python
# Per-frame character validation
def validate_character_consistency(frame, character_dna):
    # 1. Detect face in frame
    face = insightface.detect(frame)

    # 2. Extract face embedding
    embedding = arcface.get_embedding(face)

    # 3. Compare to character DNA reference embedding
    reference_embedding = character_dna.reference_embeddings["front_portrait"]

    # 4. Compute cosine similarity
    similarity = cosine_similarity(embedding, reference_embedding)

    # 5. Check against thresholds
    if similarity >= 0.80:  return "excellent"
    if similarity >= 0.70:  return "acceptable"
    if similarity >= 0.60:  return "marginal - consider regeneration"
    return "failed - must regenerate"
```

### 6.3 Strict Consistency Prompts

Every video generation prompt includes these mandatory blocks:

**IDENTITY LOCK BLOCK:**
```
CRITICAL IDENTITY REQUIREMENTS (VIOLATION = REJECT):
- Character: {CHARACTER_TAG}
- Eye color MUST be {EYE_COLOR} — any other color is WRONG
- Skin tone MUST be {SKIN_TONE} — no lighter, no darker
- Hair MUST be {HAIR_DESCRIPTION} — same color, length, texture
- Beauty mark MUST be visible at {MARK_LOCATION}
- Jewelry: {JEWELRY_DESCRIPTION} — exactly as specified
- Body type: {BODY_TYPE} — no changes
- Age appearance: {AGE} years — no younger, no older

ABSOLUTELY PROHIBITED:
- Different eye color than {EYE_COLOR}
- Glasses or eyewear of any kind
- Different hairstyle or hair color
- Missing distinguishing marks
- Different body type or proportions
- Tattoos, piercings, or modifications not in DNA
- Clean-shaven (if beard specified) or facial hair changes
```

---

## 7. Pipeline Orchestration

### 7.1 End-to-End Pipeline Flow

```
Step 1: INPUT COLLECTION
  User provides: brand brief, product details, avatar selection,
  video style, duration, platform

Step 2: SCRIPT GENERATION [Script Agent → Gemini 2.5 Pro]
  Input: user brief + avatar DNA context
  Output: structured scene breakdown with dialogue and directions

Step 3: AUDIO GENERATION (FIRST) [Audio Engine → Gemini TTS]
  Input: full script dialogue + narration styling
  Output: per-scene audio clips + full continuous voiceover
  → Measure per-scene audio durations

Step 4: SCENE PROMPT GENERATION [Scene Prompt Agent → Gemini 2.5 Pro]
  Input: script scenes + character DNA + master template
  Output: per-scene storyboard prompts + video prompts

Step 5: STORYBOARD GENERATION [Imagen 3]
  Input: storyboard prompts + character reference images
  Output: per-scene storyboard frames
  → Validate character consistency (ArcFace > 0.75)
  → User review / approval gate (optional)

Step 6: VIDEO GENERATION [Flow / Veo 3 / Veo 2]
  For each scene:
    a. Inject character DNA ingredients
    b. Inject approved storyboard frame as reference
    c. Inject last frame of previous scene (if not first scene)
    d. Generate 3 candidates
    e. Score and select best candidate
    f. Validate character consistency
  Output: per-scene video clips (8s each)

Step 7: LIP SYNC (if applicable) [Wav2Lip / SadTalker]
  Input: video clips with visible speaking faces + audio
  Output: lip-synced video clips

Step 8: POST-PRODUCTION [FFmpeg + MoviePy]
  a. Color normalize all clips (histogram matching to Scene 1)
  b. Apply LUT for unified color grade
  c. Stitch clips with appropriate transitions
  d. Sync audio track (voiceover + background music)
  e. Apply J-cuts and L-cuts at transitions
  f. Add text overlays / captions
  g. Apply realism filters (grain, vignette, micro-shake)
  h. Final render at target resolution and codec

Step 9: QUALITY CHECK
  a. Full video character consistency scan
  b. Audio-video sync verification
  c. Technical quality check (resolution, bitrate, no artifacts)
  d. Output confidence score

Step 10: DELIVERY
  Output: final video file + metadata + generation report
```

### 7.2 Agent Communication Protocol

All agents communicate via a shared state object (Job Context):

```json
{
  "job_id": "uuid-v4",
  "status": "processing",
  "current_step": "video_generation",
  "progress": 0.65,

  "input": { /* user's original input */ },
  "script": { /* Script Agent output */ },
  "audio": {
    "full_voiceover": "path/to/full_voiceover.wav",
    "per_scene": [
      {"scene": 1, "audio": "path/to/scene1.wav", "duration": 7.2}
    ]
  },
  "scene_prompts": [
    {"scene": 1, "storyboard_prompt": "...", "video_prompt": "...", "negative_prompt": "..."}
  ],
  "storyboards": [
    {"scene": 1, "image": "path/to/storyboard_1.png", "consistency_score": 0.82}
  ],
  "video_clips": [
    {"scene": 1, "video": "path/to/scene1.mp4", "consistency_score": 0.79, "continuity_score": 0.85}
  ],
  "character_dna": { /* full DNA object */ },
  "final_output": "path/to/final_video.mp4"
}
```

---

## 8. Video Continuity System (Solving the 8-Second Problem)

### 8.1 The Problem

Flow and Veo generate a maximum of 8 seconds per API call. A typical UGC video is 30-120 seconds, requiring 4-15 clips that must feel like one continuous recording.

### 8.2 Continuity Strategies

#### Strategy A: Last-Frame Chaining (Primary)
- Extract last frame of clip N → use as reference image for clip N+1
- Prompt clip N+1 to "continue directly from the previous moment"
- Generate multiple candidates and select by frame similarity

#### Strategy B: Overlapping Generation
- Generate clip N to end at a specific composition
- Generate clip N+1 to begin at a matching composition
- Create 0.5-1.0s overlap zone, crossfade through it

#### Strategy C: Strategic Scene Breaks
- Design the script with natural cut points every 8 seconds
- Use B-roll, text cards, or product shots between talking-head segments
- Each "break" resets visual continuity requirements

#### Strategy D: Camera Angle Alternation
- Alternate between 2-3 camera angles per scene
- Cuts between angles are natural in UGC content (jump cuts)
- Reduces the need for frame-perfect continuity

### 8.3 Continuity Scoring

```python
def score_continuity(clip_a, clip_b):
    last_frame_a = extract_last_frame(clip_a)
    first_frame_b = extract_first_frame(clip_b)

    # Structural similarity
    ssim = compute_ssim(last_frame_a, first_frame_b)

    # Perceptual similarity (learned metric)
    lpips = compute_lpips(last_frame_a, first_frame_b)

    # Color consistency
    color_diff = compute_color_histogram_distance(last_frame_a, first_frame_b)

    # Character consistency (if faces present)
    face_sim = compute_face_similarity(last_frame_a, first_frame_b)

    # Weighted score
    score = (ssim * 0.25) + ((1 - lpips) * 0.25) +
            ((1 - color_diff) * 0.20) + (face_sim * 0.30)

    return score  # 0.0 to 1.0
```

---

## 9. Ultra-Realism Requirements

### 9.1 Anti-AI-Detection Measures

The output must be indistinguishable from real iPhone-recorded UGC. This requires fighting against common AI generation artifacts:

| AI Tell | Countermeasure |
|---------|---------------|
| Plastic/smooth skin | Prompt for "visible pores, micro-imperfections, natural sebaceous activity, fine vellus hair" |
| Perfect facial symmetry | Include "natural facial asymmetry, one eyebrow slightly higher" in prompts |
| Uniform perfect teeth | Include "natural tooth variation, not perfectly white" |
| Over-saturated colors | Post-process: reduce saturation 5-10%, apply muted LUT |
| No camera imperfections | Add: film grain, chromatic aberration, micro lens distortion, vignette |
| Too stable footage | Add subtle micro camera shake (1-2px random jitter) |
| Missing motion blur | Ensure video generation prompt includes "natural motion blur on hand movements" |
| No compression artifacts | Re-encode at typical social media bitrates (H.265 @ 6-8 Mbps) |
| Missing EXIF metadata | Inject realistic metadata (iPhone model, location, timestamp) |
| Unnatural lighting | Prompt for "natural window light with subtle shadows, NOT studio lighting" |
| Spectral frequency anomalies | Apply noise + compression to shift frequency domain characteristics |

### 9.2 Skin Realism Prompt Block

Appended to EVERY generation prompt:

```
SKIN REALISM (MANDATORY):
- Visible skin pores across nose, cheeks, and forehead
- Subtle natural blemishes: micro-freckles, tiny moles, faint redness
- Fine vellus hair visible on face contour when backlit
- Natural oil/moisture sheen on T-zone (forehead, nose, chin)
- Faint undereye hollows showing natural fatigue/age
- Slight redness around nostrils and lip corners
- Visible individual eyebrow hairs, not painted-on brows
- Skin catching light naturally with organic variation in tone
- NO porcelain/plastic/airbrushed skin appearance
- NO unnaturally smooth skin texture
- NO uniformly colored skin without variation
```

---

## 10. Tech Stack

### 10.1 Backend

| Component | Technology |
|-----------|-----------|
| Language | Python 3.12+ |
| Framework | FastAPI |
| Task Queue | Celery + Redis |
| Storage | Google Cloud Storage (GCS) |
| Database | PostgreSQL (job state, avatar registry, API pool config) |
| Video Processing | FFmpeg 7.x + MoviePy |
| Face Analysis | InsightFace (ArcFace embeddings) |
| Lip Sync | Wav2Lip / SadTalker |
| AI Models | Google Generative AI SDK (`google-genai`) |

### 10.2 AI Model Stack

| Function | Primary Model | Fallback Model |
|----------|--------------|----------------|
| Script Generation | Gemini 2.5 Pro | Gemini 2.5 Flash |
| Scene Prompts | Gemini 2.5 Pro | Gemini 2.5 Flash |
| Storyboard Images | Imagen 3 Standard | Imagen 3 Fast |
| Video Generation | Flow (ingredients) | Veo 3 → Veo 2 |
| Voiceover TTS | Gemini TTS | Google Cloud TTS Neural2 |
| Character DNA Extract | Gemini 2.5 Pro Vision | Gemini 2.5 Flash Vision |
| Lip Sync | Wav2Lip | SadTalker |

### 10.3 Frontend (Phase 2)

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 15 |
| UI | Tailwind CSS + Shadcn/ui |
| State | Zustand |
| Video Preview | Video.js |
| Deployment | Vercel |

---

## 11. Data Models

### 11.1 Avatar

```sql
CREATE TABLE avatars (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    tag VARCHAR(100) UNIQUE NOT NULL,  -- e.g., ARIA_28_F_INDIAN_PERFUME_MODEL
    character_dna JSONB NOT NULL,
    reference_sheet_url TEXT,
    reference_embeddings JSONB,  -- ArcFace embeddings per angle
    seed INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 11.2 Job

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    avatar_id UUID REFERENCES avatars(id),
    status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed
    input_config JSONB NOT NULL,
    script JSONB,
    scene_prompts JSONB,
    storyboards JSONB,
    video_clips JSONB,
    audio_tracks JSONB,
    final_output_url TEXT,
    quality_scores JSONB,
    total_api_cost DECIMAL(10,4),
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);
```

### 11.3 API Pool

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    service VARCHAR(50) NOT NULL,  -- gemini_text, imagen, video_gen, tts
    model VARCHAR(100) NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    pool_type VARCHAR(10) DEFAULT 'primary',  -- primary, fallback
    rpm_limit INTEGER DEFAULT 60,
    daily_limit INTEGER,
    current_usage INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',  -- active, cooldown, exhausted, disabled
    cooldown_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 12. Example Character DNAs (Pre-built Avatars)

### 12.1 Aria Sharma (Perfume Brand Muse)
- **Tag:** `ARIA_28_F_INDIAN_PERFUME_MODEL`
- **Use case:** Beauty, perfume, skincare, lifestyle UGC
- **Full DNA:** See Section 4.3.1 above

### 12.2 Rameshwar Singh (Documentary Subject)
- **Tag:** `RAMESHWAR_75_M_CANCER_PATIENT_INDIAN`
- **Use case:** Healthcare, documentary, emotional storytelling
- **Key features:** 75yo male, weathered skin, salt-and-pepper beard, prayer beads, traditional kurta
- **Locked attributes:** Blue-gray cap with maroon embroidery, green/white prayer beads, no glasses, no modern accessories

### 12.3 Brand Muse (European Perfume Model)
- **Tag:** `BRAND_MUSE_F_EUROPEAN_PERFUME`
- **Use case:** Luxury perfume, high-end beauty
- **Key features:** Light neutral-beige complexion, blue-grey eyes with green rim, chestnut brown curly hair, freckles
- **Locked attributes:** Calm serene expression, minimal makeup, semi-dewy skin finish

---

## 13. Research References

### Character Consistency Papers
1. Ye et al., "IP-Adapter: Text Compatible Image Prompt Adapter" (2023) — decoupled cross-attention for image conditioning
2. Wang et al., "InstantID: Zero-shot Identity-Preserving Generation" (2024) — single-image identity preservation
3. Li et al., "PhotoMaker: Customizing Realistic Human Photos via Stacked ID Embedding" (2024) — multi-reference identity
4. Huang et al., "ConsistentID: Portrait Generation with Multimodal Fine-Grained Identity Preserving" (2024)
5. Avrahami et al., "The Chosen One: Consistent Characters in Text-to-Image Diffusion Models" (2024)
6. Zhou et al., "StoryDiffusion: Consistent Self-Attention for Long-Range Image and Video Generation" (2024)
7. He et al., "ID-Animator: Zero-Shot Identity-Preserving Human Video Generation" (2024)
8. Ma et al., "Magic-Me: Identity-Specific Video Customized Diffusion" (2024)
9. Zhao et al., "VideoAssembler: Identity-Consistent Video Generation with Reference Entities" (2024)
10. Tewel et al., "ConsiStory: Training-Free Consistent Text-to-Image Generation" (2024)

### Video Continuity & Realism
11. FFmpeg xfade transition documentation — clip stitching with crossfades
12. Google Veo 2 API — image-to-video conditioning for frame chaining
13. Google Flow Ingredients system — multi-reference character anchoring
14. Wav2Lip — audio-driven lip sync post-processing
15. InsightFace/ArcFace — face embedding comparison for consistency validation

---

## 14. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Character identity drift across clips | HIGH | 6-layer consistency enforcement + face-swap fallback |
| Flow lacks public API | HIGH | Use Veo 3/2 API with manual ingredient replication; monitor Flow API availability |
| 8-second clip seams visible | MEDIUM | Last-frame chaining + crossfade transitions + strategic scene breaks |
| Lip sync quality poor | MEDIUM | Minimize visible speaking faces; use b-roll heavy editing |
| API rate limits / cost overruns | MEDIUM | Multi-key pool rotation + fallback models + caching |
| AI detection by platforms | LOW | Ultra-realism post-processing + metadata injection |
| Color inconsistency across clips | MEDIUM | LUT standardization + histogram matching + prompt consistency |

---

## 15. Phase Roadmap

### Phase 1: Core Pipeline (MVP)
- Script generation agent
- Character DNA system (manual input + reference sheet generation)
- Storyboard generation (Imagen 3)
- Video generation (Veo 2 API — since Flow may lack API)
- Basic voiceover (Gemini TTS)
- FFmpeg stitching with crossfades
- Basic color normalization
- Single API key per service

### Phase 2: Consistency & Quality
- Character DNA Extractor (user uploads → auto DNA)
- Multi-candidate generation + scoring
- Face consistency validation (ArcFace)
- Last-frame chaining for continuity
- Lip sync integration (Wav2Lip)
- Ultra-realism post-processing filters
- API pool management with failover

### Phase 3: Scale & Polish
- Flow API integration (when available)
- Multiple video outcome types
- Frontend UI (Next.js)
- Background music library + mixing
- Text overlay / caption engine
- Batch generation
- Cost tracking and optimization

### Phase 4: Advanced Features
- Multi-character scenes
- Dynamic wardrobe changes within consistency
- Voice cloning (with consent)
- A/B testing of video variants
- Analytics dashboard
- API for third-party integration

---

## 16. Open Questions

1. **Flow API availability:** As of now, Flow is a web UI tool without a public REST API. Verify if API access has launched. If not, Veo 3/2 is the fallback, and the "ingredients" concept must be replicated via reference image conditioning.

2. **Veo 3 API status:** Veo 3 was announced with native audio generation. If available, this could simplify the audio-video pipeline significantly. Verify current API access.

3. **Face swap vs. native consistency:** Should we invest in a face-swap post-processing layer (FaceFusion) as a mandatory step, or rely purely on prompt-based + reference-image consistency?

4. **LoRA training per avatar:** Should we train character-specific LoRAs for open-source video models as an additional consistency layer? This adds compute cost but significantly improves identity preservation.

5. **Real-time preview:** Should the system offer real-time storyboard preview before committing to video generation (which is expensive)?
