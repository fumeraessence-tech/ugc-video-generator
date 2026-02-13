/**
 * Mass Script Generator Types
 *
 * Types for the step-by-step video generation wizard.
 */

// ============================================================================
// Product DNA
// ============================================================================

export interface ProductColors {
  primary: string;
  secondary: string | null;
  accent: string | null;
  packaging: string | null;
}

export interface ProductDNA {
  product_type: string;
  product_name: string | null;
  colors: ProductColors;
  shape: string;
  materials: string[];
  texture: string | null;
  branding_text: string[];
  logo_description: string | null;
  size_category: string;
  proportions: string | null;
  distinctive_features: string[];
  visual_description: string;
  hero_angles: string[];
  prohibited_variations: string[];
}

// ============================================================================
// Production Bible
// ============================================================================

export type Platform =
  | "instagram_reels"
  | "tiktok"
  | "youtube_shorts"
  | "youtube_long"
  | "facebook"
  | "meta_ads"
  | "pinterest"
  | "snapchat";

export type VideoStyle =
  // Classic UGC
  | "testimonial"
  | "tutorial"
  | "unboxing"
  | "grwm"
  | "comparison"
  | "transformation"
  | "day_in_life"
  | "haul"
  // Hook-driven / Meta Ads
  | "problem_solution"
  | "storytelling"
  | "reaction"
  | "pov"
  | "myth_busting"
  | "three_reasons"
  | "stop_scrolling"
  | "asmr"
  | "duet_stitch"
  | "street_interview"
  | "challenge"
  | "secret_hack"
  | "routine"
  | "expectation_reality"
  | "storytime"
  | "whisper_sell"
  | "founder_story"
  | "mini_vlog"
  | "aesthetic"
  | "us_vs_them";

export type Tone =
  | "excited"
  | "calm"
  | "professional"
  | "casual"
  | "luxurious"
  | "playful"
  | "urgent"
  | "controversial"
  | "vulnerable"
  | "sarcastic"
  | "asmr_whisper"
  | "hype";

// ============================================================================
// Language
// ============================================================================

export type Language =
  | "en"
  | "hi"
  | "ta"
  | "te"
  | "bn"
  | "mr"
  | "gu"
  | "kn"
  | "pa"
  | "ml";

