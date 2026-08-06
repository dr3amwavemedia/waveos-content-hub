-- Per-user Microsoft Outlook connections. Tokens are encrypted by Edge Functions
-- before storage and are never exposed through the Data API.
CREATE TABLE IF NOT EXISTS public.outlook_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  microsoft_user_id text NOT NULL,
  email text NOT NULL,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scopes text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outlook_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outlook_oauth_states_expiry_idx
  ON public.outlook_oauth_states(expires_at);

ALTER TABLE public.outlook_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlook_oauth_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.outlook_connections FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.outlook_oauth_states FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.outlook_connections TO service_role;
GRANT ALL ON public.outlook_oauth_states TO service_role;

COMMENT ON TABLE public.outlook_connections IS
  'Server-only encrypted Microsoft OAuth tokens, one Outlook connection per WaveOS user.';
COMMENT ON TABLE public.outlook_oauth_states IS
  'Short-lived PKCE state records used by the Outlook OAuth callback.';
