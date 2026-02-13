"""Production Bible - The master document that guides all content generation.

The Production Bible is assembled ONCE at the start of generation and serves
as the immutable source of truth for all subsequent generations (script,
storyboard, audio, video).
"""

from enum import Enum
from pydantic import BaseModel, Field

from app.models.product_dna import ProductDNA
from app.models.schemas import AvatarDNA


class Platform(str, Enum):
    """Target platform for the video."""

    INSTAGRAM_REELS = "instagram_reels"
    TIKTOK = "tiktok"
    YOUTUBE_SHORTS = "youtube_shorts"
    YOUTUBE_LONG = "youtube_long"
    FACEBOOK = "facebook"
    META_ADS = "meta_ads"
    PINTEREST = "pinterest"
    SNAPCHAT = "snapchat"


class VideoStyle(str, Enum):
    """Style/format of the UGC video."""

    # Classic UGC
    TESTIMONIAL = "testimonial"
    TUTORIAL = "tutorial"
    UNBOXING = "unboxing"
    GRWM = "grwm"
    COMPARISON = "comparison"
    TRANSFORMATION = "transformation"
    DAY_IN_LIFE = "day_in_life"
    HAUL = "haul"

    # Hook-driven / Meta Ads
    PROBLEM_SOLUTION = "problem_solution"
    STORYTELLING = "storytelling"
    REACTION = "reaction"
    POV = "pov"
    MYTH_BUSTING = "myth_busting"
    THREE_REASONS = "three_reasons"
    STOP_SCROLLING = "stop_scrolling"
    ASMR = "asmr"
    DUET_STITCH = "duet_stitch"
    STREET_INTERVIEW = "street_interview"
    CHALLENGE = "challenge"
    SECRET_HACK = "secret_hack"
    ROUTINE = "routine"
    EXPECTATION_REALITY = "expectation_reality"
    STORYTIME = "storytime"
    WHISPER_SELL = "whisper_sell"
    FOUNDER_STORY = "founder_story"
    MINI_VLOG = "mini_vlog"
    AESTHETIC = "aesthetic"
    US_VS_THEM = "us_vs_them"


class Tone(str, Enum):
    """Emotional tone of the content."""

    EXCITED = "excited"
    CALM = "calm"
    PROFESSIONAL = "professional"
    CASUAL = "casual"
    LUXURIOUS = "luxurious"
    PLAYFUL = "playful"
    URGENT = "urgent"
    CONTROVERSIAL = "controversial"
    VULNERABLE = "vulnerable"
    SARCASTIC = "sarcastic"
    ASMR_WHISPER = "asmr_whisper"
    HYPE = "hype"


class CameraBody(str, Enum):
    """Camera body for UGC authenticity."""

    IPHONE_15_PRO = "iPhone 15 Pro"  # Most common UGC
    IPHONE_14 = "iPhone 14"
    SAMSUNG_S24 = "Samsung Galaxy S24"
    SONY_ZV_E10 = "Sony ZV-E10"  # Vlogger camera
    CANON_M50 = "Canon M50"


class ShotType(str, Enum):
    """Camera shot types."""

    EXTREME_CLOSE_UP = "extreme_close_up"  # Product detail, eyes
    CLOSE_UP = "close_up"  # Face, product hero
    MEDIUM_CLOSE_UP = "medium_close_up"  # Head and shoulders (most common UGC)
    MEDIUM = "medium"  # Waist up
    MEDIUM_WIDE = "medium_wide"  # Full body with environment
    WIDE = "wide"  # Establishing shot


class CameraAngle(str, Enum):
    """Camera angles."""

    EYE_LEVEL = "eye_level"  # Standard, relatable
    SLIGHTLY_LOW = "slightly_low"  # Empowering, aspirational
    SLIGHTLY_HIGH = "slightly_high"  # Approachable, casual
    SELFIE_ANGLE = "selfie_angle"  # Typical phone selfie position
    TOP_DOWN = "top_down"  # Product flat lay
    DUTCH = "dutch"  # Slight tilt for dynamism


