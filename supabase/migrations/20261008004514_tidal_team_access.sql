-- Public WaveOS team invitations belong exclusively to Tidal. Dream Wave
-- client workspaces retain their existing tier/role behavior.

CREATE OR REPLACE FUNCTION public.has_feature(_workspace_id uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _tier public.client_access_tier;
  _status public.account_status;
  _expires timestamptz;
  _overrides jsonb;
  _override_val jsonb;
  _data_source text;
  _social_plan text;
BEGIN
  SELECT access_tier, account_status, access_expires_at, feature_overrides, data_source
    INTO _tier, _status, _expires, _overrides, _data_source
    FROM public.workspaces WHERE id = _workspace_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF _data_source = 'os_data' THEN
    SELECT plan INTO _social_plan
      FROM public.workspace_social_subscriptions
      WHERE workspace_id = _workspace_id;

    IF NOT public.social_subscription_is_active(_workspace_id) THEN RETURN false; END IF;
    IF _feature IN ('can_use_ai_tools', 'can_schedule_content') THEN
      RETURN _social_plan IN ('full', 'expanded');
    END IF;
    IF _feature = 'can_invite_members' THEN
      RETURN _social_plan = 'expanded';
    END IF;
    RETURN _feature IN (
      'can_view_profile', 'can_edit_profile', 'can_manage_brand_voice',
      'can_view_calendar_preview', 'can_view_media_library', 'can_upload_media',
      'can_create_content', 'can_connect_socials', 'can_publish_content',
      'can_view_analytics', 'can_view_activity_log', 'can_manage_workspace'
    );
  END IF;

  _override_val := _overrides -> _feature;
  IF _override_val IS NOT NULL AND pg_catalog.jsonb_typeof(_override_val) = 'boolean' THEN
    RETURN (_override_val)::text::boolean;
  END IF;
  IF _tier::text = 'wedding_client' THEN
    RETURN _feature IN ('can_view_profile', 'can_view_invoices', 'can_contact_support')
      OR (_status = 'active' AND _feature = 'can_view_deliveries');
  END IF;
  IF _status IN ('suspended', 'archived') THEN
    RETURN _feature IN ('can_view_deliveries', 'can_view_invoices', 'can_view_profile');
  END IF;
  IF _status = 'expired' OR (_expires IS NOT NULL AND _expires < now()) THEN
    RETURN _feature IN (
      'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
      'can_edit_profile', 'can_contact_support'
    );
  END IF;

  CASE _tier::text
    WHEN 'project_client' THEN
      RETURN _feature IN (
        'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
        'can_edit_profile', 'can_contact_support'
      );
    WHEN 'growth_90' THEN
      RETURN _feature IN (
        'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
        'can_edit_profile', 'can_contact_support', 'can_review_content',
        'can_request_changes', 'can_manage_brand_voice',
        'can_view_calendar_preview', 'can_view_media_library',
        'can_upload_media', 'can_use_ai_tools', 'can_view_analytics',
        'can_view_activity_log', 'can_invite_members', 'can_manage_workspace'
      );
    WHEN 'retainer_full' THEN RETURN true;
    WHEN 'social_management' THEN RETURN true;
    ELSE RETURN false;
  END CASE;
END;
$function$;

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
  _data_source text;
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
  SELECT data_source INTO _data_source FROM public.workspaces WHERE id = _workspace_id;
  IF _data_source = 'os_data' AND NOT public.has_feature(_workspace_id, 'can_invite_members') THEN
    RAISE EXCEPTION 'tidal_plan_required';
  END IF;
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
  _data_source text;
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
  SELECT data_source INTO _data_source FROM public.workspaces WHERE id = _ws;
  IF _data_source = 'os_data' AND NOT public.has_feature(_ws, 'can_invite_members') THEN
    RAISE EXCEPTION 'tidal_plan_required';
  END IF;
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

REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_invite(text, uuid, public.workspace_member_role, public.app_role, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resend_invite(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_invite(text, uuid, public.workspace_member_role, public.app_role, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_invite(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
