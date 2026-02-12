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
    LightingBible,
    RealismRules,
    Platform,
    VideoStyle,
    Tone,
)

logger = logging.getLogger(__name__)

# Co-Pilot brief expansion prompt
BRIEF_EXPANSION_PROMPT = """You are an expert UGC video strategist and creative director.

Given a simple user prompt, expand it into a comprehensive creative brief for a UGC video.

USER'S SIMPLE PROMPT:
{user_prompt}

PRODUCT BEING FEATURED:
{product_description}

TARGET PLATFORM: {platform}
VIDEO STYLE: {style}
DURATION: {duration} seconds

Generate a detailed creative brief with the following structure (return as JSON):

{{
  "hook_strategy": "Specific approach to grab attention in the first 3 seconds. Be creative and specific to this product.",
  "pain_point": "The specific problem or frustration the target audience experiences that this product solves.",
  "key_selling_points": [
    "First major benefit - be specific",
    "Second major benefit - be specific",
    "Third major benefit - be specific"
  ],
  "emotional_journey": "The emotional arc the viewer should experience: [starting emotion] → [middle emotion] → [ending emotion]",
  "cta_approach": "Specific call-to-action strategy that fits the platform and product",
  "unique_angle": "What makes THIS video different from typical product videos"
}}

IMPORTANT:
- Be SPECIFIC to this product, not generic
- Consider the platform's culture and audience
- The hook must work in the first 3 seconds
- Make the CTA natural, not salesy

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
    ) -> CreativeBrief:
        """Expand a simple user prompt into a detailed creative brief.

        Args:
            user_prompt: The user's simple description of what they want
            product_dna: Product DNA for context
            platform: Target platform
            style: Video style
            duration: Video duration in seconds

        Returns:
            Expanded CreativeBrief
        """
        logger.info("Expanding user brief with Co-Pilot")

        prompt = BRIEF_EXPANSION_PROMPT.format(
            user_prompt=user_prompt,
            product_description=product_dna.visual_description,
            platform=platform.value,
            style=style.value,
            duration=duration,
        )

        try:
            response = self._client.models.generate_content(
                model="gemini-2.5-pro",
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=1024,
                ),
            )

            response_text = response.text.strip()

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
        )

        # Step 2: Configure style
        style_config = StyleConfig(
            platform=platform,
            duration_seconds=duration,
            style=style,
            tone=tone,
        )

        # Step 3: Set up camera language (UGC-optimized defaults)
        camera_language = CameraLanguage()

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

            response_text = response.text.strip()

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