class CameraMovement(str, Enum):
    """Camera movement types."""

    STATIC = "static"  # No movement
    SUBTLE_HANDHELD = "subtle_handheld"  # Natural micro-movements
    SLOW_PUSH = "slow_push"  # Gentle zoom in
    SLOW_PULL = "slow_pull"  # Gentle zoom out
    PAN = "pan"  # Horizontal movement
    FOLLOW = "follow"  # Tracks subject movement


class LightingSetup(str, Enum):
    """Lighting setups for UGC authenticity."""

    NATURAL_WINDOW = "natural_window"  # Soft daylight from window
    RING_LIGHT = "ring_light"  # Classic influencer setup
    GOLDEN_HOUR = "golden_hour"  # Warm sunset light
    OVERCAST = "overcast"  # Soft, diffused outdoor
    THREE_POINT = "three_point"  # Key, fill, rim
    PRACTICAL = "practical"  # Using existing room lights
    MIXED = "mixed"  # Daylight + artificial


class LightingDirection(str, Enum):
    """Light direction relative to subject."""

    FRONT = "front"  # Flat, even (ring light)
    FRONT_45 = "front_45"  # Classic portrait
    SIDE = "side"  # Dramatic, moody
    BACK = "back"  # Silhouette/rim
    TOP = "top"  # Overhead


class CameraLanguage(BaseModel):
    """Default camera settings for the production."""

    body: CameraBody = CameraBody.IPHONE_15_PRO
    default_shot: ShotType = ShotType.MEDIUM_CLOSE_UP
    default_angle: CameraAngle = CameraAngle.EYE_LEVEL
    default_movement: CameraMovement = CameraMovement.SUBTLE_HANDHELD
    lens_mm: int = Field(default=24, description="Equivalent focal length in mm")
    depth_of_field: str = Field(default="shallow", description="shallow, medium, deep")

    # UGC authenticity settings
    handheld_intensity: str = Field(
        default="subtle",
        description="none, subtle, moderate - amount of natural camera shake"
    )
    focus_behavior: str = Field(
        default="natural",
        description="perfect, natural (occasional hunting), rack (intentional shifts)"
    )


class LightingBible(BaseModel):
    """Default lighting settings for the production."""

    setup: LightingSetup = LightingSetup.NATURAL_WINDOW
    direction: LightingDirection = LightingDirection.FRONT_45
    color_temp_kelvin: int = Field(default=5600, description="Color temperature in Kelvin")
    key_intensity: str = Field(default="soft", description="soft, medium, hard")
    fill_ratio: str = Field(default="1:2", description="Key to fill ratio")
    rim_light: bool = Field(default=False, description="Whether to add rim/hair light")
    mood: str = Field(default="bright_friendly", description="Overall lighting mood")


class StyleConfig(BaseModel):
    """Style configuration for the video."""

    platform: Platform = Platform.INSTAGRAM_REELS
    duration_seconds: int = Field(default=30, ge=5, le=180)
    style: VideoStyle = VideoStyle.TESTIMONIAL
    tone: Tone = Tone.EXCITED
    pacing: str = Field(
        default="dynamic",
        description="slow, moderate, dynamic, fast"
    )
    music_style: str | None = Field(
        default=None,
        description="Background music style if any"
    )
    language: str = Field(
        default="en",
        description="Language code for script and TTS (en, hi, ta, te, bn, mr, gu, kn, pa, ml)"
    )


class CreativeBrief(BaseModel):
    """Expanded creative brief from Co-Pilot."""

    user_input: str = Field(description="Original user prompt")
    hook_strategy: str = Field(description="How to grab attention in first 3 seconds")
    pain_point: str = Field(description="Problem/frustration to address")
    key_selling_points: list[str] = Field(description="Main benefits to highlight")
    emotional_journey: str = Field(description="Viewer's emotional arc")
    cta_approach: str = Field(description="Call to action strategy")
    unique_angle: str | None = Field(default=None, description="What makes this video different")


