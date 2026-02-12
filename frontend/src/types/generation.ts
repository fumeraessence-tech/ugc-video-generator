// === Generation Modes ===
export type GenerationMode = "ingredients" | "text" | "image" | "extend";

export const GENERATION_MODE_LABELS: Record<GenerationMode, string> = {
  ingredients: "Ingredients to Video",
  text: "Text to Video",
  image: "Image to Video",
  extend: "Extend Video",
};

// === Model Selection ===
export type ScriptModel = "gemini-2.5-pro" | "gemini-2.5-flash";
export type StoryboardModel = "nano-banana-pro" | "nano-banana-flash";
export type VideoModel = "veo-3.1" | "veo-3.1-fast" | "veo-2";
export type TTSModel = "gemini-tts" | "google-cloud-tts";

export interface ModelSelection {
  script: ScriptModel;
  storyboard: StoryboardModel;
  video: VideoModel;
  tts: TTSModel;
}

export const SCRIPT_MODEL_LABELS: Record<ScriptModel, string> = {
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
};

export const STORYBOARD_MODEL_LABELS: Record<StoryboardModel, string> = {
  "nano-banana-pro": "Nano Banana Pro",
  "nano-banana-flash": "Nano Banana Flash",
};

export const VIDEO_MODEL_LABELS: Record<VideoModel, string> = {
  "veo-3.1": "Veo 3.1",
  "veo-3.1-fast": "Veo 3.1 Fast",
  "veo-2": "Veo 2",
};

export const TTS_MODEL_LABELS: Record<TTSModel, string> = {
  "gemini-tts": "Gemini TTS",
  "google-cloud-tts": "Google Cloud TTS",
};

// === Aspect Ratio ===
export type AspectRatio = "16:9" | "9:16" | "1:1";

export const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "1:1": "1:1",
};

// === Duration ===
export type Duration = 4 | 6 | 8 | 15 | 30 | 60;

export const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: 4, label: "4s" },
  { value: 6, label: "6s" },
  { value: 8, label: "8s" },
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
];

// === Camera Setup ===
export type ShotType =
  | "close-up"
  | "medium"
  | "wide"
  | "extreme-close-up"
  | "over-shoulder";
export type CameraAngle =
  | "eye-level"
  | "low-angle"
  | "high-angle"
  | "dutch-angle"
  | "birds-eye";
export type CameraMovement =
  | "static"
  | "pan-left"
  | "pan-right"
  | "tilt-up"
  | "tilt-down"
  | "dolly-in"
  | "dolly-out"
  | "tracking"
  | "handheld";
export type DepthOfField = "shallow" | "medium" | "deep";

export interface CameraSetup {
  shotType: ShotType;
  angle: CameraAngle;
  movement: CameraMovement;
  dof: DepthOfField;
}

export const SHOT_TYPE_LABELS: Record<ShotType, string> = {
  "close-up": "Close-up",
  medium: "Medium Shot",
  wide: "Wide Shot",
  "extreme-close-up": "Extreme Close-up",
  "over-shoulder": "Over Shoulder",
};

export const CAMERA_ANGLE_LABELS: Record<CameraAngle, string> = {
  "eye-level": "Eye Level",
  "low-angle": "Low Angle",
  "high-angle": "High Angle",
  "dutch-angle": "Dutch Angle",
  "birds-eye": "Bird's Eye",
};

export const CAMERA_MOVEMENT_LABELS: Record<CameraMovement, string> = {
  static: "Static",
  "pan-left": "Pan Left",
  "pan-right": "Pan Right",
  "tilt-up": "Tilt Up",
  "tilt-down": "Tilt Down",
  "dolly-in": "Dolly In",
  "dolly-out": "Dolly Out",
  tracking: "Tracking",
  handheld: "Handheld",
};

export const DOF_LABELS: Record<DepthOfField, string> = {
  shallow: "Shallow (Bokeh)",
  medium: "Medium",
  deep: "Deep",
};

// === Lighting Setup ===
export type LightingType =
  | "natural-window"
  | "studio-soft"
  | "golden-hour"
  | "overcast"
  | "ring-light"
  | "neon";
export type LightingDirection =
  | "front"
  | "side-rembrandt"
  | "back-rim"
  | "top"
  | "under";
export type ColorTemperature = "warm-3000k" | "neutral-5000k" | "cool-7000k";
export type LightingIntensity = "low-key" | "mid" | "high-key";

