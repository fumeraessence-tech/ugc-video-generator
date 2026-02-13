"""Production Bible Service - Assembles the master document and generates scripts.

This service:
1. Takes Product DNA, Avatar DNA, and user settings
2. Uses Co-Pilot to expand the user's brief
3. Assembles the Production Bible
4. Generates the complete script in a single call for consistency
"""

import json
import logging
from google import genai
from google.genai import types

from app.models.product_dna import ProductDNA
from app.models.schemas import AvatarDNA
from app.models.production_bible import (
    ProductionBible,
    StyleConfig,
    CreativeBrief,
    CameraLanguage,
    CameraBody,
    CameraMovement,
    LightingBible,
    RealismRules,
    Platform,
    VideoStyle,
    Tone,
)

logger = logging.getLogger(__name__)

# Co-Pilot brief expansion prompt
BRIEF_EXPANSION_PROMPT = """You are a top-tier UGC video strategist and creative director who creates viral-worthy content for Meta Ads, TikTok, Instagram, and YouTube.

Given a simple user prompt, expand it into a HIGHLY SPECIFIC, scroll-stopping creative brief.

USER'S SIMPLE PROMPT:
{user_prompt}

PRODUCT BEING FEATURED:
{product_description}

TARGET PLATFORM: {platform}
VIDEO STYLE: {style}
TONE: {tone}
DURATION: {duration} seconds

═══════════════════════════════════════════════════════
STYLE-SPECIFIC DIRECTION (match the style exactly):
═══════════════════════════════════════════════════════

- testimonial: Real person sharing genuine experience. Start mid-story, not "Hi guys". Include a specific moment of surprise or delight.
- tutorial: "Let me show you the trick that changed everything." Step-by-step with a satisfying payoff.
- unboxing: Build anticipation. Slow reveal. React authentically. Show packaging details.
- grwm: Integrate product naturally into a getting-ready routine. Conversational, mirror-facing.
- comparison: Side-by-side or before/after. Be brutally honest about the "other" option.
- transformation: Dramatic before → after with a clear turning point moment.
- day_in_life: Weave product into daily moments. Lifestyle-first, product-second.
- haul: Multiple products, quick takes, genuine reactions, ranking or rating.
- problem_solution: Open with a relatable frustration (ideally visual). Present product as the "wait, actually..." moment.
- storytelling: Narrative arc with a beginning, middle, and twist/resolution. Hook with "I never thought I'd say this but..."
- reaction: Genuine first-time reaction. Surprise, disbelief, or delight. Can be duet-style.
- pov: "POV: you finally found the product that actually works." Immersive, first-person perspective.
- myth_busting: "Everyone says [common belief] but here's the truth..." Challenge assumptions with proof.
- three_reasons: "3 reasons why I'll never go back to [old way]." Numbered, punchy, each under 5 seconds.
- stop_scrolling: "STOP. You need to see this." Pattern interrupt opening. Bold, direct, unapologetic.
- asmr: Whisper-soft narration, satisfying product sounds, close-up textures. Sensory-driven.
- duet_stitch: React to or build on another video concept. "She was right..." or "I tested this and..."
- street_interview: "We asked 10 people to try [product]..." Candid reactions, man-on-the-street style.
- challenge: Create a shareable challenge format around the product. Fun, participatory, brandable.
- secret_hack: "The hack nobody talks about..." Underground knowledge vibe. Insider tip framing.
- routine: Morning/night/weekly routine integration. Satisfying sequence, aesthetic shots.
- expectation_reality: "What I expected vs what I got." Subvert expectations (positively). Humor-driven.
- storytime: "Okay so this is crazy..." Gossip-energy storytelling with product woven in naturally.
- whisper_sell: Soft-spoken, intimate, ASMR-adjacent. "You don't need this but..." reverse psychology.
- founder_story: Origin story of the brand/product. Passion, struggle, breakthrough moment.
- mini_vlog: Day-in-life vlog format with product appearing naturally. Authentic, unpolished energy.
- aesthetic: Visual-first. Mood board come to life. Beautiful shots, minimal dialogue, vibes-driven.
- us_vs_them: "Other brands do X. We do Y." Competitive positioning without being negative.

═══════════════════════════════════════════════════════
PLATFORM CULTURE (tailor the brief accordingly):
═══════════════════════════════════════════════════════

- tiktok: Raw, unpolished, trend-aware, sound-driven, quick cuts, green screen ok, duet-friendly
- instagram_reels: Slightly more polished, aesthetic-conscious, save-worthy, carousel-complement
- youtube_shorts: Educational lean, more substance per second, searchable hooks
- youtube_long: Deeper narrative, more product detail, chapter-friendly structure
- facebook: Broader audience, slightly more explanatory, caption-heavy viewing (sound-off friendly)
- meta_ads: Performance-first. Hook in 1.5s. Thumb-stop visuals. Clear value prop in 5s. Strong CTA. Test multiple hooks.
- pinterest: Aspirational, lifestyle-focused, save-worthy, vertical, longer shelf life
- snapchat: Ephemeral energy, authentic, young audience, AR/filter-friendly, fast-paced

Generate a detailed creative brief (return as JSON):

{{
  "hook_strategy": "The EXACT opening moment — what the viewer sees and hears in the first 1-3 seconds. Be hyper-specific. Include the first line of dialogue if applicable. For meta_ads, provide 2-3 hook variations.",
  "pain_point": "The specific, emotionally resonant problem. Not generic — describe the exact frustrating moment the audience recognizes instantly.",
  "key_selling_points": [
    "Benefit 1 — framed as the audience would describe it to a friend, not marketing speak",
    "Benefit 2 — specific, tangible, provable",
    "Benefit 3 — emotional or lifestyle benefit"
  ],
  "emotional_journey": "Precise emotional arc: [opening emotion] → [turning point] → [closing emotion]. Example: 'Skepticism → Genuine surprise → Excited urgency'",
  "cta_approach": "Platform-native CTA. Not 'click the link below' — something that fits the content style. For meta_ads: direct response CTA with urgency.",
  "unique_angle": "The ONE thing that makes this video impossible to scroll past. The creative insight or unexpected framing that separates this from the 1000 other videos about similar products."
}}

CRITICAL RULES:
- Be BRUTALLY SPECIFIC — no generic briefs. Every field must feel like it was written for THIS exact product + style + platform combo.
- The hook_strategy must describe an actual visual/audio moment, not a concept.
- key_selling_points should sound like how a real person talks, not copywriting.
- For meta_ads platform: optimize for thumb-stop rate and click-through. Performance > aesthetics.
- Match the tone: {tone} — let this color every aspect of the brief.

Return ONLY valid JSON, no markdown."""


