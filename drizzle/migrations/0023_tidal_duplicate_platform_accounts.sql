ALTER TABLE public.social_connections
  DROP CONSTRAINT IF EXISTS social_connections_workspace_id_platform_key;

ALTER TABLE public.social_connections
  ADD CONSTRAINT social_connections_workspace_provider_account_unique
  UNIQUE (workspace_id, provider, provider_account_id);

CREATE INDEX IF NOT EXISTS social_connections_workspace_platform_idx
  ON public.social_connections (workspace_id, platform);

CREATE TABLE IF NOT EXISTS public.zernio_workspace_subprofiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform public.social_platform NOT NULL,
  slot integer NOT NULL CHECK (slot BETWEEN 2 AND 8),
  profile_id text NOT NULL UNIQUE,
  profile_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, slot)
);

ALTER TABLE public.zernio_workspace_subprofiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zernio_workspace_subprofiles FROM anon, authenticated;
GRANT ALL ON public.zernio_workspace_subprofiles TO service_role;

COMMENT ON TABLE public.zernio_workspace_subprofiles IS
  'Free Zernio sub-profiles used only for Tidal duplicate-platform account slots.';