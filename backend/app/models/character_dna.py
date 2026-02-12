"""Comprehensive Character DNA Model for Consistent Character Generation.

Based on best practices from AI image generation research:
- Detailed physical attributes for visual consistency
- Personality traits for authentic expressions
- Style signatures for wardrobe continuity
- Prohibited drift to prevent unwanted changes

Reference: https://robotbuilders.net/prompt-formulas-for-consistent-character-generation-in-ai/
"""

from pydantic import BaseModel, Field
from enum import Enum


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    NON_BINARY = "non_binary"


class AgeRange(str, Enum):
    CHILD = "child"  # 5-12
    TEEN = "teenager"  # 13-19
    YOUNG_ADULT = "young_adult"  # 20-29
    ADULT = "adult"  # 30-45
    MIDDLE_AGED = "middle_aged"  # 46-60
    SENIOR = "senior"  # 60+


class BodyType(str, Enum):
    SLIM = "slim"
    AVERAGE = "average"
    ATHLETIC = "athletic"
    MUSCULAR = "muscular"
    CURVY = "curvy"
    PLUS_SIZE = "plus_size"


class FaceShape(str, Enum):
    OVAL = "oval"
    ROUND = "round"
    SQUARE = "square"
    HEART = "heart"
    OBLONG = "oblong"
    DIAMOND = "diamond"


class SkinTone(str, Enum):
    FAIR = "fair"
    LIGHT = "light"
    LIGHT_MEDIUM = "light_medium"
    MEDIUM = "medium"
    MEDIUM_TAN = "medium_tan"
    TAN = "tan"
    DARK = "dark"
    DEEP = "deep"


class HairType(str, Enum):
    STRAIGHT = "straight"
    WAVY = "wavy"
    CURLY = "curly"
    COILY = "coily"
    KINKY = "kinky"


class HairLength(str, Enum):
    BALD = "bald"
    BUZZ = "buzz_cut"
    SHORT = "short"
    MEDIUM = "medium"
    SHOULDER = "shoulder_length"
    LONG = "long"
    VERY_LONG = "very_long"


# ============================================================================
# Detailed DNA Components
# ============================================================================

class FacialFeatures(BaseModel):
    """Detailed facial structure for consistency."""

    face_shape: FaceShape = Field(description="Overall face shape")
    forehead: str = Field(default="average", description="high, average, low, broad, narrow")
    eyebrows: str = Field(description="Shape, thickness, arch: e.g., 'thick arched dark eyebrows'")
    eyes: str = Field(description="Shape, size, color, spacing: e.g., 'large almond-shaped brown eyes, slightly wide-set'")
    nose: str = Field(description="Shape, size: e.g., 'straight medium nose with rounded tip'")
    cheekbones: str = Field(default="medium", description="high, medium, low, prominent, subtle")
    lips: str = Field(description="Shape, fullness: e.g., 'full lips with defined cupid's bow'")
    chin: str = Field(default="rounded", description="rounded, pointed, square, cleft")
    jaw: str = Field(description="Shape: e.g., 'soft jawline' or 'defined angular jaw'")


class SkinDetails(BaseModel):
    """Skin appearance for realistic rendering."""

    tone: SkinTone = Field(description="Base skin tone")
    undertone: str = Field(default="neutral", description="warm, cool, neutral, olive")
    texture: str = Field(default="smooth with natural pores", description="Skin texture description")
    conditions: list[str] = Field(
        default_factory=list,
        description="Natural features: freckles, moles, beauty marks, etc."
    )
    imperfections: str = Field(
        default="subtle natural imperfections",
        description="For realism: minor blemishes, natural shadows"
    )


class HairDetails(BaseModel):
    """Hair characteristics for consistency."""

    color: str = Field(description="Primary hair color: e.g., 'dark brown with subtle auburn highlights'")
    type: HairType = Field(description="Hair texture type")
    length: HairLength = Field(description="Hair length")
    style: str = Field(description="Current style: e.g., 'layered with side-swept bangs'")
    volume: str = Field(default="medium", description="thin, medium, thick, voluminous")
    condition: str = Field(default="healthy, natural shine", description="Hair condition for realism")