export interface LightingSetup {
  type: LightingType;
  direction: LightingDirection;
  colorTemp: ColorTemperature;
  intensity: LightingIntensity;
}

export const LIGHTING_TYPE_LABELS: Record<LightingType, string> = {
  "natural-window": "Natural Window",
  "studio-soft": "Studio Soft",
  "golden-hour": "Golden Hour",
  overcast: "Overcast",
  "ring-light": "Ring Light",
  neon: "Neon",
};

export const LIGHTING_DIRECTION_LABELS: Record<LightingDirection, string> = {
  front: "Front",
  "side-rembrandt": "Side (Rembrandt)",
  "back-rim": "Back (Rim)",
  top: "Top",
  under: "Under",
};

export const COLOR_TEMP_LABELS: Record<ColorTemperature, string> = {
  "warm-3000k": "Warm (3000K)",
  "neutral-5000k": "Neutral (5000K)",
  "cool-7000k": "Cool (7000K)",
};

export const LIGHTING_INTENSITY_LABELS: Record<LightingIntensity, string> = {
  "low-key": "Low-key (Dramatic)",
  mid: "Mid",
  "high-key": "High-key (Bright)",
};

// === Video Style ===
export type VideoStyle =
  | "testimonial"
  | "product-showcase"
  | "brand-story"
  | "social-reel"
  | "comparison-review";

export const VIDEO_STYLE_LABELS: Record<VideoStyle, string> = {
  testimonial: "Testimonial",
  "product-showcase": "Product Showcase",
  "brand-story": "Brand Story",
  "social-reel": "Social Reel",
  "comparison-review": "Comparison / Review",
};

// === Platform ===
export type Platform =
  | "instagram-reels"
  | "tiktok"
  | "youtube-shorts"
  | "youtube"
  | "custom";

export const PLATFORM_LABELS: Record<Platform, string> = {
  "instagram-reels": "Instagram Reels",
  tiktok: "TikTok",
  "youtube-shorts": "YouTube Shorts",
  youtube: "YouTube",
  custom: "Custom",
};

// === Resolution ===
export type Resolution = "720p" | "1080p" | "4k";

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  "720p": "720p",
  "1080p": "1080p",
  "4k": "4K",
};

// === Color Grading ===
export type ColorGrading = "none" | "warm" | "cool" | "cinematic" | "vintage";

export const COLOR_GRADING_LABELS: Record<ColorGrading, string> = {
  none: "None",
  warm: "Warm",
  cool: "Cool",
  cinematic: "Cinematic",
  vintage: "Vintage",
};

// === Realism Filters ===
export interface RealismFilters {
  grain: boolean;
  vignette: boolean;
  shake: boolean;
}

// === Combined Generation Settings ===
export interface GenerationSettings {
  generationMode: GenerationMode;
  selectedModel: ModelSelection;
  aspectRatio: AspectRatio;
  duration: Duration;
  cameraSetup: CameraSetup;
  lightingSetup: LightingSetup;
  videoStyle: VideoStyle;
  platform: Platform;
  resolution: Resolution;
  realismFilters: RealismFilters;
  colorGrading: ColorGrading;
  selectedAvatarId: string | null;
  audioEnabled: boolean;
  isInputExpanded: boolean;
  // Product & background settings for reference image support
  productImages: string[];
  productName: string | null;
  backgroundSetting: string;
}

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  generationMode: "ingredients",
  selectedModel: {
    script: "gemini-2.5-pro",
    storyboard: "nano-banana-pro",
    video: "veo-3.1",
    tts: "gemini-tts",
  },
  aspectRatio: "16:9",
  duration: 8,
  cameraSetup: {
    shotType: "medium",
    angle: "eye-level",
    movement: "static",
    dof: "medium",
  },
  lightingSetup: {
    type: "natural-window",
    direction: "front",
    colorTemp: "neutral-5000k",
    intensity: "mid",
  },
  videoStyle: "testimonial",
  platform: "instagram-reels",
  resolution: "1080p",
  realismFilters: { grain: false, vignette: false, shake: false },
  colorGrading: "none",
  selectedAvatarId: null,
  audioEnabled: true,
  isInputExpanded: false,
  // Product & background defaults
  productImages: [],
  productName: null,
  backgroundSetting: "modern_bedroom",
};
