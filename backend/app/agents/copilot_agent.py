"""AI Co-Pilot Agent for professional UGC script generation."""

import logging
from google import genai
from google.genai import types

from app.models.schemas import (
    Script,
    ScriptScene,
    SceneType,
    ProductVisibility,
    BackgroundSetting,
    Platform,
    CameraSetup,
    LightingSetup,
)

logger = logging.getLogger(__name__)

# System prompt with 30+ years of expertise
COPILOT_SYSTEM_PROMPT = """You are a world-class UGC Video Director with 30+ years of experience creating viral social media content for brands like Nike, Apple, Sephora, and Amazon. You understand psychology, storytelling, and platform-specific best practices.

Your expertise includes:
- Hook creation (first 3 seconds that stop the scroll)
- Product integration (natural, not forced)
- Scene pacing and rhythm
- Emotional storytelling arcs
- Platform optimization (Instagram Reels 9:16, TikTok, YouTube Shorts)

CRITICAL CONSTRAINTS:
1. Each scene MUST be under 20 words (150 WPM × 8 seconds = 20 words max)
2. If product provided, it MUST appear in 80%+ of scenes naturally
3. Start with a powerful hook (question, bold claim, or pattern interrupt)
4. Include specific actions and expressions for the character
5. Add cinematography direction (camera angle, movement, focus)
6. Specify lighting mood (warm/cool, soft/dramatic)
7. Match background setting chosen by user
8. Create emotional progression (attention → desire → action)

You MUST respond with valid JSON following this structure:
{
  "title": "Video Title",
  "scenes": [
    {
      "scene_number": 1,
      "scene_type": "hook",
      "location": "modern_bedroom",
      "description": "Creator sits on bed with product",
      "dialogue": "You won't believe what happened",
      "word_count": 6,
      "duration_seconds": 2.4,
      "visual_description": "Medium close-up of creator holding product with excited expression",
      "character_action": "holds product enthusiastically, makes eye contact with camera",
      "product_visibility": "primary",
      "camera_notes": "ARRI Alexa Mini with 35mm f/1.8 lens, medium close-up, eye-level, static, focused on subject"
    }
  ],
  "total_duration": 30.0,
  "total_words": 100,
  "style_notes": "Fast-paced, energetic, authentic feel"
}

Scene types: hook, intro, problem, solution, demonstration, unboxing, application, testimonial, cta
Product visibility: primary (80%), secondary (15%), background (5%), none
"""