# Master script generation prompt
SCRIPT_GENERATION_PROMPT = """You are an expert UGC video scriptwriter creating content that looks authentic and natural.

╔══════════════════════════════════════════════════════════════════╗
║  ⚠️ CRITICAL: CHARACTER & PRODUCT CONSISTENCY                    ║
╠══════════════════════════════════════════════════════════════════╣
║  The SAME person and SAME product must appear in EVERY scene.   ║
║  This script will be used to generate visuals - maintain        ║
║  ABSOLUTE consistency in character and product descriptions.    ║
╚══════════════════════════════════════════════════════════════════╝

PRODUCTION BIBLE (Your immutable reference):
{production_bible}

CREATIVE BRIEF:
Hook Strategy: {hook_strategy}
Pain Point: {pain_point}
Key Selling Points: {selling_points}
Emotional Journey: {emotional_journey}
CTA Approach: {cta_approach}

Generate a complete {duration}-second {style} script for {platform}.

Return a JSON object with this EXACT structure:

{{
  "title": "Video title for internal reference",
  "total_duration": {duration},
  "character_identity_lock": {{
    "description": "Brief but EXACT description of the character that MUST be consistent across all scenes",
    "must_maintain": ["list of features that must remain identical in every scene"]
  }},
  "product_identity_lock": {{
    "description": "Brief but EXACT description of the product that MUST be consistent",
    "must_maintain": ["list of product features that must remain identical"]
  }},
  "scenes": [
    {{
      "scene_number": "1.1",
      "scene_type": "hook|problem|solution|demo|social_proof|cta",
      "duration_seconds": 3,
      "start_time": 0,
      "end_time": 3,
      "dialogue": "Exact words the creator speaks. Natural, conversational.",
      "character_action": "What the creator is doing (same person as character_identity_lock)",
      "character_expression": "Facial expression and energy level",
      "product_visibility": "none|subtle|prominent|hero",
      "product_action": "What happens with the product (same product as product_identity_lock)",
      "camera": {{
        "shot_type": "extreme_close_up|close_up|medium_close_up|medium|wide",
        "angle": "eye_level|slightly_low|slightly_high|selfie_angle|top_down",
        "movement": "static|subtle_handheld|slow_push|slow_pull|pan",
        "focus": "face|product|rack_focus_face_to_product"
      }},
      "lighting": {{
        "setup": "natural_window|ring_light|golden_hour|mixed",
        "mood": "bright|warm|moody|neutral"
      }},
      "audio_notes": "Tone, pace, emotion for voice delivery"
    }}
  ],
  "audio_direction": {{
    "overall_tone": "How the voice should sound throughout",
    "pacing_notes": "Where to speed up, slow down, pause",
    "emphasis_words": ["words", "to", "emphasize"]
  }}
}}

CRITICAL RULES - CHARACTER & PRODUCT CONSISTENCY (HIGHEST PRIORITY):
1. ⚠️ THE SAME PERSON must appear in EVERY scene - no character drift allowed
2. ⚠️ THE SAME PRODUCT must appear consistently - no variation in appearance
3. Character descriptions must reference the LOCKED character identity from the bible
4. Product descriptions must reference the LOCKED product identity from the bible
5. DO NOT introduce new characters or substitute different people between scenes
6. DO NOT change product appearance, color, shape, or branding between scenes

GENERAL RULES:
1. Each scene must flow naturally into the next
2. Dialogue must sound like a real person talking, not scripted
3. Product should appear naturally, not forced
4. NO on-screen text or captions (post-production handles that)
5. Camera and lighting should feel authentic UGC, not professional
6. Total duration of all scenes must equal {duration} seconds
7. Include natural pauses, "umm"s, or conversational fillers for authenticity

SCENE TYPE GUIDELINES:
- hook (0-3s): Attention grabber, bold statement, or intriguing visual
- problem (3-8s): Relatable pain point, frustration
- solution (8-15s): Product introduction as the answer
- demo (15-25s): Product in action, showing features
- social_proof (optional): Results, transformation, or testimonial moment
- cta (last 3-5s): Clear call to action

Return ONLY valid JSON."""


