-- Social media managers and the Dream Wave owner can choose per post whether
-- to request client approval or publish/schedule directly. Client permissions
-- and the workspace's default approval preference are unchanged.
CREATE OR REPLACE FUNCTION public.can_staff_manage_workspace(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS roles
    WHERE roles.user_id = _user_id
      AND (
        roles.role = 'dream_wave_owner'
        OR (
          roles.role = 'dream_wave_team'
          AND roles.staff_type = 'media_manager'
          AND EXISTS (
            SELECT 1 FROM public.workspaces
            WHERE workspaces.id = _workspace_id
              AND (
                workspaces.id = '11111111-1111-1111-1111-111111111111'::uuid
                OR workspaces.access_tier::text = 'social_management'
                OR coalesce(workspaces.feature_overrides -> 'social_management_access' = 'true'::jsonb, false)
                OR public.social_subscription_is_active(workspaces.id)
              )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_staff_manage_workspace(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_staff_manage_workspace(uuid,uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_release_content(
  _content_id uuid,
  _release_mode text,
  _requested_action text,
  _scheduled_at timestamptz DEFAULT NULL
)
RETURNS public.content_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _item public.content_items%ROWTYPE;
  _next public.content_status;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _release_mode NOT IN ('approval', 'direct') THEN RAISE EXCEPTION 'invalid_release_mode'; END IF;
  IF _requested_action NOT IN ('publish_now', 'schedule') THEN RAISE EXCEPTION 'invalid_requested_action'; END IF;
  IF _requested_action = 'schedule' AND (_scheduled_at IS NULL OR _scheduled_at <= now()) THEN
    RAISE EXCEPTION 'schedule_time_must_be_future';
  END IF;

  SELECT * INTO _item
  FROM public.content_items
  WHERE id = _content_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'content_not_found'; END IF;
  IF NOT public.can_staff_manage_workspace(_uid, _item.workspace_id) THEN
    RAISE EXCEPTION 'social_media_staff_required';
  END IF;
  IF _item.status IN ('publishing', 'published', 'archived') THEN
    RAISE EXCEPTION 'content_cannot_be_released';
  END IF;

  IF _release_mode = 'approval' THEN
    INSERT INTO public.approvals (content_item_id, workspace_id, decision, note)
    VALUES (
      _item.id,
      _item.workspace_id,
      'pending',
      CASE WHEN _requested_action = 'schedule'
        THEN 'Requested schedule: ' || _scheduled_at::text
        ELSE 'Requested immediate publishing' END
    );

    UPDATE public.content_items
    SET status = 'in_review',
        scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
        approved_by = NULL,
        approved_at = NULL,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'approval_request', jsonb_build_object(
            'action', _requested_action,
            'submitted_by', _uid,
            'submitted_at', now(),
            'staff_selected_mode', 'approval'
          )
        )
    WHERE id = _item.id;

    INSERT INTO public.notifications (user_id, workspace_id, kind, title, body, link)
    SELECT members.user_id, _item.workspace_id, 'content_submitted',
      'Content ready for approval', coalesce(_item.title, 'Untitled post'), '/approvals'
    FROM public.workspace_members AS members
    WHERE members.workspace_id = _item.workspace_id
      AND members.role::text IN ('owner', 'admin', 'approver')
      AND members.user_id <> _uid;

    _next := 'in_review'::public.content_status;
  ELSE
    _next := CASE WHEN _requested_action = 'schedule'
      THEN 'scheduled'::public.content_status
      ELSE 'approved'::public.content_status END;

    UPDATE public.content_items
    SET status = _next,
        scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
        approved_by = _uid,
        approved_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'approval_bypass', jsonb_build_object(
            'action', _requested_action,
            'selected_by', _uid,
            'selected_at', now(),
            'reason', 'authorized_social_media_staff'
          )
        )
    WHERE id = _item.id;
  END IF;

  INSERT INTO public.activity_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _item.workspace_id,
    _uid,
    'content_release_mode_selected',
    'content_item',
    _item.id,
    jsonb_build_object('release_mode', _release_mode, 'requested_action', _requested_action)
  );

  RETURN _next;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_release_content(uuid,text,text,timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_release_content(uuid,text,text,timestamptz)
  TO authenticated;