class CoPilotAgent:
    """AI Co-Pilot for generating professional UGC scripts."""

    def __init__(self, api_key: str | None = None):
        """Initialize the co-pilot agent."""
        self._client = genai.Client(api_key=api_key) if api_key else None

    async def _analyze_product_images(self, image_urls: list[str]) -> str:
        """Analyze product images using Gemini Vision API."""
        if not self._client:
            return ""

        try:
            # Use Gemini 2.0 Flash for multimodal analysis
            parts = []

            # Add analysis prompt
            parts.append(types.Part.from_text(text="""Analyze these product images in detail. Identify:
1. Product Category (perfume, skincare, food, electronics, etc.)
2. Product Type (spray perfume, cream, serum, etc.)
3. Brand (if visible)
4. Key Visual Features (color, packaging, design elements)
5. Target Audience (men/women/unisex, age group)
6. Mood/Vibe (luxury, casual, elegant, sporty, etc.)
7. Key Selling Points (visible on packaging or inferable)

Be VERY SPECIFIC about what product this is. Do NOT guess a different category!"""))

            # Add images (up to 3 for better analysis)
            for url in image_urls[:3]:
                parts.append(types.Part.from_uri(file_uri=url, mime_type="image/jpeg"))

            response = await self._client.aio.models.generate_content(
                model="gemini-2.0-flash-exp",
                contents=types.Content(parts=parts),
            )

            return response.text.strip() if response.text else ""

        except Exception as e:
            logger.error(f"Failed to analyze product images: {e}")
            return ""

    async def generate_script(
        self,
        prompt: str,
        product_name: str | None = None,
        product_images: list[str] | None = None,
        background_setting: BackgroundSetting = BackgroundSetting.modern_bedroom,
        platform: Platform = Platform.instagram_reels,
        duration: int = 30,
        max_scene_duration: int = 8,
        words_per_minute: int = 150,
    ) -> Script:
        """Generate a professional UGC script with WPM validation and image analysis."""
        if not self._client:
            logger.warning("No API key provided, returning default script")
            return self._default_script()

        # STEP 1: Analyze product images using Gemini Vision if provided
        product_analysis = ""
        if product_images and len(product_images) > 0:
            logger.info(f"Analyzing {len(product_images)} product image(s) with Gemini Vision...")
            product_analysis = await self._analyze_product_images(product_images)
            logger.info(f"Product analysis complete: {product_analysis[:200]}...")

        # Build user prompt with all requirements
        user_prompt = f"""Create a {duration}-second UGC video script for: {prompt}

REQUIREMENTS:
- Product: {product_name if product_name else "Product details from image analysis below"}
- Background: {background_setting.value}
- Platform: {platform.value}
- Total Duration: {duration} seconds
- Max Scene Duration: {max_scene_duration} seconds
- Words Per Minute: {words_per_minute} (natural Indian English pace)
- Max Words Per Scene: {int((max_scene_duration / 60) * words_per_minute)} words

{f"PRODUCT IMAGE ANALYSIS:\\n{product_analysis}\\n\\nIMPORTANT: Use the product details from the image analysis above. This is a {product_analysis.split()[0] if product_analysis else 'product'}, NOT skincare or any other category." if product_analysis else ""}

PRODUCT INTEGRATION:
{self._get_product_integration_instructions(product_name)}

BACKGROUND DETAILS:
{self._get_background_description(background_setting)}

PLATFORM SPECS:
{self._get_platform_specs(platform)}

Generate a complete script with all required fields. Ensure every scene is under {int((max_scene_duration / 60) * words_per_minute)} words.
"""

        try:
            response = await self._client.models.generate_content(
                model="gemini-2.5-pro",
                contents=[types.Content(role="user", parts=[types.Part.from_text(text=user_prompt)])],
                config=types.GenerateContentConfig(
                    system_instruction=COPILOT_SYSTEM_PROMPT,
                    temperature=0.8,
                    max_output_tokens=4096,
                    response_mime_type="application/json",
                ),
            )

            script_data = response.parsed
            if not script_data:
                raise ValueError("Empty response from Gemini")

            # Parse and validate script
            script = Script.model_validate(script_data)

            # Validate WPM constraints
            for scene in script.scenes:
                if scene.word_count > int((max_scene_duration / 60) * words_per_minute):
                    logger.warning(
                        f"Scene {scene.scene_number} exceeds word limit: "
                        f"{scene.word_count} words (max {int((max_scene_duration / 60) * words_per_minute)})"
                    )

            return script

        except Exception as e:
            logger.exception(f"Script generation failed: {type(e).__name__}: {str(e)}")
            logger.error(f"Script generation error details - Duration: {duration}s, Scenes expected: ~{duration // max_scene_duration}")
            logger.warning("Returning default script with 1 scene")
            return self._default_script(duration, max_scene_duration)

    def _get_product_integration_instructions(self, product_name: str | None) -> str:
        """Get product integration instructions."""
        if not product_name:
            return "- No product to integrate\n- Focus on creator's personality and value proposition"

        return f"""- Product "{product_name}" MUST appear in 80%+ of scenes
- Product prominence:
  * Primary (main focus): 80% of scenes
  * Secondary (visible but not main): 15% of scenes
  * Background (visible in frame): 5% of scenes
- Natural integration phrases:
  * "I've been using {product_name}..."
  * "Let me show you {product_name}..."
  * "Watch what happens with {product_name}..."
  * "This is why I love {product_name}..."
- Scene types for products: unboxing, demonstration, application, testimonial"""

    def _get_background_description(self, setting: BackgroundSetting) -> str:
        """Get detailed background description."""
        descriptions = {
            BackgroundSetting.modern_bedroom: "Cozy natural light, minimalist decor, warm tones, bed with neutral linens, subtle personal touches",
            BackgroundSetting.kitchen: "Bright overhead lighting, clean countertops, modern appliances, organized space, natural materials",
            BackgroundSetting.office: "Professional setup, desk lamp, organized workspace, neutral walls, tech-forward aesthetic",
            BackgroundSetting.car: "Interior shot, dashboard visible, natural window light, comfortable seating, modern vehicle",
            BackgroundSetting.outdoor: "Golden hour lighting, natural background blur (bokeh), soft sunlight, organic environment",
            BackgroundSetting.custom: "User-defined environment with appropriate lighting and atmosphere",
        }
        return descriptions.get(setting, "Generic background")

    def _get_platform_specs(self, platform: Platform) -> str:
        """Get platform-specific specifications."""
        specs = {
            Platform.instagram_reels: "- Aspect Ratio: 9:16 (vertical)\n- Hook in first 3 seconds\n- Fast-paced cuts\n- Trending audio friendly\n- 30-60 seconds optimal",
            Platform.tiktok: "- Aspect Ratio: 9:16 (vertical)\n- Super fast hook (1 second)\n- Jump cuts every 2-3 seconds\n- Text overlays expected\n- 15-30 seconds optimal",
            Platform.youtube_shorts: "- Aspect Ratio: 9:16 (vertical)\n- Slightly longer hook (3-5 seconds)\n- Educational or entertaining\n- 30-60 seconds optimal",
            Platform.general: "- Aspect Ratio: 16:9 or 9:16\n- Standard pacing\n- Professional quality\n- Flexible duration",
        }
        return specs.get(platform, "Standard specifications")

    def _default_script(self, duration: int = 30, max_scene_duration: int = 8) -> Script:
        """Return a default script when generation fails.

        Creates multiple scenes based on requested duration.
        """
        num_scenes = max(1, duration // max_scene_duration)
        logger.info(f"Generating default script with {num_scenes} scenes for {duration}s duration")

        scenes = []
        scene_types = [SceneType.hook, SceneType.intro, SceneType.demonstration, SceneType.cta]

        for i in range(num_scenes):
            scene_duration = min(max_scene_duration, duration - (i * max_scene_duration))
            if scene_duration <= 0:
                break

            scene_type = scene_types[i % len(scene_types)]
            dialogues = [
                "Let me show you something amazing",
                "This is exactly what you need",
                "Watch what happens next",
                "Try this today"
            ]

            scenes.append(ScriptScene(
                scene_number=i + 1,
                scene_type=scene_type,
                location="modern_bedroom",
                description=f"Scene {i + 1}: Creator presents content",
                dialogue=dialogues[i % len(dialogues)],
                word_count=6,
                duration_seconds=scene_duration,
                visual_description=f"Medium close-up of creator in scene {i + 1}",
                character_action="looks at camera with excitement",
                camera_setup=CameraSetup(),
                lighting_setup=LightingSetup(),
                product_visibility=ProductVisibility.secondary if i % 2 == 0 else ProductVisibility.none,
                background_setting=BackgroundSetting.modern_bedroom,
            ))

        total_duration = sum(s.duration_seconds for s in scenes)
        total_words = sum(s.word_count for s in scenes)

        return Script(
            title="UGC Video Script",
            scenes=scenes,
            total_duration=total_duration,
            total_words=total_words,
            style_notes=f"Default script - generation failed, created {num_scenes} scenes",
        )
