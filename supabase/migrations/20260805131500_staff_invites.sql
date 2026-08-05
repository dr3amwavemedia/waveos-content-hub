-- Owner-managed staff invitations. Staff accounts never require a client workspace.
CREATE OR REPLACE FUNCTION public.create_staff_invite(
  _email text,
  _expires_days integer DEFAULT 14
)
RETURNS TABLE(invite_id uuid, raw_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _token text;
  _hash text;
  _id uuid;
  _clean_email text := lower(btrim(_email));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role(_uid, 'dream_wave_owner') THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF _clean_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  _token := replace(replace(replace(encode(extensions.gen_random_bytes(48), 'base64'), '+', '-'), '/', '_'), '=', '');
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');

  UPDATE public.invites
     SET status = 'revoked', revoked_at = now(), revoked_by = _uid
   WHERE email = _clean_email
     AND workspace_id IS NULL
     AND app_role = 'dream_wave_team'
     AND status = 'pending';

  INSERT INTO public.invites (
    email, workspace_id, workspace_role, app_role, token, token_hash,
    invited_by, expires_at
  ) VALUES (
    _clean_email, NULL, 'viewer', 'dream_wave_team', _token, _hash,
    _uid, now() + make_interval(days => GREATEST(1, LEAST(_expires_days, 30)))
  )
  RETURNING id INTO _id;

  RETURN QUERY SELECT _id, _token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_invite(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_staff_invite(text, integer) TO authenticated;

-- Accept both client and owner-created staff invitations.
CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _hash text;
  _invite public.invites%ROWTYPE;
  _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');
  SELECT * INTO _invite FROM public.invites WHERE token_hash = _hash LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF _invite.status = 'accepted' THEN RAISE EXCEPTION 'invite_already_used'; END IF;
  IF _invite.status = 'revoked' THEN RAISE EXCEPTION 'invite_revoked'; END IF;
  IF _invite.expires_at < now() OR _invite.status = 'expired' THEN
    UPDATE public.invites SET status = 'expired' WHERE id = _invite.id AND status = 'pending';
    RAISE EXCEPTION 'invite_expired';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  IF _email IS NULL OR lower(_email) <> lower(_invite.email) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  IF _invite.workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (_invite.workspace_id, _uid, _invite.workspace_role)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF _invite.app_role IN ('client_owner', 'client_approver', 'client_viewer', 'dream_wave_team') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, _invite.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.invites SET accepted_at = now(), status = 'accepted' WHERE id = _invite.id;

  IF _invite.workspace_id IS NOT NULL THEN
    INSERT INTO public.activity_logs (
      workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
    ) VALUES (
      _invite.workspace_id, _uid, 'invitation_accepted', 'invite', _invite.id, '{}'::jsonb
    );
  END IF;

  RETURN _invite.workspace_id;
END;
$$;

-- Resend supports both workspace and staff invitations.
CREATE OR REPLACE FUNCTION public.resend_invite(_invite_id uuid, _extend_days integer DEFAULT 14)
RETURNS TABLE(raw_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _token text;
  _hash text;
  _ws uuid;
  _app_role public.app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT workspace_id, app_role INTO _ws, _app_role
  FROM public.invites WHERE id = _invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF _app_role = 'dream_wave_team' AND NOT public.has_role(_uid, 'dream_wave_owner') THEN
    RAISE EXCEPTION 'owner_required';
  END IF;

  _token := replace(replace(replace(encode(extensions.gen_random_bytes(48), 'base64'), '+', '-'), '/', '_'), '=', '');
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');

  UPDATE public.invites
     SET token = _token,
         token_hash = _hash,
         expires_at = now() + make_interval(days => GREATEST(1, LEAST(_extend_days, 30))),
         resend_count = resend_count + 1,
         last_sent_at = now(),
         status = 'pending',
         revoked_at = NULL,
         revoked_by = NULL,
         accepted_at = NULL
   WHERE id = _invite_id;

  IF _ws IS NOT NULL THEN
    INSERT INTO public.activity_logs (
      workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
    ) VALUES (_ws, _uid, 'invitation_resent', 'invite', _invite_id, '{}'::jsonb);
  END IF;

  RETURN QUERY SELECT _token;
END;
$$;

REVOKE ALL ON FUNCTION public.resend_invite(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resend_invite(uuid, integer) TO authenticated;

-- Revoke supports staff invitations, but only an owner may revoke staff access invitations.
CREATE OR REPLACE FUNCTION public.revoke_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ws uuid;
  _app_role public.app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT workspace_id, app_role INTO _ws, _app_role
  FROM public.invites WHERE id = _invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF _app_role = 'dream_wave_team' AND NOT public.has_role(_uid, 'dream_wave_owner') THEN
    RAISE EXCEPTION 'owner_required';
  END IF;

  UPDATE public.invites
     SET status = 'revoked', revoked_at = now(), revoked_by = _uid
   WHERE id = _invite_id AND status = 'pending';

  IF _ws IS NOT NULL THEN
    INSERT INTO public.activity_logs (
      workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
    ) VALUES (_ws, _uid, 'invitation_revoked', 'invite', _invite_id, '{}'::jsonb);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated;
