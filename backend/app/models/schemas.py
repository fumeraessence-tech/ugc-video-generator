from pydantic import BaseModel, Field
from enum import Enum


# ─── Enums ─────────────────────────────────────────────────────────


class SceneType(str, Enum):
    """Types of video scenes."""

    intro = "intro"
    hook = "hook"
    problem = "problem"
    solution = "solution"
    demonstration = "demonstration"
    unboxing = "unboxing"
    application = "application"
    testimonial = "testimonial"
    cta = "cta"


class ProductVisibility(str, Enum):
    """Product prominence in scene."""

    primary = "primary"
    secondary = "secondary"
    background = "background"
    none = "none"


class BackgroundSetting(str, Enum):
    """Background environment presets."""

    modern_bedroom = "modern_bedroom"
    kitchen = "kitchen"
    office = "office"
    car = "car"
    outdoor = "outdoor"
    custom = "custom"


class Platform(str, Enum):
    """Target platform for video."""

    instagram_reels = "instagram_reels"
    tiktok = "tiktok"
    youtube_shorts = "youtube_shorts"
    general = "general"


class ReferenceAngle(str, Enum):
    """Reference image angle classifications."""

    front = "front"
    left_profile = "left_profile"
    right_profile = "right_profile"
    back = "back"
    three_quarter_left = "three_quarter_left"
    three_quarter_right = "three_quarter_right"


# ─── Camera & Lighting Models ──────────────────────────────────────


class CameraSetup(BaseModel):
    """Professional camera configuration."""

    body: str = "ARRI Alexa Mini"  # Camera body
    lens: str = "35mm f/1.8"  # Lens specification
    shot_type: str = "medium_close_up"  # wide, full, medium, close_up, extreme_close_up
    angle: str = "eye_level"  # eye_level, high, low, dutch, overhead
    movement: str = "static"  # static, pan, tilt, dolly, tracking, handheld
    focus: str = "subject"  # subject, product, background, rack_focus


class LightingSetup(BaseModel):
    """Professional lighting configuration."""

    type: str = "three_point"  # natural, three_point, rembrandt, butterfly, split, rim
    direction: str = "front_45"  # front, front_45, side, side_45, back, top, bottom
    color_temp: int = 5600  # Kelvin (2700-7000)
    key_intensity: str = "soft"  # soft, medium, hard
    fill_intensity: str = "low"  # none, low, medium, high
    rim_intensity: str = "medium"  # none, low, medium, high


# ─── Script Models ─────────────────────────────────────────────────


class ScriptScene(BaseModel):
    """A single scene within a video script."""

    scene_number: int
    scene_type: SceneType = SceneType.demonstration
    location: str
    description: str
    dialogue: str
    word_count: int
    duration_seconds: float
    visual_description: str = ""
    character_action: str = ""
    camera_setup: CameraSetup = Field(default_factory=CameraSetup)
    lighting_setup: LightingSetup = Field(default_factory=LightingSetup)
    product_visibility: ProductVisibility = ProductVisibility.none
    background_setting: BackgroundSetting = BackgroundSetting.modern_bedroom
    camera_notes: str = ""


class Script(BaseModel):
    """A complete video script with scenes."""

    title: str
    scenes: list[ScriptScene]
    total_duration: float
    total_words: int = 0
    style_notes: str = ""


class GenerationRequest(BaseModel):
    """Request to generate a UGC video."""

    job_id: str | None = None  # Optional frontend job ID
    prompt: str
    avatar_id: str | None = None
    avatar_dna: dict | None = None  # Avatar DNA for character consistency in prompts
    avatar_reference_images: list[str] = Field(default_factory=list)  # Avatar images for storyboard base
    product_name: str | None = None
    product_images: list[str] = Field(default_factory=list)
    background_setting: str | BackgroundSetting = "modern_bedroom"
    platform: str | Platform = "instagram_reels"
    style: str | None = None
    duration: int = 30
    aspect_ratio: str = "9:16"
    max_scene_duration: int = 8  # Gemini 8-second constraint
    words_per_minute: int = 150  # Natural Indian English pace
    auto_approve: bool = True  # Automatically approve storyboard (skip manual review)


class GenerationResponse(BaseModel):
    """Response after submitting a generation request."""

    job_id: str
    status: str
    message: str


class JobProgress(BaseModel):
    """Real-time progress update for a running job."""

    job_id: str
    status: str
    current_step: str
    progress: int = Field(ge=0, le=100)
    message: str
    data: dict | None = None


class AvatarDNA(BaseModel):
    """Complete physical and stylistic DNA for an avatar character."""

    gender: str = ""  # FEMALE or MALE - explicit gender for consistency
    face: str = ""
    skin: str = ""
    eyes: str = ""
    hair: str = ""
    body: str = ""
    voice: str = ""
    wardrobe: str = ""
    prohibited_drift: str = ""
    ethnicity: str = ""  # Ethnic appearance for consistency
    age_range: str = ""  # Age range for consistency
    detailed_description: str = ""  # Comprehensive physical description
    facial_features: str = ""  # Specific facial features for consistency
    reference_images_by_angle: dict[str, str] = Field(default_factory=dict)  # angle -> URL
    angle_coverage: dict[str, bool] = Field(default_factory=dict)  # angle -> covered