export const LANGUAGE_OPTIONS: { value: Language; label: string; native: string }[] = [
  { value: "en", label: "English", native: "English" },
  { value: "hi", label: "Hindi", native: "हिन्दी" },
  { value: "ta", label: "Tamil", native: "தமிழ்" },
  { value: "te", label: "Telugu", native: "తెలుగు" },
  { value: "bn", label: "Bengali", native: "বাংলা" },
  { value: "mr", label: "Marathi", native: "मराठी" },
  { value: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { value: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { value: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { value: "ml", label: "Malayalam", native: "മലയാളം" },
];

// ============================================================================
// Music
// ============================================================================

export type MusicCategory = "upbeat" | "calm" | "dramatic" | "corporate" | "fun" | "ambient";

export const MUSIC_CATEGORY_OPTIONS: { value: MusicCategory; label: string }[] = [
  { value: "upbeat", label: "Upbeat & Energetic" },
  { value: "calm", label: "Calm & Relaxing" },
  { value: "dramatic", label: "Dramatic & Cinematic" },
  { value: "corporate", label: "Corporate & Professional" },
  { value: "fun", label: "Fun & Playful" },
  { value: "ambient", label: "Ambient & Atmospheric" },
];

export interface MusicConfig {
  enabled: boolean;
  category: MusicCategory | null;
  volume: number;
}

// ============================================================================
// Camera Device
// ============================================================================

export type CameraDevice =
  | "iphone_16_pro_max"
  | "iphone_16_pro"
  | "iphone_15_pro"
  | "iphone_15"
  | "iphone_14"
  | "professional";

export const CAMERA_DEVICE_OPTIONS: { value: CameraDevice; label: string; description: string }[] = [
  { value: "iphone_16_pro_max", label: "iPhone 16 Pro Max", description: "48MP, 24mm f/1.78, 4K 120fps" },
  { value: "iphone_16_pro", label: "iPhone 16 Pro", description: "48MP, 24mm f/1.78, 4K 120fps" },
  { value: "iphone_15_pro", label: "iPhone 15 Pro", description: "48MP, 24mm f/1.78, ProRes" },
  { value: "iphone_15", label: "iPhone 15", description: "48MP, 26mm f/1.6, 4K 60fps" },
  { value: "iphone_14", label: "iPhone 14", description: "12MP, 26mm f/1.5, classic look" },
  { value: "professional", label: "Professional (Cinema)", description: "ARRI/RED, 35mm prime, filmic" },
];

// ============================================================================
// Creative Brief
// ============================================================================

export interface CreativeBrief {
  user_input: string;
  hook_strategy: string;
  pain_point: string;
  key_selling_points: string[];
  emotional_journey: string;
  cta_approach: string;
  unique_angle: string | null;
}

export interface CameraLanguage {
  body: string;
  default_shot: string;
  default_angle: string;
  default_movement: string;
  lens_mm: number;
  depth_of_field: string;
  handheld_intensity: string;
  focus_behavior: string;
}

export interface LightingBible {
  setup: string;
  direction: string;
  color_temp_kelvin: number;
  key_intensity: string;
  fill_ratio: string;
  rim_light: boolean;
  mood: string;
}

export interface StyleConfig {
  platform: Platform;
  duration_seconds: number;
  style: VideoStyle;
  tone: Tone;
  pacing: string;
  music_style: string | null;
}

export interface AvatarDNA {
  face: string;
  skin: string;
  eyes: string;
  hair: string;
  body: string;
  voice: string;
  wardrobe: string;
  prohibited_drift: string | null;
  gender?: string;
  ethnicity?: string;
  age_range?: string;
}

export interface RealismRules {
  skin_texture: string;
  skin_prohibited: string;
  face_structure: string;
  face_prohibited: string;
  hands: string;
  hands_prohibited: string;
  environment: string;
  environment_prohibited: string;
  product_fidelity: string;
  product_prohibited: string;
  text_overlay: string;
}

export interface ProductionBible {
  product_dna: ProductDNA;
  avatar_dna: AvatarDNA | null;
  style_config: StyleConfig;
  creative_brief: CreativeBrief;
  camera_language: CameraLanguage;
  lighting_bible: LightingBible;
  realism_rules: RealismRules;
  master_prompt: string;
}

// ============================================================================
// Script
// ============================================================================

export interface SceneCamera {
  shot_type: string;
  angle: string;
  movement: string;
  focus: string;
}

export interface SceneLighting {
  setup: string;
  mood: string;
}

export interface Scene {
  scene_number: string;
  scene_type: "hook" | "problem" | "solution" | "demo" | "social_proof" | "cta";
  duration_seconds: number;
  start_time: number;
  end_time: number;
  dialogue: string;
  action: string;
  expression: string;
  product_visibility: "none" | "subtle" | "prominent" | "hero";
  product_action: string;
  camera: SceneCamera;
  lighting: SceneLighting;
  audio_notes: string;
  // Generated content (added after storyboard generation)
  storyboard_url?: string;
}

export interface AudioDirection {
  overall_tone: string;
  pacing_notes: string;
  emphasis_words: string[];
}

export interface Script {
  title: string;
  total_duration: number;
  scenes: Scene[];
  audio_direction: AudioDirection;
}

// ============================================================================
// API Responses
// ============================================================================

export interface ProductAnalysisResponse {
  success: boolean;
  product_dna: ProductDNA | null;
  error: string | null;
  analyzed_images: number;
}

export interface ExpandBriefResponse {
  success: boolean;
  brief: CreativeBrief | null;
  error: string | null;
}

export interface AssembleBibleResponse {
  success: boolean;
  bible: ProductionBible | null;
  error: string | null;
}

export interface GenerateScriptResponse {
  success: boolean;
  script: Script | null;
  error: string | null;
}

// ============================================================================
// Wizard State
// ============================================================================

export type WizardStep = "product" | "avatar" | "brief" | "script" | "generate" | "video";

export interface WizardState {
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
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Labels
// ============================================================================

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram_reels: "Instagram Reels",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  youtube_long: "YouTube",
  facebook: "Facebook",
  meta_ads: "Meta Ads",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
};

export const VIDEO_STYLE_LABELS: Record<VideoStyle, string> = {
  // Classic UGC
  testimonial: "Testimonial / Review",
  tutorial: "Tutorial / How-To",
  unboxing: "Unboxing",
  grwm: "Get Ready With Me",
  comparison: "Product Comparison",
  transformation: "Before & After",
  day_in_life: "Day in the Life",
  haul: "Product Haul",
  // Hook-driven / Meta Ads
  problem_solution: "Problem → Solution",
  storytelling: "Storytelling",
  reaction: "Reaction / First Impressions",
  pov: "POV",
  myth_busting: "Myth Busting",
  three_reasons: "3 Reasons Why",
  stop_scrolling: "Stop Scrolling",
  asmr: "ASMR",
  duet_stitch: "Duet / Stitch",
  street_interview: "Street Interview",
  challenge: "Challenge",
  secret_hack: "Secret Hack",
  routine: "Routine",
  expectation_reality: "Expectation vs Reality",
  storytime: "Storytime",
  whisper_sell: "Whisper Sell",
  founder_story: "Founder Story",
  mini_vlog: "Mini Vlog",
  aesthetic: "Aesthetic / Mood",
  us_vs_them: "Us vs Them",
};

export const TONE_LABELS: Record<Tone, string> = {
  excited: "Excited & Energetic",
  calm: "Calm & Relaxed",
  professional: "Professional",
  casual: "Casual & Friendly",
  luxurious: "Luxurious & Premium",
  playful: "Playful & Fun",
  urgent: "Urgent (FOMO)",
  controversial: "Controversial / Bold",
  vulnerable: "Vulnerable / Honest",
  sarcastic: "Sarcastic / Witty",
  asmr_whisper: "ASMR / Whisper",
  hype: "Hype / High Energy",
};

export const SCENE_TYPE_LABELS: Record<Scene["scene_type"], string> = {
  hook: "Hook",
  problem: "Problem",
  solution: "Solution",
  demo: "Demo",
  social_proof: "Social Proof",
  cta: "Call to Action",
};
