-- Client-initiated service requests, status tracking, and private attachments.
-- This extends the existing Phase 4 request table without changing approval behavior.

ALTER TABLE public.client_requests
  DROP CONSTRAINT IF EXISTS client_requests_request_type_check;

ALTER TABLE public.client_requests
  ADD CONSTRAINT client_requests_request_type_check CHECK (
    request_type IN (
      'approval','information','asset','decision',
      'video','reel','photos','revision','shoot','other'
    )
  ),
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS preferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS reference_url text,
  ADD COLUMN IF NOT EXISTS attachment_path text;

ALTER TABLE public.client_requests
  DROP CONSTRAINT IF EXISTS client_requests_status_check;
ALTER TABLE public.client_requests
  ADD CONSTRAINT client_requests_status_check CHECK (
    status IS NULL OR status IN ('submitted','reviewing','scheduled','in_progress','completed','closed')
  );

CREATE INDEX IF NOT EXISTS client_requests_workspace_status_idx
  ON public.client_requests(workspace_id, status, created_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-request-attachments',
  'client-request-attachments',
  false,
  26214400,
  ARRAY['image/png','image/jpeg','image/webp','application/pdf','video/mp4','video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Workspace members upload request attachments" ON storage.objects;
CREATE POLICY "Workspace members upload request attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-request-attachments'
    AND (
      public.is_workspace_member((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)
      OR public.is_dream_wave_staff((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Workspace members read request attachments" ON storage.objects;
CREATE POLICY "Workspace members read request attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-request-attachments'
    AND (
      public.is_workspace_member((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)
      OR public.is_dream_wave_staff((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Request creators delete attachments" ON storage.objects;
CREATE POLICY "Request creators delete attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-request-attachments'
    AND owner_id = (SELECT auth.uid()::text)
  );

CREATE OR REPLACE FUNCTION public.create_client_service_request(
  _workspace_id uuid,
  _title text,
  _description text,
  _request_type text,
  _preferred_at timestamptz DEFAULT NULL,
  _reference_url text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _staff record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (
    public.is_workspace_member(_uid, _workspace_id)
    OR public.is_dream_wave_staff(_uid)
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _request_type NOT IN ('video','reel','photos','revision','shoot','other') THEN
    RAISE EXCEPTION 'invalid_request_type';
  END IF;
  IF char_length(btrim(coalesce(_title,''))) NOT BETWEEN 2 AND 140 THEN
    RAISE EXCEPTION 'invalid_title';
  END IF;
  IF char_length(btrim(coalesce(_description,''))) NOT BETWEEN 2 AND 4000 THEN
    RAISE EXCEPTION 'invalid_description';
  END IF;
  IF nullif(btrim(coalesce(_reference_url,'')),'') IS NOT NULL
    AND btrim(_reference_url) !~* '^https?://' THEN
    RAISE EXCEPTION 'invalid_reference_url';
  END IF;

  INSERT INTO public.client_requests(
    workspace_id,title,description,request_type,status,preferred_at,reference_url,created_by
  ) VALUES (
    _workspace_id,btrim(_title),btrim(_description),_request_type,'submitted',_preferred_at,
    nullif(btrim(coalesce(_reference_url,'')),''),_uid
  ) RETURNING id INTO _id;

  FOR _staff IN
    SELECT DISTINCT user_id FROM public.user_roles
    WHERE role IN ('dream_wave_owner','dream_wave_team') AND user_id <> _uid
  LOOP
    INSERT INTO public.notifications(user_id,workspace_id,kind,title,body,link)
    VALUES (_staff.user_id,_workspace_id,'generic','New client request',btrim(_title),'/approvals');
  END LOOP;

  INSERT INTO public.activity_logs(workspace_id,actor_user_id,action,entity_type,entity_id,safe_metadata)
  VALUES (_workspace_id,_uid,'client_service_request_created','client_request',_id,
    jsonb_build_object('title',btrim(_title),'request_type',_request_type,'preferred_at',_preferred_at));
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.attach_client_request_file(_request_id uuid, _attachment_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _request public.client_requests%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _request FROM public.client_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT (_request.created_by = _uid OR public.is_dream_wave_staff(_uid)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _attachment_path NOT LIKE _request.workspace_id::text || '/' || _request.id::text || '/%' THEN
    RAISE EXCEPTION 'invalid_attachment_path';
  END IF;
  UPDATE public.client_requests SET attachment_path = _attachment_path, updated_at = now()
  WHERE id = _request_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_client_service_request_status(_request_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _request public.client_requests%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'staff_required'; END IF;
  IF _status NOT IN ('submitted','reviewing','scheduled','in_progress','completed','closed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  SELECT * INTO _request FROM public.client_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR _request.status IS NULL THEN RAISE EXCEPTION 'service_request_not_found'; END IF;
  UPDATE public.client_requests SET status = _status, updated_at = now() WHERE id = _request_id;
  INSERT INTO public.activity_logs(workspace_id,actor_user_id,action,entity_type,entity_id,safe_metadata)
  VALUES (_request.workspace_id,_uid,'client_service_request_status_changed','client_request',_request_id,
    jsonb_build_object('title',_request.title,'status',_status));
END; $$;

REVOKE ALL ON FUNCTION public.create_client_service_request(uuid,text,text,text,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_client_request_file(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_client_service_request_status(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_service_request(uuid,text,text,text,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_client_request_file(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_service_request_status(uuid,text) TO authenticated;