class ProductionBibleService:
    """Service for assembling Production Bibles and generating scripts."""

    def __init__(self, api_key: str | None = None):
        """Initialize the service.

        Args:
            api_key: Google AI API key. If not provided, uses environment variable.
        """
        from app.config import settings

        self._api_key = api_key or settings.GEMINI_API_KEY
        if not self._api_key:
            raise ValueError("GEMINI_API_KEY is required")

        self._client = genai.Client(api_key=self._api_key)

    def _repair_json(self, text: str) -> str:
        """Attempt to repair truncated or malformed JSON.

        Common issues:
        - Unterminated strings
        - Missing closing brackets/braces
        - Trailing commas
        """
        import re

        # Remove any trailing incomplete content after last complete structure
        # Find the last complete scene object
        text = text.strip()

        # If it ends with an unterminated string, try to close it
        if text.count('"') % 2 != 0:
            # Find the last quote and close the string
            last_quote_idx = text.rfind('"')
            # Check if it's an opening quote (value start)
            before_quote = text[:last_quote_idx].rstrip()
            if before_quote.endswith(':') or before_quote.endswith(',') or before_quote.endswith('['):
                # This is an unterminated value string, close it
                text = text + '"'

        # Count brackets and braces
        open_braces = text.count('{') - text.count('}')
        open_brackets = text.count('[') - text.count(']')

        # Remove trailing comma if present before closing
        text = re.sub(r',\s*$', '', text)

        # Close any open structures
        text = text + (']' * open_brackets) + ('}' * open_braces)

        return text

    async def expand_brief(
        self,
        user_prompt: str,
        product_dna: ProductDNA,
        platform: Platform,
        style: VideoStyle,
        duration: int,
        tone: Tone = Tone.EXCITED,
        language: str = "en",
    ) -> CreativeBrief:
        """Expand a simple user prompt into a detailed creative brief.

        Args:
            user_prompt: The user's simple description of what they want
            product_dna: Product DNA for context
            platform: Target platform
            style: Video style
            duration: Video duration in seconds
            tone: Emotional tone

        Returns:
            Expanded CreativeBrief
        """
        logger.info("Expanding user brief with Co-Pilot")

        prompt = BRIEF_EXPANSION_PROMPT.format(
            user_prompt=user_prompt,
            product_description=product_dna.visual_description,
            platform=platform.value,
            style=style.value,
            tone=tone.value,
            duration=duration,
        )

        # Language directive for brief expansion
        if language and language != "en":
            lang_names = {
                "hi": "Hindi", "ta": "Tamil", "te": "Telugu", "bn": "Bengali",
                "mr": "Marathi", "gu": "Gujarati", "kn": "Kannada",
                "pa": "Punjabi", "ml": "Malayalam",
            }
            lang = lang_names.get(language, "English")
            prompt += f"\n\nLANGUAGE: Write the hook_strategy dialogue examples in {lang}. Other brief fields should remain in English."

        try:
            response = self._client.models.generate_content(
                model="gemini-2.5-pro",
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=1024,
                ),
            )

            response_text = (response.text or "").strip()
            if not response_text:
                logger.warning("Gemini returned empty response for brief expansion")
                raise ValueError("Empty response from Gemini")

            # Clean markdown if present
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()

            data = json.loads(response_text)

            brief = CreativeBrief(
                user_input=user_prompt,
                hook_strategy=data.get("hook_strategy", ""),
                pain_point=data.get("pain_point", ""),
                key_selling_points=data.get("key_selling_points", []),
                emotional_journey=data.get("emotional_journey", ""),
                cta_approach=data.get("cta_approach", ""),
                unique_angle=data.get("unique_angle"),
            )

            logger.info("Successfully expanded brief")
            return brief

        except Exception as e:
            logger.exception(f"Brief expansion failed: {e}")
            # Return a basic brief if expansion fails
            return CreativeBrief(
                user_input=user_prompt,
                hook_strategy="Open with product hero shot",
                pain_point="Generic product need",
                key_selling_points=["Quality", "Value", "Results"],
                emotional_journey="Curiosity → Interest → Desire → Action",
                cta_approach="Direct call to action",
            )

    async def assemble_bible(
        self,
        product_dna: ProductDNA,
        avatar_dna: AvatarDNA | None,
        user_prompt: str,
        platform: Platform = Platform.INSTAGRAM_REELS,
        style: VideoStyle = VideoStyle.TESTIMONIAL,
        tone: Tone = Tone.EXCITED,
        duration: int = 30,
        language: str = "en",
        camera_device: str = "iphone_16_pro_max",
    ) -> ProductionBible:
        """Assemble a complete Production Bible.

        Args:
            product_dna: Analyzed product DNA
            avatar_dna: Character DNA (optional)
            user_prompt: User's simple description
            platform: Target platform
            style: Video style
            tone: Emotional tone
            duration: Video duration

        Returns:
            Complete ProductionBible
        """
        logger.info("Assembling Production Bible")

        # Step 1: Expand the brief
        creative_brief = await self.expand_brief(
            user_prompt=user_prompt,
            product_dna=product_dna,
            platform=platform,
            style=style,
            duration=duration,
            tone=tone,
            language=language,
        )

        # Step 2: Configure style
        style_config = StyleConfig(
            platform=platform,
            duration_seconds=duration,
            style=style,
            tone=tone,
            language=language,
        )

        # Step 3: Set up camera language (UGC-optimized defaults)
        camera_language = CameraLanguage()

        # Step 3: Set up camera language based on device selection
        if camera_device and camera_device != "professional":
            # iPhone camera specs for authentic UGC feel
            iphone_specs = {
                "iphone_16_pro_max": {"lens_mm": 24, "body_name": "iPhone 16 Pro Max"},
                "iphone_16_pro": {"lens_mm": 24, "body_name": "iPhone 16 Pro"},
                "iphone_15_pro": {"lens_mm": 24, "body_name": "iPhone 15 Pro"},
                "iphone_15": {"lens_mm": 26, "body_name": "iPhone 15"},
                "iphone_14": {"lens_mm": 26, "body_name": "iPhone 14"},
            }
            specs = iphone_specs.get(camera_device)
            if specs:
                camera_language = CameraLanguage(
                    body=CameraBody.IPHONE_15_PRO,  # Closest enum value
                    lens_mm=specs["lens_mm"],
                    handheld_intensity="moderate",
                    focus_behavior="natural",
                    default_movement=CameraMovement.SUBTLE_HANDHELD,
                )

        # Step 4: Set up lighting (based on tone)
        lighting_bible = LightingBible()
        if tone == Tone.LUXURIOUS:
            lighting_bible.mood = "warm_luxurious"
            lighting_bible.color_temp_kelvin = 4500
        elif tone == Tone.CALM:
            lighting_bible.mood = "soft_peaceful"
            lighting_bible.key_intensity = "soft"
        elif tone == Tone.EXCITED:
            lighting_bible.mood = "bright_energetic"
            lighting_bible.color_temp_kelvin = 5600

        # Step 5: Realism rules (always strict)
        realism_rules = RealismRules()

        # Step 6: Assemble the bible
        bible = ProductionBible(
            product_dna=product_dna,
            avatar_dna=avatar_dna,
            style_config=style_config,
            creative_brief=creative_brief,
            camera_language=camera_language,
            lighting_bible=lighting_bible,
            realism_rules=realism_rules,
        )

        # Step 7: Generate the master prompt
        bible.assemble_master_prompt()

        logger.info("Production Bible assembled successfully")
        return bible

    async def generate_script(
        self,
        bible: ProductionBible,
    ) -> dict:
        """Generate the complete script from the Production Bible.

        This generates ALL scenes in a single call to maintain consistency.

        Args:
            bible: The assembled Production Bible

        Returns:
            Complete script as structured dict with scenes
        """
        logger.info(f"Generating {bible.style_config.duration_seconds}s script")

        # Language-aware WPM for dialogue fluency
        language_wpm = {
            "en": 150, "hi": 120, "ta": 110, "te": 115, "bn": 120,
            "mr": 120, "gu": 120, "kn": 110, "pa": 125, "ml": 105,
        }
        lang = getattr(bible.style_config, 'language', 'en') or 'en'
        effective_wpm = language_wpm.get(lang, 150)
        max_words_per_scene = int((8 / 60) * effective_wpm)  # 8s max scene

        prompt = SCRIPT_GENERATION_PROMPT.format(
            production_bible=bible.master_prompt,
            hook_strategy=bible.creative_brief.hook_strategy,
            pain_point=bible.creative_brief.pain_point,
            selling_points=", ".join(bible.creative_brief.key_selling_points),
            emotional_journey=bible.creative_brief.emotional_journey,
            cta_approach=bible.creative_brief.cta_approach,
            duration=bible.style_config.duration_seconds,
            style=bible.style_config.style.value,
            platform=bible.style_config.platform.value,
        )

        # Add WPM constraint for dialogue pacing
        prompt += f"""

DIALOGUE PACING (CRITICAL for natural delivery):
- Speaking rate: {effective_wpm} words per minute (natural pace for this language)
- Maximum {max_words_per_scene} words per scene (8-second max)
- Each scene's word_count MUST respect this limit
- Dialogue should flow naturally at this pace — not rushed, not dragging
"""

        try:
            response = self._client.models.generate_content(
                model="gemini-2.5-pro",
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.7,  # Slightly lower for more consistent output
                    max_output_tokens=8192,  # Increased for longer scripts
                    response_mime_type="application/json",  # Force JSON output
                ),
            )

            response_text = (response.text or "").strip()
            if not response_text:
                logger.warning("Gemini returned empty response for script generation")
                raise ValueError("Empty response from Gemini")

            # Clean markdown if present (shouldn't happen with response_mime_type but just in case)
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()

            # Try to repair truncated JSON
            response_text = self._repair_json(response_text)

            script_data = json.loads(response_text)

            # Validate scene structure
            if "scenes" not in script_data:
                raise ValueError("Script missing scenes array")

            # Ensure scene numbers are properly formatted
            for i, scene in enumerate(script_data["scenes"]):
                if "scene_number" not in scene:
                    scene["scene_number"] = f"1.{i + 1}"

            logger.info(f"Generated script with {len(script_data['scenes'])} scenes")
            return script_data

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse script JSON: {e}")
            logger.error(f"Response (first 1000 chars): {response_text[:1000]}")
            logger.error(f"Response (last 500 chars): {response_text[-500:]}")
            raise ValueError(f"Script generation returned invalid JSON: {e}")

        except Exception as e:
            logger.exception(f"Script generation failed: {e}")
            raise
