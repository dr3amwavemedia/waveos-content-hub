-- External media stays in the client's Google Drive or Dropbox account.
-- WaveOS stores only an encrypted provider connection and file metadata.

CREATE TABLE IF NOT EXISTS public.external_media_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google_drive', 'dropbox')),
  external_account_id text NOT NULL,
  account_email text,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

CREATE TABLE IF NOT EXISTS public.external_media_oauth_states (
  state text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google_drive', 'dropbox')),
  code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_media_oauth_states_expiry_idx
  ON public.external_media_oauth_states(expires_at);

ALTER TABLE public.external_media_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_media_oauth_states ENABLE ROW LEVEL SECURITY;

-- OAuth tokens are server-only. Status is returned by an authenticated WaveOS
-- route and never by exposing these rows through the Data API.
REVOKE ALL ON public.external_media_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.external_media_oauth_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.external_media_connections TO service_role;
GRANT ALL ON public.external_media_oauth_states TO service_role;

ALTER TABLE public.media_assets
  ALTER COLUMN storage_path DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_provider text NOT NULL DEFAULT 'waveos'
    CHECK (source_provider IN ('waveos', 'google_drive', 'dropbox')),
  ADD COLUMN IF NOT EXISTS external_file_id text,
  ADD COLUMN IF NOT EXISTS external_parent_id text,
  ADD COLUMN IF NOT EXISTS source_web_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_source_consistency;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_source_consistency CHECK (
    (source_provider = 'waveos' AND storage_path IS NOT NULL AND external_file_id IS NULL)
    OR
    (source_provider IN ('google_drive', 'dropbox') AND storage_path IS NULL AND external_file_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS media_assets_external_source_idx
  ON public.media_assets(workspace_id, source_provider, external_file_id)
  WHERE source_provider IN ('google_drive', 'dropbox');

COMMENT ON TABLE public.external_media_connections IS
  'Server-only encrypted Google Drive and Dropbox connections scoped to one workspace.';
COMMENT ON COLUMN public.media_assets.external_file_id IS
  'Provider file identifier only; the media bytes remain with the external provider.';