# ─── Storyboard Models ─────────────────────────────────────────────


class StoryboardFrame(BaseModel):
    """A single storyboard image variant."""

    scene_number: int | str
    variant_number: int
    image_url: str
    seed: int | None = None
    consistency_score: float = 0.0  # 0-100 score
    prompt: str | None = None  # The prompt used to generate this image


class StoryboardScene(BaseModel):
    """Storyboard for a single scene with variants."""

    scene_number: int | str
    variants: list[StoryboardFrame]
    selected_variant: int | None = None  # 1-4
    image_url: str | None = None  # Convenience field for selected/primary image
    prompt: str | None = None  # The prompt used for this scene


class Storyboard(BaseModel):
    """Complete storyboard with all scenes."""

    scenes: list[StoryboardScene]


# ─── Video Models ──────────────────────────────────────────────────


class VideoScene(BaseModel):
    """A single generated video scene."""

    scene_number: int
    video_url: str
    first_frame_url: str | None = None
    last_frame_url: str | None = None
    duration: float = 0.0


class VideoGeneration(BaseModel):
    """Complete video generation result."""

    video_scenes: list[VideoScene]
    final_video_url: str | None = None
    total_duration: float = 0.0


class AvatarCreate(BaseModel):
    """Request to create a new custom avatar."""

    name: str
    tag: str
    dna: AvatarDNA
    reference_images: list[str] = Field(default_factory=list)


class AvatarResponse(BaseModel):
    """Avatar detail response."""

    id: str
    name: str
    tag: str
    unique_identifier: str = ""
    thumbnail_url: str = ""
    is_system: bool = False
    dna: AvatarDNA
    reference_images: list[str] = Field(default_factory=list)
    reference_angles: dict[str, str] = Field(default_factory=dict)
    angle_coverage: dict[str, bool] = Field(default_factory=dict)


# ─── Regeneration Models ──────────────────────────────────────────


class RegenerateSceneRequest(BaseModel):
    """Request to regenerate a single storyboard scene."""

    job_id: str
    scene_number: int
    updated_scene: ScriptScene | None = None  # Updated scene data (if script was edited)
    avatar_data: dict | None = None
    avatar_reference_images: list[str] = Field(default_factory=list)
    product_images: list[str] = Field(default_factory=list)
    product_name: str | None = None
    api_key: str | None = None
    aspect_ratio: str = "9:16"


class RegenerateAllRequest(BaseModel):
    """Request to regenerate all storyboard scenes from an updated script."""

    job_id: str
    updated_script: Script
    avatar_data: dict | None = None
    avatar_reference_images: list[str] = Field(default_factory=list)
    product_images: list[str] = Field(default_factory=list)
    product_name: str | None = None
    api_key: str | None = None
    aspect_ratio: str = "9:16"


class QualityGateDecision(BaseModel):
    """User decision at a quality gate checkpoint."""

    job_id: str
    decision: str  # "accept", "regenerate_outliers", "regenerate_all", "add_references"
    scene_numbers: list[int] = Field(default_factory=list)  # Scenes to regenerate (if applicable)
    additional_images: list[str] = Field(default_factory=list)  # New reference images


class RegenerateStageRequest(BaseModel):
    """Request to regenerate a specific pipeline stage."""

    job_id: str
    stage: str  # "storyboard", "video", "audio"
    scene_numbers: list[int] = Field(default_factory=list)  # Specific scenes, or empty for all


# ─── Perfume Studio Models ────────────────────────────────────────


class PerfumeStyle(str, Enum):
    """Perfume product photography styles."""

    white_background = "white_background"
    notes_based = "notes_based"
    model_male = "model_male"
    model_female = "model_female"
    luxury_lifestyle = "luxury_lifestyle"
    close_up_detail = "close_up_detail"
    flat_lay = "flat_lay"


class PerfumeNotes(BaseModel):
    """Fragrance note pyramid."""

    top: list[str] = Field(default_factory=list)
    middle: list[str] = Field(default_factory=list)
    base: list[str] = Field(default_factory=list)
    description: str = ""


class PerfumeInfo(BaseModel):
    """Perfume product information."""

    perfume_name: str
    brand_name: str
    inspired_by: str = ""
    gender: str = "unisex"  # "male", "female", "unisex"
    cleaned_name: str = ""  # Cleaned name without "Eau de Parfum", "EDP", sizes, etc.
    notes: PerfumeNotes | None = None


class PerfumeProductDNA(BaseModel):
    """Detailed perfume product DNA extracted from reference images."""

    product_type: str = "perfume"
    product_name: str = ""
    colors_primary: str = ""
    colors_secondary: str = ""
    bottle_shape: str = ""
    bottle_material: str = ""
    bottle_size: str = "100ml"
    cap_design: str = ""
    label_design: str = ""
    liquid_color: str = ""
    distinctive_features: list[str] = Field(default_factory=list)
    visual_description: str = ""
    prohibited_variations: list[str] = Field(default_factory=list)


