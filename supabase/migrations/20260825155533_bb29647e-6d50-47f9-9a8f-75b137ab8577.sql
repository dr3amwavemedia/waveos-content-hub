-- 1. Additive: optional person names on invites
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS last_name text;

-- 2. Staff can attach a person name to an invite (called right after create_invite)
CREATE OR REPLACE FUNCTION public.admin_set_invite_person_name(
  _invite_id uuid,
  _first_name text DEFAULT NULL,
  _last_name text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.invites
     SET first_name = nullif(btrim(coalesce(_first_name, '')), ''),
         last_name  = nullif(btrim(coalesce(_last_name, '')), '')
   WHERE id = _invite_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_invite_person_name(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_invite_person_name(uuid, text, text) TO authenticated;

-- 3. Staff can edit an individual client member's name (never the business name)
CREATE OR REPLACE FUNCTION public.admin_set_client_member_name(
  _workspace_id uuid,
  _user_id uuid,
  _first_name text DEFAULT NULL,
  _last_name text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = _workspace_id AND user_id = _user_id
  ) THEN RAISE EXCEPTION 'member_not_found'; END IF;

  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (
    _user_id,
    nullif(btrim(coalesce(_first_name, '')), ''),
    nullif(btrim(coalesce(_last_name, '')), '')
  )
  ON CONFLICT (id) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        updated_at = now();

  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_workspace_id, _uid, 'member_name_updated', 'workspace_member', _user_id, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_client_member_name(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_client_member_name(uuid, uuid, text, text) TO authenticated;

-- 4. accept_invite: additive name backfill only when the profile has no name yet
CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  -- Names on the invite are optional. Only fill blanks; never overwrite.
  IF _invite.first_name IS NOT NULL OR _invite.last_name IS NOT NULL THEN
    INSERT INTO public.profiles (id, first_name, last_name)
    VALUES (_uid, _invite.first_name, _invite.last_name)
    ON CONFLICT (id) DO UPDATE
      SET first_name = coalesce(nullif(btrim(coalesce(public.profiles.first_name, '')), ''), EXCLUDED.first_name),
          last_name  = coalesce(nullif(btrim(coalesce(public.profiles.last_name, '')), ''), EXCLUDED.last_name);
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

-- 5. Invite overview gains optional names (drop/recreate needed for new columns)
DROP FUNCTION IF EXISTS public.get_client_invite_overview(uuid);
CREATE FUNCTION public.get_client_invite_overview(_workspace_id uuid)
 RETURNS TABLE(invite_id uuid, email text, first_name text, last_name text,
   workspace_role workspace_member_role, status invite_status,
   expires_at timestamp with time zone, created_at timestamp with time zone,
   resend_count integer, account_state text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT i.id, i.email, i.first_name, i.last_name, i.workspace_role, i.status,
    i.expires_at, i.created_at, i.resend_count,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM auth.users u
        JOIN public.workspace_members m ON m.user_id = u.id AND m.workspace_id = i.workspace_id
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
$$;
REVOKE ALL ON FUNCTION public.get_client_invite_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_invite_overview(uuid) TO authenticated;

-- 6. Admin Account Health diagnostic (staff-only, no secrets/tokens returned)
CREATE OR REPLACE FUNCTION public.admin_account_health(_user_id uuid, _workspace_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _has_profile boolean;
  _profile_name text;
  _roles text[];
  _membership_count int;
  _role text;
  _ws record;
  _ws_id uuid;
  _access_ok boolean := true;
  _access_reason text := NULL;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT u.email::text INTO _email FROM auth.users u WHERE u.id = _user_id;

  SELECT true, nullif(btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '')
    INTO _has_profile, _profile_name
    FROM public.profiles p WHERE p.id = _user_id;

  SELECT coalesce(array_agg(r.role::text ORDER BY r.role::text), '{}')
    INTO _roles FROM public.user_roles r WHERE r.user_id = _user_id;

  SELECT count(*) INTO _membership_count
    FROM public.workspace_members m WHERE m.user_id = _user_id;

  SELECT m.workspace_id, m.role::text INTO _ws_id, _role
    FROM public.workspace_members m
    WHERE m.user_id = _user_id
      AND (_workspace_id IS NULL OR m.workspace_id = _workspace_id)
    ORDER BY m.created_at
    LIMIT 1;

  IF _ws_id IS NOT NULL THEN
    SELECT w.id, w.name, w.access_tier::text AS tier, w.account_status::text AS status,
           w.access_expires_at, w.is_archived
      INTO _ws FROM public.workspaces w WHERE w.id = _ws_id;

    IF _ws.id IS NULL THEN
      _access_ok := false; _access_reason := 'The connected workspace no longer exists.';
    ELSIF _ws.is_archived THEN
      _access_ok := false; _access_reason := 'This workspace is archived.';
    ELSIF _ws.status = 'suspended' THEN
      _access_ok := false; _access_reason := 'Account access is suspended.';
    ELSIF _ws.access_expires_at IS NOT NULL AND _ws.access_expires_at < now() THEN
      _access_ok := false; _access_reason := 'Account access expired on '
        || to_char(_ws.access_expires_at, 'Mon DD, YYYY') || '.';
    ELSIF _ws.status = 'pending' THEN
      _access_ok := false; _access_reason := 'Account is created but not activated yet.';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'auth', jsonb_build_object('ok', _email IS NOT NULL, 'detail', _email,
      'reason', CASE WHEN _email IS NULL THEN 'No sign-in account exists for this user id.' END),
    'profile', jsonb_build_object('ok', coalesce(_has_profile, false), 'detail', _profile_name,
      'reason', CASE WHEN NOT coalesce(_has_profile, false) THEN 'No profile record is connected to this user.' END),
    'role', jsonb_build_object('ok', array_length(_roles, 1) > 0,
      'detail', array_to_string(_roles, ', '),
      'reason', CASE WHEN array_length(_roles, 1) IS NULL THEN 'No app role is assigned to this user.' END),
    'membership', jsonb_build_object('ok', _ws_id IS NOT NULL,
      'detail', CASE WHEN _ws_id IS NOT NULL THEN _role || ' · ' || _membership_count::text || ' workspace(s)' END,
      'reason', CASE WHEN _ws_id IS NULL THEN 'No workspace membership is connected to this user.' END),
    'workspace', jsonb_build_object('ok', _ws.id IS NOT NULL, 'detail', _ws.name,
      'reason', CASE WHEN _ws_id IS NOT NULL AND _ws.id IS NULL THEN 'The connected workspace could not be loaded.'
                     WHEN _ws_id IS NULL THEN 'No workspace to check yet.' END),
    'access', jsonb_build_object('ok', _ws_id IS NOT NULL AND _access_ok,
      'detail', CASE WHEN _ws.id IS NOT NULL THEN _ws.tier || ' · ' || _ws.status END,
      'reason', CASE WHEN _ws_id IS NULL THEN 'No workspace to check yet.' ELSE _access_reason END)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_account_health(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_account_health(uuid, uuid) TO authenticated;