ALTER TABLE public.user_login_events ALTER COLUMN auth_session_id DROP NOT NULL;

DROP POLICY "Users record their own login session" ON public.user_login_events;

CREATE POLICY "Users record their own login session"
  ON public.user_login_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND user_email = lower((SELECT auth.jwt() ->> 'email'))
    AND (
      (SELECT auth.jwt() ->> 'session_id') IS NULL
      OR auth_session_id = ((SELECT auth.jwt() ->> 'session_id'))::uuid
    )
  );