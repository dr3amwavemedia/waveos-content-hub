-- Route content publishing through a real approval boundary. Staff can submit
-- work for a client, while client approvers and Dream Wave staff/admins can
-- make the final decision. Direct writes to approvals are removed from the
-- exposed Data API; the audited RPCs below are the only mutation path.

DROP POLICY IF EXISTS "members access approvals" ON public.approvals;

CREATE POLICY "members read approvals"
  ON public.approvals FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((select auth.uid()), workspace_id)
    OR public.is_dream_wave_staff((select auth.uid()))
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
  _role public.workspace_member_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _requested_action NOT IN ('publish_now', 'schedule') THEN
    RAISE EXCEPTION 'invalid_requested_action';
  END IF;
  IF _requested_action = 'schedule' AND (_scheduled_at IS NULL OR _scheduled_at <= now()) THEN
    RAISE EXCEPTION 'schedule_time_must_be_future';
  END IF;

  SELECT * INTO _item FROM public.content_items WHERE id = _content_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'content_not_found'; END IF;
  _role := public.workspace_role(_uid, _item.workspace_id);
  IF NOT public.is_dream_wave_staff(_uid)
     AND coalesce(_role::text, '') NOT IN ('owner', 'admin', 'editor', 'approver') THEN
    RAISE EXCEPTION 'not_allowed_to_submit';
  END IF;
  IF _item.status IN ('publishing', 'published', 'archived') THEN
    RAISE EXCEPTION 'content_cannot_be_submitted';
  END IF;

  INSERT INTO public.approvals (content_item_id, workspace_id, decision, note)
  VALUES (_item.id, _item.workspace_id, 'pending',
    CASE WHEN _requested_action = 'schedule'
      THEN 'Requested schedule: ' || _scheduled_at::text
      ELSE 'Requested immediate publishing'
    END);

  UPDATE public.content_items
  SET status = 'in_review',
      scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
      approved_by = NULL,
      approved_at = NULL,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'approval_request', jsonb_build_object(
          'action', _requested_action,
          'submitted_by', _uid,
          'submitted_at', now()
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
  IF NOT public.is_dream_wave_staff(_uid)
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
    ELSE 'draft'::public.content_status
  END;

  UPDATE public.approvals
  SET reviewer_id = _uid, decision = _decision, note = nullif(btrim(coalesce(_note, '')), ''),
      decided_at = now()
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
      _item.created_by,
      _item.workspace_id,
      CASE _decision
        WHEN 'approved' THEN 'content_approved'::public.notification_kind
        WHEN 'changes_requested' THEN 'content_changes_requested'::public.notification_kind
        ELSE 'content_rejected'::public.notification_kind
      END,
      CASE _decision
        WHEN 'approved' THEN 'Content approved'
        WHEN 'changes_requested' THEN 'Changes requested'
        ELSE 'Content rejected'
      END,
      coalesce(_item.title, 'Untitled post'),
      '/approvals'
    );
  END IF;

  RETURN _next;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_content_for_approval(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_content_approval(uuid, public.approval_decision, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_content_for_approval(uuid, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_content_approval(uuid, public.approval_decision, text) TO authenticated, service_role;
