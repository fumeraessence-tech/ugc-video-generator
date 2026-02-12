-- ============================================================================
-- UGCGen SaaS Platform - Initial Schema Migration
-- Supabase PostgreSQL with Row-Level Security
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('user', 'admin', 'super_admin');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE job_status AS ENUM ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled');
CREATE TYPE pipeline_step AS ENUM (
  'script_generation', 'scene_prompts', 'storyboard', 'storyboard_review',
  'video_generation', 'video_extension', 'audio_generation', 'post_production',
  'quality_check', 'complete'
);
CREATE TYPE pool_type AS ENUM ('google_ai', 'gcs');
CREATE TYPE api_key_status AS ENUM ('active', 'rate_limited', 'exhausted', 'error');

-- ─── Profiles (extends auth.users) ──────────────────────────────────────────

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  avatar_url  TEXT,
  role        user_role NOT NULL DEFAULT 'user',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Chats ──────────────────────────────────────────────────────────────────

CREATE TABLE chats (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_id  UUID,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chats_user_id ON chats(user_id);

CREATE TRIGGER chats_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Messages ───────────────────────────────────────────────────────────────

CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id    UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role       message_role NOT NULL,
  content    TEXT NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);

-- ─── Avatars ────────────────────────────────────────────────────────────────

CREATE TABLE avatars (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  tag               TEXT,
  unique_identifier TEXT UNIQUE,
  is_system         BOOLEAN NOT NULL DEFAULT false,
  thumbnail_url     TEXT,
  reference_sheet   TEXT,
  reference_images  TEXT[] DEFAULT '{}',
  dna               JSONB NOT NULL DEFAULT '{}',
  detailed_dna      JSONB,
  reference_angles  JSONB,
  angle_validation  JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_avatars_user_id ON avatars(user_id);

-- Add FK from chats to avatars (after avatars table exists)
ALTER TABLE chats ADD CONSTRAINT chats_avatar_id_fkey
  FOREIGN KEY (avatar_id) REFERENCES avatars(id) ON DELETE SET NULL;

CREATE TRIGGER avatars_updated_at
  BEFORE UPDATE ON avatars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Jobs ───────────────────────────────────────────────────────────────────

CREATE TABLE jobs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id             UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  avatar_id           UUID REFERENCES avatars(id) ON DELETE SET NULL,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status              job_status NOT NULL DEFAULT 'queued',
  current_step        pipeline_step NOT NULL DEFAULT 'script_generation',
  progress            INT NOT NULL DEFAULT 0,
  script              JSONB,
  storyboard          JSONB,
  storyboard_scenes   JSONB[] DEFAULT '{}',
  video_urls          JSONB,
  video_scenes        JSONB[] DEFAULT '{}',
  audio_url           TEXT,
  final_video_url     TEXT,
  error_message       TEXT,
  metadata            JSONB,
  product_name        TEXT,
  product_images      TEXT[] DEFAULT '{}',
  background_setting  TEXT,
  platform            TEXT,
  max_scene_duration  INT NOT NULL DEFAULT 8,
  words_per_minute    INT NOT NULL DEFAULT 150,
  consistency_scores  JSONB,
  regeneration_log    JSONB[] DEFAULT '{}',
  avatar_dna          JSONB,
  avatar_ref_images   TEXT[] DEFAULT '{}',
  generation_settings JSONB,
  last_completed_step pipeline_step,
  step_artifacts      JSONB,
  version             INT NOT NULL DEFAULT 1,
  parent_job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_chat_id ON jobs(chat_id);
CREATE INDEX idx_jobs_parent_job_id ON jobs(parent_job_id);

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── User API Keys ─────────────────────────────────────────────────────────

CREATE TABLE user_api_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  service       pool_type NOT NULL,
  encrypted_key TEXT NOT NULL,
  iv            TEXT NOT NULL,
  status        api_key_status NOT NULL DEFAULT 'active',
  last_used_at  TIMESTAMPTZ,
  error_count   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_api_keys_user_service ON user_api_keys(user_id, service);

CREATE TRIGGER user_api_keys_updated_at
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── API Pool Keys (admin-only) ─────────────────────────────────────────────

CREATE TABLE api_pool_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service       pool_type NOT NULL,
  encrypted_key TEXT NOT NULL,
  iv            TEXT NOT NULL,
  status        api_key_status NOT NULL DEFAULT 'active',
  last_used_at  TIMESTAMPTZ,
  error_count   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_pool_keys_service_status ON api_pool_keys(service, status);

CREATE TRIGGER api_pool_keys_updated_at
  BEFORE UPDATE ON api_pool_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row-Level Security Policies
-- ============================================================================

-- Helper: check if current user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Profiles RLS ───────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Super admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_super_admin());

-- ─── Chats RLS ──────────────────────────────────────────────────────────────

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own chats"
  ON chats FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can view all chats"
  ON chats FOR SELECT
  USING (is_super_admin());

-- ─── Messages RLS ───────────────────────────────────────────────────────────

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD messages in own chats"
  ON messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can view all messages"
  ON messages FOR SELECT
  USING (is_super_admin());

-- ─── Avatars RLS ────────────────────────────────────────────────────────────

ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own avatars"
  ON avatars FOR ALL
  USING (user_id = auth.uid() OR is_system = true)
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can view all avatars"
  ON avatars FOR SELECT
  USING (is_super_admin());

-- ─── Jobs RLS ───────────────────────────────────────────────────────────────

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own jobs"
  ON jobs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can view all jobs"
  ON jobs FOR SELECT
  USING (is_super_admin());

-- ─── User API Keys RLS ─────────────────────────────────────────────────────

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own API keys"
  ON user_api_keys FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── API Pool Keys RLS (admin-only) ────────────────────────────────────────

ALTER TABLE api_pool_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only super admins can access pool keys"
  ON api_pool_keys FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================================
-- Storage Buckets (run via Supabase Dashboard or supabase CLI)
-- ============================================================================
-- Note: Storage bucket creation is typically done via Dashboard or CLI.
-- These INSERT statements work if you have direct DB access.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('uploads', 'uploads', true),
  ('perfume', 'perfume', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can only access their own folder ({user_id}/*)

CREATE POLICY "Users can upload to own avatar folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own avatar files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Public read for avatar files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload to own uploads folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own upload files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own upload files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can upload to own perfume folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'perfume' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own perfume files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'perfume' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own perfume files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'perfume' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role (backend) bypasses RLS automatically