class BodyStructure(BaseModel):
    """Body proportions and build."""

    type: BodyType = Field(description="Overall body type")
    height: str = Field(description="Height description: e.g., '5\\'6\" (167cm), average height'")
    build: str = Field(description="Detailed build: e.g., 'lean with subtle muscle definition'")
    shoulders: str = Field(default="proportionate", description="narrow, average, broad")
    posture: str = Field(default="natural, relaxed", description="Default posture")


class StyleSignature(BaseModel):
    """Wardrobe and aesthetic preferences."""

    aesthetic: str = Field(
        description="Overall style: e.g., 'casual streetwear with minimalist touches'"
    )
    color_palette: list[str] = Field(
        description="Preferred colors: e.g., ['earth tones', 'cream', 'sage green', 'rust']"
    )
    typical_top: str = Field(
        description="Default upper body clothing: e.g., 'oversized cotton t-shirts or fitted sweaters'"
    )
    typical_bottom: str = Field(
        description="Default lower body clothing: e.g., 'high-waisted jeans or wide-leg trousers'"
    )
    footwear: str = Field(
        description="Typical shoes: e.g., 'white sneakers or ankle boots'"
    )
    accessories: list[str] = Field(
        default_factory=list,
        description="Signature items: e.g., ['delicate gold necklace', 'simple stud earrings']"
    )
    makeup_style: str | None = Field(
        default=None,
        description="If applicable: e.g., 'natural makeup with subtle lip tint'"
    )


class VoiceProfile(BaseModel):
    """Voice characteristics for audio generation."""

    pitch: str = Field(default="medium", description="low, medium-low, medium, medium-high, high")
    tone: str = Field(description="warm, crisp, husky, bright, soft, authoritative")
    pace: str = Field(default="natural", description="slow, measured, natural, quick, energetic")
    accent: str | None = Field(default=None, description="Regional accent if any")
    quirks: list[str] = Field(
        default_factory=list,
        description="Speech patterns: e.g., ['slight vocal fry', 'tends to trail off']"
    )


class PersonalityTraits(BaseModel):
    """Personality for authentic expressions and mannerisms."""

    primary_traits: list[str] = Field(
        description="3-5 core traits: e.g., ['confident', 'warm', 'curious', 'slightly sarcastic']"
    )
    energy_level: str = Field(default="moderate", description="calm, moderate, energetic, bubbly")
    default_expression: str = Field(
        description="Resting expression: e.g., 'friendly with hint of mischief'"
    )
    smile_type: str = Field(
        description="How they smile: e.g., 'wide genuine smile showing teeth, eyes crinkle'"
    )
    mannerisms: list[str] = Field(
        default_factory=list,
        description="Physical habits: e.g., ['tilts head when listening', 'talks with hands']"
    )


class ProhibitedDrift(BaseModel):
    """Elements that must NEVER change for consistency."""

    facial_features: list[str] = Field(
        default_factory=lambda: [
            "eye color must remain constant",
            "face shape cannot change",
            "nose structure stays the same",
        ],
        description="Facial elements locked"
    )
    body_features: list[str] = Field(
        default_factory=lambda: [
            "body type remains consistent",
            "height proportions stay same",
        ],
        description="Body elements locked"
    )
    distinctive_marks: list[str] = Field(
        default_factory=list,
        description="Permanent features: e.g., ['mole on left cheek stays', 'no new tattoos']"
    )
    style_constraints: list[str] = Field(
        default_factory=list,
        description="Style locks: e.g., ['no dramatic hair color changes', 'no heavy makeup']"
    )
    absolute_prohibitions: list[str] = Field(
        default_factory=lambda: [
            "NO extra fingers or limbs",
            "NO melted or distorted features",
            "NO asymmetrical eyes (beyond natural)",
            "NO plastic or waxy skin",
            "NO AI artifacts",
        ],
        description="Hard rules for AI generation"
    )


# ============================================================================
# Complete Character DNA
# ============================================================================

