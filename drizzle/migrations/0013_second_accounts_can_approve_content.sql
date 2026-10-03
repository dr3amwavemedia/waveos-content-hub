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
     AND coalesce(_role::text, '') NOT IN ('owner', 'admin', 'editor', 'approver') THEN
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

REVOKE ALL ON FUNCTION public.decide_content_approval(uuid, public.approval_decision, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_content_approval(uuid, public.approval_decision, text) TO authenticated, service_role;