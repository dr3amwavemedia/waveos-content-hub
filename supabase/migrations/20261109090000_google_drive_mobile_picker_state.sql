-- Preserve the purpose and safe in-app return destination for Google Drive's
-- top-level mobile Picker flow. OAuth state rows remain service-role only.
ALTER TABLE public.external_media_oauth_states
  ADD COLUMN IF NOT EXISTS flow_kind text NOT NULL DEFAULT 'connect',
  ADD COLUMN IF NOT EXISTS return_path text;

ALTER TABLE public.external_media_oauth_states
  DROP CONSTRAINT IF EXISTS external_media_oauth_states_flow_kind_check;

ALTER TABLE public.external_media_oauth_states
  ADD CONSTRAINT external_media_oauth_states_flow_kind_check
  CHECK (flow_kind IN ('connect', 'mobile_picker'));