class PerfumeAvatarDNA(BaseModel):
    """Avatar DNA for model-based perfume shots."""

    gender: str = ""
    face: str = ""
    skin: str = ""
    eyes: str = ""
    hair: str = ""
    body: str = ""
    ethnicity: str = ""
    age_range: str = ""
    wardrobe: str = ""
    prohibited_drift: str = ""


class GeneratePerfumeImagesRequest(BaseModel):
    """Request to generate all styled perfume images."""

    perfume_info: PerfumeInfo
    reference_images: list[str]  # URLs of bottle/cap/label images
    product_dna: PerfumeProductDNA | None = None
    avatar_dna: PerfumeAvatarDNA | None = None
    avatar_reference_images: list[str] = Field(default_factory=list)
    styles: list[str] = Field(default_factory=list)
    aspect_ratio: str = "1:1"
    api_key: str | None = None


class RegeneratePerfumeImageRequest(BaseModel):
    """Request to regenerate a single styled perfume image."""

    perfume_info: PerfumeInfo
    reference_images: list[str]
    product_dna: PerfumeProductDNA | None = None
    avatar_dna: PerfumeAvatarDNA | None = None
    avatar_reference_images: list[str] = Field(default_factory=list)
    style: str  # PerfumeStyle value
    aspect_ratio: str = "1:1"
    api_key: str | None = None


class FetchPerfumeNotesRequest(BaseModel):
    """Request to fetch perfume notes from an inspired brand."""

    inspired_by: str
    api_key: str | None = None


class ExtractPerfumeDNARequest(BaseModel):
    """Request to extract perfume product DNA from reference images."""

    image_urls: list[str]
    perfume_name: str = ""
    brand_name: str = ""
    api_key: str | None = None


class ExtractAvatarDNARequest(BaseModel):
    """Request to extract avatar DNA from model reference images."""

    image_url: str
    api_key: str | None = None


# ─── Pipeline V2 Models (Inspiration + Gender Avatars) ─────────────


class InspirationDNA(BaseModel):
    """Style DNA extracted from 100-200+ inspiration images via vision API."""

    color_palettes: list[str] = Field(default_factory=list)
    lighting_styles: list[str] = Field(default_factory=list)
    composition_patterns: list[str] = Field(default_factory=list)
    prop_usage: list[str] = Field(default_factory=list)
    background_styles: list[str] = Field(default_factory=list)
    mood_aesthetic: list[str] = Field(default_factory=list)
    camera_angles: list[str] = Field(default_factory=list)
    textures_materials: list[str] = Field(default_factory=list)
    overall_summary: str = ""


class GenderAvatarSlot(BaseModel):
    """Avatar slot for a specific gender (male/female/unisex)."""

    images: list[str] = Field(default_factory=list)
    dna: PerfumeAvatarDNA | None = None


class GenderAvatarMapping(BaseModel):
    """Gender-specific avatar mapping — each gender has its own images + DNA."""

    male: GenderAvatarSlot = Field(default_factory=GenderAvatarSlot)
    female: GenderAvatarSlot = Field(default_factory=GenderAvatarSlot)
    unisex: GenderAvatarSlot = Field(default_factory=GenderAvatarSlot)


class PerfumePipelineConfig(BaseModel):
    """Configuration for the perfume image generation pipeline."""

    images_per_product: int = Field(default=8, ge=4, le=12)
    aspect_ratio: str = "1:1"
    mandatory_styles: list[str] = Field(
        default_factory=lambda: ["white_background"]
    )


class ExtractGenderAvatarDNARequest(BaseModel):
    """Request to extract avatar DNA for a specific gender slot."""

    image_urls: list[str]
    gender: str  # "male", "female", "unisex"
    api_key: str | None = None


class AnalyzeInspirationRequest(BaseModel):
    """Request to analyze inspiration images and extract style DNA."""

    image_urls: list[str]
    sample_size: int = 12
    api_key: str | None = None


class RegenerateSingleImageRequest(BaseModel):
    """Request to regenerate one specific image by product and image index."""

    perfume_info: PerfumeInfo
    reference_images: list[str]
    product_dna: PerfumeProductDNA | None = None
    avatar_dna: PerfumeAvatarDNA | None = None
    avatar_reference_images: list[str] = Field(default_factory=list)
    style: str
    inspiration_dna: InspirationDNA | None = None
    aspect_ratio: str = "1:1"
    api_key: str | None = None


class PerfumeBatchStartRequest(BaseModel):
    """Request to start a batch generation job with full pipeline config."""

    products: list[dict]
    reference_images: list[str]
    product_dna: dict | None = None
    gender_avatars: dict | None = None  # GenderAvatarMapping as dict
    inspiration_dna: dict | None = None  # InspirationDNA as dict
    config: dict | None = None  # PerfumePipelineConfig as dict
    product_indices: list[int] | None = None
    styles: list[str] = Field(default_factory=list)
    aspect_ratio: str = "1:1"
    api_key: str | None = None