class RealismRules(BaseModel):
    """Rules for maintaining photorealistic, non-AI appearance.

    These rules are CRITICAL and must be included in every generation prompt.
    """

    # CHARACTER IDENTITY CONSISTENCY (HIGHEST PRIORITY)
    character_consistency: str = Field(
        default="THE SAME PERSON must appear in EVERY frame, scene, and shot. "
                "This is not a suggestion - it is an absolute requirement. "
                "Match the character reference images EXACTLY: same face, same features, same person."
    )
    character_consistency_prohibited: str = Field(
        default="NEVER change the person's face between scenes. NEVER substitute a different person. "
                "NEVER alter their ethnicity, age, gender, or fundamental facial features. "
                "NEVER generate a 'similar looking' person - it must be THE EXACT SAME INDIVIDUAL."
    )

    # Skin requirements
    skin_texture: str = Field(
        default="Natural skin with visible pores, subtle imperfections, and realistic subsurface scattering. "
                "Minor blemishes, natural color variations, and authentic shadows under eyes and around nose. "
                "MUST match the exact skin tone from character reference images."
    )
    skin_prohibited: str = Field(
        default="NO waxy, plastic, or airbrushed appearance. NO uncanny valley smoothness. "
                "NO perfectly even skin tone. NO doll-like perfection. "
                "NO changing skin tone from reference images."
    )

    # Face requirements
    face_structure: str = Field(
        default="Natural facial asymmetry (real humans are not perfectly symmetrical). "
                "Realistic eye moisture and reflections. Natural lip texture. "
                "Authentic micro-expressions and natural blinks. "
                "MUST maintain IDENTICAL facial features across all generations."
    )
    face_prohibited: str = Field(
        default="NO perfectly symmetrical features. NO doll-like proportions. "
                "NO unnaturally large eyes. NO plastic-looking features. "
                "NO changing face shape, eye shape, nose, or lips from reference."
    )

    # Hand requirements (CRITICAL for AI)
    hands: str = Field(
        default="EXACTLY 5 fingers per hand. Natural finger proportions and positions. "
                "Realistic nail beds and knuckles. Natural hand poses."
    )
    hands_prohibited: str = Field(
        default="NO extra fingers. NO merged fingers. NO impossible hand poses. "
                "NO missing fingers. NO abnormal finger lengths."
    )

    # Environment requirements
    environment: str = Field(
        default="Lived-in, authentic spaces with natural clutter and personal items. "
                "Realistic material textures. Appropriate depth of field. "
                "Natural lighting interaction with environment."
    )
    environment_prohibited: str = Field(
        default="NO sterile, empty backgrounds. NO obviously generated patterns. "
                "NO impossible architecture. NO floating objects."
    )

    # Product requirements
    product_fidelity: str = Field(
        default="EXACT match to provided reference images. Correct text/branding reproduction. "
                "Accurate material representation. Proper scale relative to hands/body."
    )
    product_prohibited: str = Field(
        default="NO invented product details. NO text alterations or additions. "
                "NO color shifts from reference. NO size distortions."
    )

    # Text overlay prohibition
    text_overlay: str = Field(
        default="DO NOT generate any on-screen text, captions, subtitles, or text overlays. "
                "DO NOT add watermarks, timestamps, or UI elements. "
                "Text on products only (from reference images)."
    )


