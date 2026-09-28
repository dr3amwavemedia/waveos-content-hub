-- Zernio replaces the retired Ayrshare bridge without deleting historical
-- provider references. One Zernio profile belongs to one WaveOS workspace.

CREATE TABLE IF NOT EXISTS public.zernio_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id text NOT NULL UNIQUE,
  profile_name text NOT NULL,
  verified_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.zernio_profiles FROM anon, authenticated;
GRANT ALL ON public.zernio_profiles TO service_role;
ALTER TABLE public.zernio_profiles ENABLE ROW LEVEL SECURITY;
-- Intentionally no authenticated policy. Provider IDs are read and written
-- only by authenticated server functions using the service role.

DROP TRIGGER IF EXISTS zernio_profiles_updated_at ON public.zernio_profiles;
CREATE TRIGGER zernio_profiles_updated_at
  BEFORE UPDATE ON public.zernio_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.social_connections
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'ayrshare',
  ADD COLUMN IF NOT EXISTS provider_account_id text,
  ADD COLUMN IF NOT EXISTS connection_state text NOT NULL DEFAULT 'not_connected';

ALTER TABLE public.social_connections
  DROP CONSTRAINT IF EXISTS social_connections_provider_check;
ALTER TABLE public.social_connections
  ADD CONSTRAINT social_connections_provider_check
  CHECK (provider IN ('ayrshare', 'zernio'));

ALTER TABLE public.social_connections
  DROP CONSTRAINT IF EXISTS social_connections_state_check;
ALTER TABLE public.social_connections
  ADD CONSTRAINT social_connections_state_check
  CHECK (connection_state IN ('connected', 'action_required', 'expired', 'error', 'not_connected'));

CREATE INDEX IF NOT EXISTS social_connections_provider_account_idx
  ON public.social_connections(provider, provider_account_id)
  WHERE provider_account_id IS NOT NULL;

ALTER TABLE public.publish_attempts
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'ayrshare',
  ADD COLUMN IF NOT EXISTS provider_post_id text;

UPDATE public.publish_attempts
SET provider_post_id = ayrshare_post_id
WHERE provider_post_id IS NULL AND ayrshare_post_id IS NOT NULL;

ALTER TABLE public.publish_attempts
  DROP CONSTRAINT IF EXISTS publish_attempts_provider_check;
ALTER TABLE public.publish_attempts
  ADD CONSTRAINT publish_attempts_provider_check
  CHECK (provider IN ('ayrshare', 'zernio'));

CREATE INDEX IF NOT EXISTS publish_attempts_provider_post_idx
  ON public.publish_attempts(provider, provider_post_id)
  WHERE provider_post_id IS NOT NULL;

COMMENT ON TABLE public.zernio_profiles IS
  'Server-only mapping between a WaveOS workspace and its isolated Zernio profile.';
COMMENT ON COLUMN public.social_connections.provider_account_id IS
  'The social account id returned by the active publishing provider.';
COMMENT ON COLUMN public.publish_attempts.provider_post_id IS
  'Provider-neutral post reference; ayrshare_post_id remains for historical compatibility.';
