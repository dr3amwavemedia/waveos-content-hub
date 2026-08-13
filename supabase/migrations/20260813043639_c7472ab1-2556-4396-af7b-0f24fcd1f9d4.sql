-- One Dream Wave-owned Frame.io connection powers curated client Shares.
CREATE TABLE public.frameio_service_connections (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  external_user_id text NOT NULL,
  account_email text,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scopes text NOT NULL DEFAULT '',
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.frameio_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frameio_service_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frameio_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.frameio_service_connections, public.frameio_oauth_states
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.frameio_service_connections, public.frameio_oauth_states TO service_role;

CREATE INDEX frameio_oauth_states_expiry_idx ON public.frameio_oauth_states(expires_at);

CREATE TRIGGER update_frameio_service_connection_updated_at
  BEFORE UPDATE ON public.frameio_service_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();