class ProductionBible(BaseModel):
    """The complete Production Bible - source of truth for all generation.

    This document is created ONCE at the start of generation and used
    consistently across all subsequent generations.
    """

    # Core DNA
    product_dna: ProductDNA = Field(description="Visual DNA of the product")
    avatar_dna: AvatarDNA | None = Field(default=None, description="Character DNA if using avatar")

    # Style and format
    style_config: StyleConfig = Field(description="Video style configuration")
    creative_brief: CreativeBrief = Field(description="Expanded creative brief")

    # Technical settings
    camera_language: CameraLanguage = Field(
        default_factory=CameraLanguage,
        description="Camera settings"
    )
    lighting_bible: LightingBible = Field(
        default_factory=LightingBible,
        description="Lighting settings"
    )

    # Critical rules
    realism_rules: RealismRules = Field(
        default_factory=RealismRules,
        description="Realism requirements"
    )

    # Assembled master prompt (generated from all above)
    master_prompt: str = Field(
        default="",
        description="The complete assembled prompt used for all generations"
    )

    def assemble_master_prompt(self) -> str:
        """Assemble the complete master prompt from all components."""
        sections = []

        # Header
        sections.append("=" * 60)
        sections.append("PRODUCTION BIBLE - IMMUTABLE REFERENCE")
        sections.append("=" * 60)

        # Product DNA
        sections.append("\n## PRODUCT DNA")
        sections.append(f"Type: {self.product_dna.product_type}")
        if self.product_dna.product_name:
            sections.append(f"Name: {self.product_dna.product_name}")
        sections.append(f"Colors: Primary={self.product_dna.colors.primary}")
        if self.product_dna.colors.secondary:
            sections.append(f"        Secondary={self.product_dna.colors.secondary}")
        sections.append(f"Shape: {self.product_dna.shape}")
        sections.append(f"Materials: {', '.join(self.product_dna.materials)}")
        if self.product_dna.texture:
            sections.append(f"Texture: {self.product_dna.texture}")
        sections.append(f"Size: {self.product_dna.size_category}")
        sections.append(f"\nVisual Description: {self.product_dna.visual_description}")
        if self.product_dna.distinctive_features:
            sections.append(f"Distinctive Features: {', '.join(self.product_dna.distinctive_features)}")

        # Avatar DNA (if present) - CHARACTER IDENTITY LOCK
        if self.avatar_dna:
            sections.append("\n" + "=" * 60)
            sections.append("## ⚠️ CHARACTER IDENTITY - LOCKED (DO NOT CHANGE)")
            sections.append("=" * 60)
            sections.append("This is a SPECIFIC PERSON. The SAME individual must appear")
            sections.append("in EVERY scene, EVERY frame, EVERY generation.")
            sections.append("")
            sections.append("IMMUTABLE IDENTITY ATTRIBUTES:")
            gender = getattr(self.avatar_dna, 'gender', '') or ''
            ethnicity = getattr(self.avatar_dna, 'ethnicity', '') or 'as shown in reference'
            age_range = getattr(self.avatar_dna, 'age_range', '') or 'as shown in reference'
            if gender:
                sections.append(f"- Gender: {gender} (LOCKED)")
            if ethnicity:
                sections.append(f"- Ethnicity: {ethnicity} (LOCKED)")
            if age_range:
                sections.append(f"- Age Range: {age_range} (LOCKED)")
            sections.append("")
            sections.append("FACE IDENTITY (MUST BE IDENTICAL IN ALL GENERATIONS):")
            sections.append(f"- Face Structure: {self.avatar_dna.face}")
            sections.append(f"- Eyes: {self.avatar_dna.eyes}")
            sections.append(f"- Skin: {self.avatar_dna.skin}")
            sections.append(f"- Hair: {self.avatar_dna.hair}")
            sections.append("")
            sections.append("BODY & WARDROBE:")
            sections.append(f"- Body Type: {self.avatar_dna.body}")
            sections.append(f"- Wardrobe: {self.avatar_dna.wardrobe}")
            sections.append("")
            sections.append("CONSISTENCY REQUIREMENT:")
            sections.append("- Would someone looking at all scenes recognize this as THE SAME PERSON?")
            sections.append("- If NO, regenerate until character identity is consistent")
            if self.avatar_dna.prohibited_drift:
                sections.append("")
                sections.append(f"❌ ABSOLUTELY PROHIBITED: {self.avatar_dna.prohibited_drift}")
                sections.append("❌ NEVER change face shape, skin tone, or ethnic features")
                sections.append("❌ NEVER substitute a different person between scenes")

        # Style
        sections.append("\n## STYLE GUIDE")
        sections.append(f"Platform: {self.style_config.platform.value}")
        sections.append(f"Duration: {self.style_config.duration_seconds} seconds")
        sections.append(f"Style: {self.style_config.style.value}")
        sections.append(f"Tone: {self.style_config.tone.value}")
        sections.append(f"Pacing: {self.style_config.pacing}")

        # Language directive
        if self.style_config.language and self.style_config.language != "en":
            lang_names = {
                "hi": "Hindi (Devanagari script)", "ta": "Tamil (Tamil script)",
                "te": "Telugu (Telugu script)", "bn": "Bengali (Bengali script)",
                "mr": "Marathi (Devanagari script)", "gu": "Gujarati (Gujarati script)",
                "kn": "Kannada (Kannada script)", "pa": "Punjabi (Gurmukhi script)",
                "ml": "Malayalam (Malayalam script)",
            }
            lang_name = lang_names.get(self.style_config.language, self.style_config.language)
            sections.append("\n## LANGUAGE DIRECTIVE")
            sections.append(f"ALL dialogue MUST be written in {lang_name}.")
            sections.append(f"Use natural, conversational {lang_name} — NOT translated English.")
            sections.append("Keep product names and brand names in English/original form.")

        # Camera
        sections.append("\n## CAMERA LANGUAGE")
        sections.append(f"Body: {self.camera_language.body.value}")
        sections.append(f"Default Shot: {self.camera_language.default_shot.value}")
        sections.append(f"Default Angle: {self.camera_language.default_angle.value}")
        sections.append(f"Movement: {self.camera_language.default_movement.value}")
        sections.append(f"Lens: {self.camera_language.lens_mm}mm equivalent")
        sections.append(f"Handheld: {self.camera_language.handheld_intensity}")

        # Lighting
        sections.append("\n## LIGHTING BIBLE")
        sections.append(f"Setup: {self.lighting_bible.setup.value}")
        sections.append(f"Direction: {self.lighting_bible.direction.value}")
        sections.append(f"Color Temp: {self.lighting_bible.color_temp_kelvin}K")
        sections.append(f"Key Intensity: {self.lighting_bible.key_intensity}")
        sections.append(f"Mood: {self.lighting_bible.mood}")

        # Realism Rules (CRITICAL)
        sections.append("\n## REALISM REQUIREMENTS - STRICTLY ENFORCE")

        sections.append("\n### ⚠️ CHARACTER CONSISTENCY (HIGHEST PRIORITY)")
        sections.append(self.realism_rules.character_consistency)
        sections.append(f"PROHIBITED: {self.realism_rules.character_consistency_prohibited}")

        sections.append("\n### SKIN")
        sections.append(self.realism_rules.skin_texture)
        sections.append(f"PROHIBITED: {self.realism_rules.skin_prohibited}")

        sections.append("\n### FACE")
        sections.append(self.realism_rules.face_structure)
        sections.append(f"PROHIBITED: {self.realism_rules.face_prohibited}")

        sections.append("\n### HANDS (CRITICAL)")
        sections.append(self.realism_rules.hands)
        sections.append(f"PROHIBITED: {self.realism_rules.hands_prohibited}")

        sections.append("\n### ENVIRONMENT")
        sections.append(self.realism_rules.environment)
        sections.append(f"PROHIBITED: {self.realism_rules.environment_prohibited}")

        sections.append("\n### PRODUCT FIDELITY")
        sections.append(self.realism_rules.product_fidelity)
        sections.append(f"PROHIBITED: {self.realism_rules.product_prohibited}")

        sections.append("\n### TEXT/CAPTIONS")
        sections.append(self.realism_rules.text_overlay)

        sections.append("\n" + "=" * 60)

        self.master_prompt = "\n".join(sections)
        return self.master_prompt
