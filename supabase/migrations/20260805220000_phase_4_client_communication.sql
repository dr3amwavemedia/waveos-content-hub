-- Phase 4: client communication, approvals, onboarding checklists, and timeline.
-- All changes are additive. Shared records and staff-only notes are separated.

CREATE TABLE IF NOT EXISTS public.client_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 140),
  description text,
  request_type text NOT NULL DEFAULT 'approval'
    CHECK (request_type IN ('approval','information','asset','decision')),
  decision public.approval_decision NOT NULL DEFAULT 'pending',
  response_note text,
  due_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_request_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.client_requests(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 160),
  description text,
  checklist_type text NOT NULL DEFAULT 'onboarding'
    CHECK (checklist_type IN ('onboarding','project')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','completed','skipped')),
  due_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_contact_preferences (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_method text NOT NULL DEFAULT 'email'
    CHECK (preferred_method IN ('email','phone','text','waveos')),
  best_time text,
  contact_email text,
  contact_phone text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS client_requests_workspace_due_idx
  ON public.client_requests(workspace_id, decision, due_at);
CREATE INDEX IF NOT EXISTS client_request_notes_request_idx
  ON public.client_request_internal_notes(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_checklist_workspace_idx
  ON public.client_checklist_items(workspace_id, checklist_type, sort_order);

ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_request_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contact_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.client_requests, public.client_request_internal_notes,
  public.client_checklist_items, public.client_contact_preferences FROM anon;
GRANT SELECT ON public.client_requests, public.client_checklist_items,
  public.client_contact_preferences TO authenticated;
GRANT SELECT, INSERT ON public.client_request_internal_notes TO authenticated;
GRANT ALL ON public.client_requests, public.client_request_internal_notes,
  public.client_checklist_items, public.client_contact_preferences TO service_role;

DROP POLICY IF EXISTS "workspace reads client requests" ON public.client_requests;
CREATE POLICY "workspace reads client requests" ON public.client_requests FOR SELECT TO authenticated
USING (
  public.is_dream_wave_staff((select auth.uid()))
  OR public.is_workspace_member((select auth.uid()), workspace_id)
);

DROP POLICY IF EXISTS "staff reads request internal notes" ON public.client_request_internal_notes;
CREATE POLICY "staff reads request internal notes" ON public.client_request_internal_notes FOR SELECT TO authenticated
USING (public.is_dream_wave_staff((select auth.uid())));
DROP POLICY IF EXISTS "staff adds request internal notes" ON public.client_request_internal_notes;
CREATE POLICY "staff adds request internal notes" ON public.client_request_internal_notes FOR INSERT TO authenticated
WITH CHECK (
  public.is_dream_wave_staff((select auth.uid()))
  AND created_by = (select auth.uid())
);

DROP POLICY IF EXISTS "workspace reads checklist" ON public.client_checklist_items;
CREATE POLICY "workspace reads checklist" ON public.client_checklist_items FOR SELECT TO authenticated
USING (
  public.is_dream_wave_staff((select auth.uid()))
  OR public.is_workspace_member((select auth.uid()), workspace_id)
);

DROP POLICY IF EXISTS "workspace reads contact preferences" ON public.client_contact_preferences;
CREATE POLICY "workspace reads contact preferences" ON public.client_contact_preferences FOR SELECT TO authenticated
USING (
  public.is_dream_wave_staff((select auth.uid()))
  OR user_id = (select auth.uid())
);

CREATE OR REPLACE FUNCTION public.phase4_create_request(
  _workspace_id uuid, _title text, _description text DEFAULT NULL,
  _request_type text DEFAULT 'approval', _due_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _member record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'staff_required'; END IF;
  IF _request_type NOT IN ('approval','information','asset','decision') THEN
    RAISE EXCEPTION 'invalid_request_type';
  END IF;
  INSERT INTO public.client_requests(workspace_id,title,description,request_type,due_at,created_by)
  VALUES (_workspace_id,btrim(_title),nullif(btrim(coalesce(_description,'')),''),_request_type,_due_at,_uid)
  RETURNING id INTO _id;
  FOR _member IN SELECT user_id FROM public.workspace_members WHERE workspace_id = _workspace_id LOOP
    INSERT INTO public.notifications(user_id,workspace_id,kind,title,body,link)
    VALUES (_member.user_id,_workspace_id,'generic','New client request',btrim(_title),'/approvals');
  END LOOP;
  INSERT INTO public.activity_logs(workspace_id,actor_user_id,action,entity_type,entity_id,safe_metadata)
  VALUES (_workspace_id,_uid,'client_request_created','client_request',_id,
    jsonb_build_object('title',btrim(_title),'request_type',_request_type,'due_at',_due_at));
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.phase4_respond_to_request(
  _request_id uuid, _decision public.approval_decision, _response_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _request public.client_requests%ROWTYPE; _staff record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _decision NOT IN ('approved','changes_requested','rejected') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  SELECT * INTO _request FROM public.client_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT (
    public.is_dream_wave_staff(_uid)
    OR public.is_workspace_member(_uid,_request.workspace_id)
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.client_requests SET
    decision = _decision,
    response_note = nullif(btrim(coalesce(_response_note,'')),''),
    responded_by = _uid,
    responded_at = now(),
    updated_at = now()
  WHERE id = _request_id;
  FOR _staff IN SELECT DISTINCT user_id FROM public.user_roles
    WHERE role IN ('dream_wave_owner','dream_wave_team') LOOP
    IF _staff.user_id <> _uid THEN
      INSERT INTO public.notifications(user_id,workspace_id,kind,title,body,link)
      VALUES (_staff.user_id,_request.workspace_id,'generic','Client request updated',
        _request.title || ': ' || replace(_decision::text,'_',' '),'/approvals');
    END IF;
  END LOOP;
  INSERT INTO public.activity_logs(workspace_id,actor_user_id,action,entity_type,entity_id,safe_metadata)
  VALUES (_request.workspace_id,_uid,'client_request_decided','client_request',_request_id,
    jsonb_build_object('title',_request.title,'decision',_decision,'response_note',nullif(btrim(coalesce(_response_note,'')),'')));
END; $$;

CREATE OR REPLACE FUNCTION public.phase4_add_checklist_item(
  _workspace_id uuid, _title text, _description text DEFAULT NULL,
  _checklist_type text DEFAULT 'onboarding', _due_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _sort integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'staff_required'; END IF;
  IF _checklist_type NOT IN ('onboarding','project') THEN RAISE EXCEPTION 'invalid_checklist_type'; END IF;
  SELECT coalesce(max(sort_order),0) + 10 INTO _sort FROM public.client_checklist_items
  WHERE workspace_id = _workspace_id AND checklist_type = _checklist_type;
  INSERT INTO public.client_checklist_items(workspace_id,title,description,checklist_type,due_at,sort_order,created_by)
  VALUES (_workspace_id,btrim(_title),nullif(btrim(coalesce(_description,'')),''),_checklist_type,_due_at,_sort,_uid)
  RETURNING id INTO _id;
  INSERT INTO public.activity_logs(workspace_id,actor_user_id,action,entity_type,entity_id,safe_metadata)
  VALUES (_workspace_id,_uid,'checklist_item_created','client_checklist_item',_id,jsonb_build_object('title',btrim(_title)));
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.phase4_add_standard_onboarding(_workspace_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _count integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'staff_required'; END IF;
  INSERT INTO public.client_checklist_items(workspace_id,title,checklist_type,sort_order,created_by)
  SELECT _workspace_id,v.title,'onboarding',v.position * 10,_uid
  FROM (VALUES (1,'Accept the WaveOS invitation'),(2,'Confirm contact preferences'),
    (3,'Complete brand information'),(4,'Connect social accounts'),(5,'Review the first content plan')) AS v(position,title)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.client_checklist_items i
    WHERE i.workspace_id = _workspace_id AND i.checklist_type = 'onboarding' AND lower(i.title) = lower(v.title)
  );
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END; $$;

CREATE OR REPLACE FUNCTION public.phase4_set_checklist_status(_item_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _item public.client_checklist_items%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _status NOT IN ('open','in_progress','completed','skipped') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  SELECT * INTO _item FROM public.client_checklist_items WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;
  IF NOT (public.is_dream_wave_staff(_uid) OR public.is_workspace_member(_uid,_item.workspace_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.client_checklist_items SET status=_status,
    completed_by=CASE WHEN _status='completed' THEN _uid ELSE NULL END,
    completed_at=CASE WHEN _status='completed' THEN now() ELSE NULL END,
    updated_at=now() WHERE id=_item_id;
  INSERT INTO public.activity_logs(workspace_id,actor_user_id,action,entity_type,entity_id,safe_metadata)
  VALUES (_item.workspace_id,_uid,'checklist_status_changed','client_checklist_item',_item_id,
    jsonb_build_object('title',_item.title,'status',_status));
END; $$;

CREATE OR REPLACE FUNCTION public.phase4_save_contact_preferences(
  _workspace_id uuid, _preferred_method text, _best_time text DEFAULT NULL,
  _contact_email text DEFAULT NULL, _contact_phone text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_dream_wave_staff(_uid) OR public.is_workspace_member(_uid,_workspace_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _preferred_method NOT IN ('email','phone','text','waveos') THEN RAISE EXCEPTION 'invalid_method'; END IF;
  INSERT INTO public.client_contact_preferences(workspace_id,user_id,preferred_method,best_time,contact_email,contact_phone)
  VALUES (_workspace_id,_uid,_preferred_method,nullif(btrim(coalesce(_best_time,'')),''),
    nullif(lower(btrim(coalesce(_contact_email,''))),''),nullif(btrim(coalesce(_contact_phone,'')),'') )
  ON CONFLICT (workspace_id,user_id) DO UPDATE SET
    preferred_method=excluded.preferred_method,best_time=excluded.best_time,
    contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,updated_at=now();
END; $$;

CREATE OR REPLACE FUNCTION public.phase4_refresh_deadline_notifications(_workspace_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row record; _count integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_dream_wave_staff(_uid) OR public.is_workspace_member(_uid,_workspace_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR _row IN SELECT id,title,due_at FROM public.client_requests
    WHERE workspace_id=_workspace_id AND decision='pending'
      AND due_at BETWEEN now() AND now()+interval '3 days' LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n WHERE n.user_id=_uid AND n.workspace_id=_workspace_id
        AND n.link='/approvals?request='||_row.id::text AND n.created_at > now()-interval '24 hours'
    ) THEN
      INSERT INTO public.notifications(user_id,workspace_id,kind,title,body,link)
      VALUES (_uid,_workspace_id,'generic','Approval deadline approaching',_row.title,
        '/approvals?request='||_row.id::text);
      _count := _count + 1;
    END IF;
  END LOOP;
  RETURN _count;
END; $$;

REVOKE ALL ON FUNCTION public.phase4_create_request(uuid,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase4_respond_to_request(uuid,public.approval_decision,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase4_add_checklist_item(uuid,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase4_add_standard_onboarding(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase4_set_checklist_status(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase4_save_contact_preferences(uuid,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase4_refresh_deadline_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phase4_create_request(uuid,text,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_respond_to_request(uuid,public.approval_decision,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_add_checklist_item(uuid,text,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_add_standard_onboarding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_set_checklist_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_save_contact_preferences(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_refresh_deadline_notifications(uuid) TO authenticated;
