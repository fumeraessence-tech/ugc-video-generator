/**
 * Video Editor Types
 *
 * Types for the post-production video editor page.
 */

// ============================================================================
// Timeline & Clip Types
// ============================================================================

export interface TimelineClip {
  id: string;
  sceneNumber: number;
  clipNumber: number;
  videoUrl: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  order: number;
  thumbnailUrl?: string;
  crop?: CropSettings;
}

export type TransitionKind =
  | "none"
  | "fade"
  | "crossfade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "wipe-left"
  | "wipe-right"
  | "zoom-in"
  | "zoom-out"
  | "dissolve";

export interface TransitionType {
  id: string;
  type: TransitionKind;
  duration: number;
  label: string;
}

export interface TimelineTransition {
  id: string;
  afterClipId: string;
  transition: TransitionType;
}

// ============================================================================
// Audio Types
// ============================================================================

export type AudioClipType = "voiceover" | "music" | "sfx";

export interface AudioClip {
  id: string;
  type: AudioClipType;
  url: string;
  filename: string;
  duration: number;
  volume: number;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  fadeIn: number;
  fadeOut: number;
  sceneNumber?: number;
  label: string;
}

export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  duration: number;
  url: string;
  category: "upbeat" | "calm" | "dramatic" | "corporate" | "fun" | "ambient";
  bpm?: number;
  isPreset: boolean;
}

export interface VoiceConfig {
  languageCode: string;
  voiceName: string;
  pitch: number;
  speakingRate: number;
}

// ============================================================================
// Caption Types
// ============================================================================

export interface Caption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  sceneNumber: number;
}

export type CaptionPosition = "top" | "center" | "bottom";
export type CaptionAlignment = "left" | "center" | "right";
export type CaptionAnimation =
  | "none"
  | "fade-in"
  | "slide-up"
  | "typewriter"
  | "pop"
  | "karaoke";

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold" | "extrabold";
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: CaptionPosition;
  alignment: CaptionAlignment;
  animation: CaptionAnimation;
  outlineColor: string;
  outlineWidth: number;
  maxWidth: number;
}

// ============================================================================
// Editor State Types
// ============================================================================

export type EditorPanel =
  | "properties"
  | "transitions"
  | "music"
  | "captions"
  | "audio";

export type PlaybackState = "stopped" | "playing" | "paused";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";

export interface CropSettings {
  x: number; // 0-100 percent
  y: number;
  width: number;
  height: number;
}

export const ASPECT_RATIO_PRESETS: {
  id: AspectRatio;
  label: string;
  width: number;
  height: number;
}[] = [
  { id: "16:9", label: "Landscape", width: 16, height: 9 },
  { id: "9:16", label: "Portrait", width: 9, height: 16 },
  { id: "1:1", label: "Square", width: 1, height: 1 },
  { id: "4:5", label: "Instagram", width: 4, height: 5 },
];

export interface ExportSettings {
  resolution: "720p" | "1080p" | "4k";
  format: "mp4" | "webm";
  quality: "draft" | "standard" | "high";
  includeAudio: boolean;
  includeCaptions: boolean;
  captionBurnIn: boolean;
}

export type ExportStatus =
  | "idle"
  | "preparing"
  | "rendering"
  | "encoding"
  | "complete"
  | "error";

export interface ExportProgress {
  status: ExportStatus;
  percent: number;
  message: string;
  outputUrl?: string;
  error?: string;
}

export interface ScriptSceneData {
  sceneNumber: number;
  dialogue: string;
  action: string;
  sceneType: string;
  duration: number;
}

// ============================================================================
// Constants
// ============================================================================

export const TRANSITION_PRESETS: TransitionType[] = [
  { id: "none", type: "none", duration: 0, label: "None" },
  { id: "fade", type: "fade", duration: 0.5, label: "Fade" },
  { id: "crossfade", type: "crossfade", duration: 0.8, label: "Crossfade" },
  { id: "slide-left", type: "slide-left", duration: 0.5, label: "Slide Left" },
  { id: "slide-right", type: "slide-right", duration: 0.5, label: "Slide Right" },
  { id: "slide-up", type: "slide-up", duration: 0.5, label: "Slide Up" },
  { id: "slide-down", type: "slide-down", duration: 0.5, label: "Slide Down" },
  { id: "wipe-left", type: "wipe-left", duration: 0.7, label: "Wipe Left" },
  { id: "wipe-right", type: "wipe-right", duration: 0.7, label: "Wipe Right" },
  { id: "zoom-in", type: "zoom-in", duration: 0.6, label: "Zoom In" },
  { id: "zoom-out", type: "zoom-out", duration: 0.6, label: "Zoom Out" },
  { id: "dissolve", type: "dissolve", duration: 1.0, label: "Dissolve" },
];

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: "Inter",
  fontSize: 32,
  fontWeight: "bold",
  color: "#FFFFFF",
  backgroundColor: "#000000",
  backgroundOpacity: 60,
  position: "bottom",
  alignment: "center",
  animation: "fade-in",
  outlineColor: "#000000",
  outlineWidth: 2,
  maxWidth: 90,
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  resolution: "1080p",
  format: "mp4",
  quality: "standard",
  includeAudio: true,
  includeCaptions: true,
  captionBurnIn: true,
};

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  languageCode: "en-US",
  voiceName: "en-US-Studio-O",
  pitch: 0,
  speakingRate: 1.0,
};

export const FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Montserrat",
  "Poppins",
  "Open Sans",
  "Lato",
  "Oswald",
  "Playfair Display",
  "Bebas Neue",
  "Anton",
];
