-- Allow WaveOS server routes to use the signed-in user's Supabase session.
-- OAuth tokens remain encrypted with OUTLOOK_TOKEN_ENCRYPTION_KEY.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlook_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlook_oauth_states TO authenticated;

DROP POLICY IF EXISTS "Users manage their Outlook connection" ON public.outlook_connections;
CREATE POLICY "Users manage their Outlook connection"
ON public.outlook_connections
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage their Outlook OAuth state" ON public.outlook_oauth_states;
CREATE POLICY "Users manage their Outlook OAuth state"
ON public.outlook_oauth_states
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.outlook_read_oauth_state(_state text)
RETURNS TABLE(user_id uuid, code_verifier text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _state !~ '^[a-f0-9]{64}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.user_id, s.code_verifier
  FROM public.outlook_oauth_states AS s
  WHERE s.state = _state
    AND s.expires_at > now();
END;
$$;

CREATE OR REPLACE FUNCTION public.outlook_complete_connection(
  _state text,
  _microsoft_user_id text,
  _email text,
  _access_token_encrypted text,
  _refresh_token_encrypted text,
  _token_expires_at timestamptz,
  _scopes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _user_id uuid;
BEGIN
  IF _state !~ '^[a-f0-9]{64}$'
    OR length(_microsoft_user_id) NOT BETWEEN 1 AND 255
    OR length(_email) NOT BETWEEN 3 AND 320
    OR length(_access_token_encrypted) NOT BETWEEN 20 AND 20000
    OR length(_refresh_token_encrypted) NOT BETWEEN 20 AND 20000
    OR _token_expires_at <= now()
  THEN
    RAISE EXCEPTION 'invalid_outlook_callback';
  END IF;

  SELECT s.user_id
  INTO _user_id
  FROM public.outlook_oauth_states AS s
  WHERE s.state = _state
    AND s.expires_at > now()
  FOR UPDATE;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_outlook_state';
  END IF;

  INSERT INTO public.outlook_connections (
    user_id,
    microsoft_user_id,
    email,
    access_token_encrypted,
    refresh_token_encrypted,
    token_expires_at,
    scopes,
    updated_at
  ) VALUES (
    _user_id,
    _microsoft_user_id,
    lower(trim(_email)),
    _access_token_encrypted,
    _refresh_token_encrypted,
    _token_expires_at,
    coalesce(_scopes, ''),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    microsoft_user_id = EXCLUDED.microsoft_user_id,
    email = EXCLUDED.email,
    access_token_encrypted = EXCLUDED.access_token_encrypted,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    token_expires_at = EXCLUDED.token_expires_at,
    scopes = EXCLUDED.scopes,
    updated_at = now();

  DELETE FROM public.outlook_oauth_states WHERE state = _state;
END;
$$;

REVOKE ALL ON FUNCTION public.outlook_read_oauth_state(text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.outlook_complete_connection(
  text, text, text, text, text, timestamptz, text
) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.outlook_read_oauth_state(text) TO anon;
GRANT EXECUTE ON FUNCTION public.outlook_complete_connection(
  text, text, text, text, text, timestamptz, text
) TO anon;

COMMENT ON FUNCTION public.outlook_read_oauth_state(text) IS
  'Capability-limited OAuth callback lookup using a 256-bit random state value.';
COMMENT ON FUNCTION public.outlook_complete_connection(
  text, text, text, text, text, timestamptz, text
) IS 'Completes an Outlook OAuth callback and consumes its one-time state.';
