-- Workspace owners/admins may manage invitations for their workspace.
CREATE POLICY "Workspace managers can view invites"
  ON public.invites FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (SELECT auth.uid())
        AND wm.role IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION public.create_invite(
  _email text, _workspace_id uuid,
  _workspace_role public.workspace_member_role, _app_role public.app_role,
  _expires_days integer DEFAULT 14
)
RETURNS TABLE(invite_id uuid, raw_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := auth.uid(); _token text; _hash text; _id uuid;
  _clean_email text := lower(btrim(coalesce(_email, '')));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF _workspace_role NOT IN ('admin', 'editor', 'approver', 'viewer') THEN
    RAISE EXCEPTION 'invalid_workspace_role';
  END IF;
  IF NOT public.is_dream_wave_staff(_uid) AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id AND wm.user_id = _uid
      AND wm.role IN ('owner', 'admin')
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _app_role IN ('dream_wave_owner', 'dream_wave_team') THEN
    RAISE EXCEPTION 'staff_roles_not_invitable_here';
  END IF;

  _token := replace(replace(replace(encode(extensions.gen_random_bytes(48), 'base64'), '+', '-'), '/', '_'), '=', '');
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');
  UPDATE public.invites SET status = 'revoked', revoked_at = now(), revoked_by = _uid
  WHERE email = _clean_email AND workspace_id = _workspace_id AND status = 'pending';
  INSERT INTO public.invites (
    email, workspace_id, workspace_role, app_role, token, token_hash, invited_by, expires_at
  ) VALUES (
    _clean_email, _workspace_id, _workspace_role, _app_role, _token, _hash, _uid,
    now() + make_interval(days => greatest(1, least(_expires_days, 30)))
  ) RETURNING id INTO _id;
  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_workspace_id, _uid, 'invitation_created', 'invite', _id,
    jsonb_build_object('email', _clean_email, 'role', _workspace_role::text));
  RETURN QUERY SELECT _id, _token;
END;
$$;

CREATE OR REPLACE FUNCTION public.resend_invite(_invite_id uuid, _extend_days integer DEFAULT 14)
RETURNS TABLE(raw_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := auth.uid(); _token text; _hash text; _ws uuid; _app_role public.app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT i.workspace_id, i.app_role INTO _ws, _app_role FROM public.invites i WHERE i.id = _invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF _app_role = 'dream_wave_team' THEN
    IF NOT public.has_role(_uid, 'dream_wave_owner') THEN RAISE EXCEPTION 'owner_required'; END IF;
  ELSIF NOT public.is_dream_wave_staff(_uid) AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _ws AND wm.user_id = _uid AND wm.role IN ('owner', 'admin')
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _token := replace(replace(replace(encode(extensions.gen_random_bytes(48), 'base64'), '+', '-'), '/', '_'), '=', '');
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');
  UPDATE public.invites SET token = _token, token_hash = _hash,
    expires_at = now() + make_interval(days => greatest(1, least(_extend_days, 30))),
    resend_count = resend_count + 1, last_sent_at = now(), status = 'pending',
    revoked_at = NULL, revoked_by = NULL, accepted_at = NULL WHERE id = _invite_id;
  IF _ws IS NOT NULL THEN
    INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
    VALUES (_ws, _uid, 'invitation_resent', 'invite', _invite_id, '{}'::jsonb);
  END IF;
  RETURN QUERY SELECT _token;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_invite(_invite_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _uid uuid := auth.uid(); _ws uuid; _app_role public.app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT i.workspace_id, i.app_role INTO _ws, _app_role FROM public.invites i WHERE i.id = _invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF _app_role = 'dream_wave_team' THEN
    IF NOT public.has_role(_uid, 'dream_wave_owner') THEN RAISE EXCEPTION 'owner_required'; END IF;
  ELSIF NOT public.is_dream_wave_staff(_uid) AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _ws AND wm.user_id = _uid AND wm.role IN ('owner', 'admin')
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.invites SET status = 'revoked', revoked_at = now(), revoked_by = _uid
  WHERE id = _invite_id AND status = 'pending';
  IF _ws IS NOT NULL THEN
    INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
    VALUES (_ws, _uid, 'invitation_revoked', 'invite', _invite_id, '{}'::jsonb);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invite(text, uuid, public.workspace_member_role, public.app_role, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resend_invite(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invite(text, uuid, public.workspace_member_role, public.app_role, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_invite(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated;
