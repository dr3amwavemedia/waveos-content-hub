
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS require_fresh_social_login boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS ayrshare_profiles_ref_id_unique
  ON public.ayrshare_profiles (ref_id)
  WHERE ref_id IS NOT NULL;
