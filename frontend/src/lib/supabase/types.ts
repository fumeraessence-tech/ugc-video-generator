export type UserRole = "user" | "admin" | "super_admin";
export type MessageRole = "user" | "assistant" | "system";
export type JobStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type PipelineStep =
  | "script_generation"
  | "scene_prompts"
  | "storyboard"
  | "storyboard_review"
  | "video_generation"
  | "video_extension"
  | "audio_generation"
  | "post_production"
  | "quality_check"
  | "complete";
export type PoolType = "google_ai" | "gcs";
export type ApiKeyStatus = "active" | "rate_limited" | "exhausted" | "error";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  avatar_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: MessageRole;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Avatar {
  id: string;
  user_id: string | null;
  name: string;
  tag: string | null;
  unique_identifier: string | null;
  is_system: boolean;
  thumbnail_url: string | null;
  reference_sheet: string | null;
  reference_images: string[];
  dna: Record<string, unknown>;
  detailed_dna: Record<string, unknown> | null;
  reference_angles: Record<string, unknown> | null;
  angle_validation: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  chat_id: string;
  avatar_id: string | null;
  user_id: string;
  status: JobStatus;
  current_step: PipelineStep;
  progress: number;
  script: Record<string, unknown> | null;
  storyboard: Record<string, unknown> | null;
  storyboard_scenes: Record<string, unknown>[];
  video_urls: Record<string, unknown> | null;
  video_scenes: Record<string, unknown>[];
  audio_url: string | null;
  final_video_url: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  product_name: string | null;
  product_images: string[];
  background_setting: string | null;
  platform: string | null;
  max_scene_duration: number;
  words_per_minute: number;
  consistency_scores: Record<string, unknown> | null;
  regeneration_log: Record<string, unknown>[];
  avatar_dna: Record<string, unknown> | null;
  avatar_ref_images: string[];
  generation_settings: Record<string, unknown> | null;
  last_completed_step: PipelineStep | null;
  step_artifacts: Record<string, unknown> | null;
  version: number;
  parent_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserApiKey {
  id: string;
  user_id: string;
  label: string;
  service: PoolType;
  encrypted_key: string;
  iv: string;
  status: ApiKeyStatus;
  last_used_at: string | null;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApiPoolKey {
  id: string;
  service: PoolType;
  encrypted_key: string;
  iv: string;
  status: ApiKeyStatus;
  last_used_at: string | null;
  error_count: number;
  created_at: string;
  updated_at: string;
}
