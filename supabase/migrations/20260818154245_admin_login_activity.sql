-- Successful WaveOS sign-ins, visible only to Dream Wave owners.
-- The authenticated JWT supplies identity/session fields so clients cannot
-- attribute an event to another user or invent a different session.
CREATE TABLE public.user_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL DEFAULT lower(auth.jwt() ->> 'email'),
  auth_session_id uuid NOT NULL DEFAULT (auth.jwt() ->> 'session_id')::uuid,
  device_category text NOT NULL CHECK (device_category IN ('mobile', 'tablet', 'desktop')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_login_events_one_per_session UNIQUE (user_id, auth_session_id)
);

CREATE INDEX user_login_events_occurred_idx
  ON public.user_login_events(occurred_at DESC);

ALTER TABLE public.user_login_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_login_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_login_events TO authenticated;
GRANT INSERT (device_category) ON public.user_login_events TO authenticated;
GRANT ALL ON public.user_login_events TO service_role;

CREATE POLICY "Owners view login activity"
  ON public.user_login_events
  FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

CREATE POLICY "Users record their current login session"
  ON public.user_login_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND user_email = lower((SELECT auth.jwt() ->> 'email'))
    AND auth_session_id = ((SELECT auth.jwt() ->> 'session_id'))::uuid
  );
