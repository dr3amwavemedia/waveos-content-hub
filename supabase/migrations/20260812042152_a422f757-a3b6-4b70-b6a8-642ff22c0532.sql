-- Layer 4 has the same product features as Layer 3, but explicitly permits
-- Dream Wave social managers to operate the client workspace. Client owners
-- can also temporarily bypass per-post approval from their Settings page.

ALTER TYPE public.client_access_tier ADD VALUE IF NOT EXISTS 'social_management';

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT true;

UPDATE public.workspaces
SET approval_required = false
WHERE id = '11111111-1111-1111-1111-111111111111'::uuid;

CREATE OR REPLACE FUNCTION public.can_staff_manage_workspace(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role = 'dream_wave_owner'
        OR (
          ur.role = 'dream_wave_team'
          AND ur.staff_type = 'media_manager'
          AND EXISTS (
            SELECT 1 FROM public.workspaces w
            WHERE w.id = _workspace_id
              AND (
                w.id = '11111111-1111-1111-1111-111111111111'::uuid
                OR w.access_tier::text = 'social_management'
              )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_staff_manage_workspace(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_staff_manage_workspace(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_workspace_automatic_content_approval(
  _workspace_id uuid,
  _enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _role public.workspace_member_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'client_owner_required'; END IF;

  _role := public.workspace_role(_uid, _workspace_id);
  IF coalesce(_role::text, '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'client_owner_required';
  END IF;

  UPDATE public.workspaces
  SET approval_required = NOT _enabled
  WHERE id = _workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace_not_found'; END IF;

  INSERT INTO public.activity_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _workspace_id, _uid, 'approval_mode_changed', 'workspace', _workspace_id,
    jsonb_build_object('automatic_approval', _enabled)
  );

  RETURN _enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_automatic_content_approval(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_automatic_content_approval(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_feature(_workspace_id uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier public.client_access_tier;
  _status public.account_status;
  _expires timestamptz;
  _overrides jsonb;
  _override_val jsonb;
BEGIN
  SELECT access_tier, account_status, access_expires_at, feature_overrides
    INTO _tier, _status, _expires, _overrides
    FROM public.workspaces WHERE id = _workspace_id;
  IF NOT FOUND THEN RETURN false; END IF;

  _override_val := _overrides -> _feature;
  IF _override_val IS NOT NULL AND jsonb_typeof(_override_val) = 'boolean' THEN
    RETURN (_override_val)::text::boolean;
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
        'can_upload_media', 'can_create_content', 'can_use_ai_tools',
        'can_view_analytics', 'can_view_activity_log', 'can_invite_members',
        'can_manage_workspace'
      );
    WHEN 'retainer_full' THEN RETURN true;
    WHEN 'social_management' THEN RETURN true;
    ELSE RETURN false;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "members read approvals" ON public.approvals;
CREATE POLICY "members read approvals"
  ON public.approvals FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((select auth.uid()), workspace_id)
    OR public.can_staff_manage_workspace((select auth.uid()), workspace_id)
  );

CREATE OR REPLACE FUNCTION public.submit_content_for_approval(
  _content_id uuid,
  _requested_action text,
  _scheduled_at timestamptz DEFAULT NULL
)
RETURNS public.content_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _item public.content_items%ROWTYPE;
  _workspace public.workspaces%ROWTYPE;
  _role public.workspace_member_role;
  _next public.content_status;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _requested_action NOT IN ('publish_now', 'schedule') THEN RAISE EXCEPTION 'invalid_requested_action'; END IF;
  IF _requested_action = 'schedule' AND (_scheduled_at IS NULL OR _scheduled_at <= now()) THEN
    RAISE EXCEPTION 'schedule_time_must_be_future';
  END IF;

  SELECT * INTO _item FROM public.content_items WHERE id = _content_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'content_not_found'; END IF;
  SELECT * INTO _workspace FROM public.workspaces WHERE id = _item.workspace_id;
  _role := public.workspace_role(_uid, _item.workspace_id);
  IF NOT public.can_staff_manage_workspace(_uid, _item.workspace_id)
     AND coalesce(_role::text, '') NOT IN ('owner', 'admin', 'editor', 'approver') THEN
    RAISE EXCEPTION 'not_allowed_to_submit';
  END IF;
  IF _item.status IN ('publishing', 'published', 'archived') THEN RAISE EXCEPTION 'content_cannot_be_submitted'; END IF;

  IF NOT _workspace.approval_required
     OR _item.workspace_id = '11111111-1111-1111-1111-111111111111'::uuid THEN
    _next := CASE WHEN _requested_action = 'schedule'
      THEN 'scheduled'::public.content_status ELSE 'approved'::public.content_status END;
    UPDATE public.content_items
    SET status = _next,
        scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
        approved_by = _uid,
        approved_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'approval_request', jsonb_build_object(
            'action', _requested_action, 'submitted_by', _uid,
            'submitted_at', now(), 'automatically_approved', true
          )
        )
    WHERE id = _item.id;
    RETURN _next;
  END IF;

  INSERT INTO public.approvals (content_item_id, workspace_id, decision, note)
  VALUES (_item.id, _item.workspace_id, 'pending',
    CASE WHEN _requested_action = 'schedule'
      THEN 'Requested schedule: ' || _scheduled_at::text
      ELSE 'Requested immediate publishing' END);

  UPDATE public.content_items
  SET status = 'in_review',
      scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
      approved_by = NULL,
      approved_at = NULL,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'approval_request', jsonb_build_object(
          'action', _requested_action, 'submitted_by', _uid, 'submitted_at', now()
        )
      )
  WHERE id = _item.id;

  INSERT INTO public.notifications (user_id, workspace_id, kind, title, body, link)
  SELECT wm.user_id, _item.workspace_id, 'content_submitted',
    'Content ready for approval', coalesce(_item.title, 'Untitled post'), '/approvals'
  FROM public.workspace_members wm
  WHERE wm.workspace_id = _item.workspace_id
    AND wm.role::text IN ('owner', 'admin', 'approver')
    AND wm.user_id <> _uid;

  RETURN 'in_review'::public.content_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_content_approval(
  _content_id uuid,
  _decision public.approval_decision,
  _note text DEFAULT NULL
)
RETURNS public.content_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _item public.content_items%ROWTYPE;
  _role public.workspace_member_role;
  _action text;
  _next public.content_status;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _decision = 'pending' THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  SELECT * INTO _item FROM public.content_items WHERE id = _content_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'content_not_found'; END IF;
  _role := public.workspace_role(_uid, _item.workspace_id);
  IF NOT public.can_staff_manage_workspace(_uid, _item.workspace_id)
     AND coalesce(_role::text, '') NOT IN ('owner', 'admin', 'approver') THEN
    RAISE EXCEPTION 'not_allowed_to_approve';
  END IF;
  IF _item.status NOT IN ('in_review', 'changes_requested') THEN
    RAISE EXCEPTION 'content_not_waiting_for_approval';
  END IF;

  _action := _item.metadata #>> '{approval_request,action}';
  _next := CASE
    WHEN _decision = 'approved' AND _action = 'schedule' THEN 'scheduled'::public.content_status
    WHEN _decision = 'approved' THEN 'approved'::public.content_status
    WHEN _decision = 'changes_requested' THEN 'changes_requested'::public.content_status
    ELSE 'draft'::public.content_status END;

  UPDATE public.approvals
  SET reviewer_id = _uid, decision = _decision,
      note = nullif(btrim(coalesce(_note, '')), ''), decided_at = now()
  WHERE id = (
    SELECT id FROM public.approvals
    WHERE content_item_id = _item.id AND decision = 'pending'
    ORDER BY created_at DESC LIMIT 1
  );
  UPDATE public.content_items
  SET status = _next,
      approved_by = CASE WHEN _decision = 'approved' THEN _uid ELSE NULL END,
      approved_at = CASE WHEN _decision = 'approved' THEN now() ELSE NULL END
  WHERE id = _item.id;

  IF _item.created_by IS NOT NULL AND _item.created_by <> _uid THEN
    INSERT INTO public.notifications (user_id, workspace_id, kind, title, body, link)
    VALUES (
      _item.created_by, _item.workspace_id,
      CASE _decision
        WHEN 'approved' THEN 'content_approved'::public.notification_kind
        WHEN 'changes_requested' THEN 'content_changes_requested'::public.notification_kind
        ELSE 'content_rejected'::public.notification_kind END,
      CASE _decision
        WHEN 'approved' THEN 'Content approved'
        WHEN 'changes_requested' THEN 'Changes requested'
        ELSE 'Content rejected' END,
      coalesce(_item.title, 'Untitled post'), '/approvals'
    );
  END IF;
  RETURN _next;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_content_for_approval(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_content_approval(uuid, public.approval_decision, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_content_for_approval(uuid, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_content_approval(uuid, public.approval_decision, text) TO authenticated, service_role;