class CharacterDNA(BaseModel):
    """Complete Character DNA for consistent generation across all media.

    This comprehensive model ensures character consistency in:
    - Image generation (storyboards, thumbnails)
    - Video generation (motion, expressions)
    - Audio generation (voice, tone)

    Usage:
        Include the full DNA prompt block with every generation request.
        Reference specific sections as needed for different media types.
    """

    # Identity
    name: str = Field(description="Character name for reference")
    gender: Gender = Field(description="Character gender")
    age_range: AgeRange = Field(description="Age category")
    age_specific: str | None = Field(default=None, description="Specific age if needed: e.g., '27 years old'")
    ethnicity: str = Field(description="Ethnic background for accurate representation")

    # Physical
    facial_features: FacialFeatures = Field(description="Detailed face structure")
    skin: SkinDetails = Field(description="Skin characteristics")
    hair: HairDetails = Field(description="Hair details")
    body: BodyStructure = Field(description="Body structure")

    # Style
    style: StyleSignature = Field(description="Wardrobe and aesthetic")

    # Voice (for audio)
    voice: VoiceProfile = Field(description="Voice characteristics")

    # Personality (for expressions)
    personality: PersonalityTraits = Field(description="Personality traits")

    # Consistency locks
    prohibited_drift: ProhibitedDrift = Field(
        default_factory=ProhibitedDrift,
        description="What must never change"
    )

    # Unique identifiers
    generation_id: str | None = Field(
        default=None,
        description="Reference ID from a successful generation for style locking"
    )

    def to_image_prompt(self) -> str:
        """Generate the image prompt block for this character."""
        lines = [
            "=" * 50,
            "CHARACTER DNA - STRICT CONSISTENCY REQUIRED",
            "=" * 50,
            "",
            f"NAME: {self.name}",
            f"IDENTITY: {self.age_range.value} {self.gender.value}, {self.ethnicity}",
            "",
            "FACE:",
            f"  Shape: {self.facial_features.face_shape.value}",
            f"  Forehead: {self.facial_features.forehead}",
            f"  Eyebrows: {self.facial_features.eyebrows}",
            f"  Eyes: {self.facial_features.eyes}",
            f"  Nose: {self.facial_features.nose}",
            f"  Cheekbones: {self.facial_features.cheekbones}",
            f"  Lips: {self.facial_features.lips}",
            f"  Chin: {self.facial_features.chin}",
            f"  Jaw: {self.facial_features.jaw}",
            "",
            "SKIN:",
            f"  Tone: {self.skin.tone.value} with {self.skin.undertone} undertone",
            f"  Texture: {self.skin.texture}",
            f"  Features: {', '.join(self.skin.conditions) if self.skin.conditions else 'clear'}",
            f"  Realism: {self.skin.imperfections}",
            "",
            "HAIR:",
            f"  Color: {self.hair.color}",
            f"  Type: {self.hair.type.value}, {self.hair.length.value}",
            f"  Style: {self.hair.style}",
            f"  Volume: {self.hair.volume}",
            "",
            "BODY:",
            f"  Type: {self.body.type.value}",
            f"  Height: {self.body.height}",
            f"  Build: {self.body.build}",
            f"  Shoulders: {self.body.shoulders}",
            f"  Posture: {self.body.posture}",
            "",
            "STYLE:",
            f"  Aesthetic: {self.style.aesthetic}",
            f"  Colors: {', '.join(self.style.color_palette)}",
            f"  Top: {self.style.typical_top}",
            f"  Bottom: {self.style.typical_bottom}",
            f"  Footwear: {self.style.footwear}",
        ]

        if self.style.accessories:
            lines.append(f"  Accessories: {', '.join(self.style.accessories)}")

        if self.style.makeup_style:
            lines.append(f"  Makeup: {self.style.makeup_style}")

        lines.extend([
            "",
            "EXPRESSION:",
            f"  Default: {self.personality.default_expression}",
            f"  Smile: {self.personality.smile_type}",
            f"  Energy: {self.personality.energy_level}",
        ])

        if self.personality.mannerisms:
            lines.append(f"  Mannerisms: {', '.join(self.personality.mannerisms)}")

        lines.extend([
            "",
            "PROHIBITED - NEVER GENERATE:",
        ])
        for prohibition in self.prohibited_drift.absolute_prohibitions:
            lines.append(f"  - {prohibition}")

        lines.append("")
        lines.append("=" * 50)

        return "\n".join(lines)

    def to_voice_prompt(self) -> str:
        """Generate the voice prompt block for audio generation."""
        lines = [
            f"VOICE PROFILE: {self.name}",
            f"Pitch: {self.voice.pitch}",
            f"Tone: {self.voice.tone}",
            f"Pace: {self.voice.pace}",
        ]

        if self.voice.accent:
            lines.append(f"Accent: {self.voice.accent}")

        if self.voice.quirks:
            lines.append(f"Quirks: {', '.join(self.voice.quirks)}")

        lines.extend([
            "",
            f"Personality: {', '.join(self.personality.primary_traits)}",
            f"Energy: {self.personality.energy_level}",
        ])

        return "\n".join(lines)


