CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _hash text;
  _invite public.invites%ROWTYPE;
  _email text;
  _name text;
  _ws_name text;
  _admin uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');
  SELECT * INTO _invite FROM public.invites WHERE token_hash = _hash LIMIT 1 FOR UPDATE;
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
      _invite.workspace_id, _uid, 'invitation_accepted', 'invite', _invite.id,
      jsonb_build_object('role', _invite.workspace_role::text)
    );

    SELECT w.name INTO _ws_name FROM public.workspaces w WHERE w.id = _invite.workspace_id;
    SELECT btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      INTO _name FROM public.profiles p WHERE p.id = _uid;
    IF _name IS NULL OR _name = '' THEN _name := _email; END IF;

    FOR _admin IN
      SELECT DISTINCT x.uid FROM (
        SELECT u.user_id AS uid FROM public.user_roles u
        WHERE u.role IN ('dream_wave_owner', 'dream_wave_team')
        UNION
        SELECT _invite.invited_by AS uid WHERE _invite.invited_by IS NOT NULL
      ) x WHERE x.uid IS NOT NULL
    LOOP
      INSERT INTO public.notifications (user_id, workspace_id, kind, title, body, link)
      VALUES (
        _admin, _invite.workspace_id, 'invite_accepted',
        'Signup completed: ' || _name,
        _name || ' (' || _email || ') joined ' || coalesce(_ws_name, 'the workspace')
          || ' as ' || _invite.workspace_role::text || '. Signup successfully completed.',
        '/clients'
      );
    END LOOP;
  END IF;

  RETURN _invite.workspace_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_workspace_member_role(
  _workspace_id uuid,
  _user_id uuid,
  _role workspace_member_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _role NOT IN ('owner', 'approver', 'viewer') THEN RAISE EXCEPTION 'unsupported_role'; END IF;

  UPDATE public.workspace_members
    SET role = _role
    WHERE workspace_id = _workspace_id AND user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found'; END IF;

  DELETE FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('client_owner', 'client_approver', 'client_viewer');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    _user_id,
    CASE _role
      WHEN 'owner' THEN 'client_owner'::app_role
      WHEN 'approver' THEN 'client_approver'::app_role
      ELSE 'client_viewer'::app_role
    END
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_workspace_id, _uid, 'member_role_changed', 'workspace_member', _user_id,
    jsonb_build_object('role', _role::text));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_workspace_member_role(uuid, uuid, workspace_member_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_workspace_member_role(uuid, uuid, workspace_member_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_client_invite_overview(_workspace_id uuid)
RETURNS TABLE(
  invite_id uuid,
  email text,
  workspace_role workspace_member_role,
  status invite_status,
  expires_at timestamptz,
  created_at timestamptz,
  resend_count integer,
  account_state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.email,
    i.workspace_role,
    i.status,
    i.expires_at,
    i.created_at,
    i.resend_count,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM auth.users u
        JOIN public.workspace_members m
          ON m.user_id = u.id AND m.workspace_id = i.workspace_id
        WHERE lower(u.email) = lower(i.email)
      ) THEN 'active'
      WHEN EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(i.email))
        THEN 'pending_signup'
      ELSE 'invited'
    END AS account_state
  FROM public.invites i
  WHERE i.workspace_id = _workspace_id
  ORDER BY i.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_client_invite_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_invite_overview(uuid) TO authenticated;