# ============================================================================
# Preset Characters
# ============================================================================

PRESET_CHARACTERS = {
    "sarah": CharacterDNA(
        name="Sarah",
        gender=Gender.FEMALE,
        age_range=AgeRange.YOUNG_ADULT,
        age_specific="26 years old",
        ethnicity="Caucasian American",
        facial_features=FacialFeatures(
            face_shape=FaceShape.OVAL,
            forehead="average height",
            eyebrows="natural arch, medium thickness, dark brown",
            eyes="large almond-shaped brown eyes, warm and expressive, natural lashes",
            nose="straight with slightly rounded tip, proportionate",
            cheekbones="naturally high, subtle definition",
            lips="full with defined cupid's bow, natural pink",
            chin="softly rounded",
            jaw="soft feminine jawline",
        ),
        skin=SkinDetails(
            tone=SkinTone.LIGHT,
            undertone="warm",
            texture="smooth with visible natural pores",
            conditions=["light freckles across nose bridge"],
            imperfections="subtle under-eye shadows, natural skin texture",
        ),
        hair=HairDetails(
            color="warm brown with subtle caramel highlights",
            type=HairType.WAVY,
            length=HairLength.SHOULDER,
            style="soft layers, often worn loose with natural movement",
            volume="medium-full",
            condition="healthy with natural shine",
        ),
        body=BodyStructure(
            type=BodyType.AVERAGE,
            height="5'6\" (167cm)",
            build="lean with soft curves",
            shoulders="proportionate, slightly narrow",
            posture="relaxed, approachable",
        ),
        style=StyleSignature(
            aesthetic="casual-chic, approachable everyday style",
            color_palette=["cream", "sage green", "soft pink", "denim blue", "camel"],
            typical_top="fitted t-shirts, cozy sweaters, simple blouses",
            typical_bottom="high-waisted jeans, casual trousers",
            footwear="white sneakers, ankle boots, simple flats",
            accessories=["delicate gold chain necklace", "small hoop earrings"],
            makeup_style="natural 'no-makeup makeup' - light coverage, mascara, tinted lip balm",
        ),
        voice=VoiceProfile(
            pitch="medium",
            tone="warm and friendly, slightly breathy",
            pace="natural with enthusiastic moments",
            accent=None,
            quirks=["slight uptalk when excited", "genuine laugh"],
        ),
        personality=PersonalityTraits(
            primary_traits=["warm", "genuine", "curious", "relatable", "enthusiastic"],
            energy_level="moderate-high",
            default_expression="warm smile with engaged eyes",
            smile_type="genuine wide smile, eyes crinkle at corners",
            mannerisms=["tilts head when listening", "uses hands when explaining", "nods encouragingly"],
        ),
    ),

    "marcus": CharacterDNA(
        name="Marcus",
        gender=Gender.MALE,
        age_range=AgeRange.ADULT,
        age_specific="32 years old",
        ethnicity="African American",
        facial_features=FacialFeatures(
            face_shape=FaceShape.SQUARE,
            forehead="medium height, slightly broad",
            eyebrows="thick, well-groomed, natural arch",
            eyes="deep brown eyes, confident gaze, strong brow line",
            nose="broad with rounded tip, distinguished",
            cheekbones="prominent, well-defined",
            lips="full, well-shaped",
            chin="strong, squared",
            jaw="defined angular jawline",
        ),
        skin=SkinDetails(
            tone=SkinTone.MEDIUM,
            undertone="warm",
            texture="smooth with natural pores",
            conditions=[],
            imperfections="natural skin texture, subtle expression lines around eyes",
        ),
        hair=HairDetails(
            color="black",
            type=HairType.COILY,
            length=HairLength.BUZZ,
            style="clean fade, well-maintained",
            volume="natural",
            condition="healthy, well-groomed",
        ),
        body=BodyStructure(
            type=BodyType.ATHLETIC,
            height="6'0\" (183cm)",
            build="athletic, broad shoulders, lean muscle",
            shoulders="broad",
            posture="confident, upright",
        ),
        style=StyleSignature(
            aesthetic="clean minimalist, modern professional",
            color_palette=["black", "white", "navy", "grey", "earth tones"],
            typical_top="fitted crew neck t-shirts, casual button-downs, quality hoodies",
            typical_bottom="slim-fit chinos, dark jeans, joggers",
            footwear="clean white sneakers, minimalist leather shoes",
            accessories=["simple watch", "occasional thin gold chain"],
            makeup_style=None,
        ),
        voice=VoiceProfile(
            pitch="low-medium",
            tone="deep, warm, authoritative yet approachable",
            pace="measured, deliberate",
            accent=None,
            quirks=["slight pause for emphasis", "smooth confident delivery"],
        ),
        personality=PersonalityTraits(
            primary_traits=["confident", "knowledgeable", "calm", "trustworthy", "articulate"],
            energy_level="moderate",
            default_expression="calm confidence with slight smile",
            smile_type="controlled warm smile, maintains eye contact",
            mannerisms=["nods thoughtfully", "gestures deliberately", "maintains steady eye contact"],
        ),
    ),

    "priya": CharacterDNA(
        name="Priya",
        gender=Gender.FEMALE,
        age_range=AgeRange.YOUNG_ADULT,
        age_specific="24 years old",
        ethnicity="South Asian (Indian)",
        facial_features=FacialFeatures(
            face_shape=FaceShape.OVAL,
            forehead="smooth, medium height",
            eyebrows="naturally thick, well-shaped, dark",
            eyes="large expressive dark brown eyes, thick natural lashes, slightly upturned",
            nose="delicate, straight with soft tip",
            cheekbones="high, elegant",
            lips="full, natural rose-brown color",
            chin="delicate, softly pointed",
            jaw="soft feminine jawline",
        ),
        skin=SkinDetails(
            tone=SkinTone.MEDIUM_TAN,
            undertone="warm olive",
            texture="smooth, naturally glowing",
            conditions=["natural beauty mark near left eye"],
            imperfections="natural skin texture",
        ),
        hair=HairDetails(
            color="deep black with natural shine",
            type=HairType.STRAIGHT,
            length=HairLength.LONG,
            style="sleek and straight, sometimes in loose waves, often worn open",
            volume="thick, luxurious",
            condition="healthy, glossy",
        ),
        body=BodyStructure(
            type=BodyType.SLIM,
            height="5'4\" (162cm)",
            build="petite, graceful",
            shoulders="narrow, delicate",
            posture="elegant, poised",
        ),
        style=StyleSignature(
            aesthetic="elegant casual, soft and feminine with occasional bold accents",
            color_palette=["soft pink", "cream", "emerald", "gold", "burgundy"],
            typical_top="flowy blouses, fitted tops, elegant knitwear",
            typical_bottom="high-waisted skirts, tailored pants, flowy dresses",
            footwear="strappy sandals, elegant heels, embellished flats",
            accessories=["statement earrings", "delicate bangles", "occasional bindi"],
            makeup_style="glowing skin, defined brows, subtle eye makeup, berry lip tint",
        ),
        voice=VoiceProfile(
            pitch="medium-high",
            tone="melodic, warm, gentle with bright moments",
            pace="flowing, expressive",
            accent="subtle Indian English influence",
            quirks=["musical quality to speech", "warm genuine laugh"],
        ),
        personality=PersonalityTraits(
            primary_traits=["graceful", "warm", "expressive", "genuine", "elegant"],
            energy_level="moderate",
            default_expression="soft warm smile, inviting eyes",
            smile_type="gentle radiant smile, dimples appear",
            mannerisms=["graceful hand movements", "slight head tilt", "expressive eyes"],
        ),
    ),
}
