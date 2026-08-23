CREATE OR REPLACE FUNCTION public.text_has_blocked_language(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(_text, '') ~* '\y(fuck|shit|bitch|asshole|bastard|cunt|whore|slut|dick|pussy|nigger|faggot|retard)\y';
$$;

REVOKE ALL ON FUNCTION public.text_has_blocked_language(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.text_has_blocked_language(text) TO authenticated;

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
  IF public.text_has_blocked_language(_title)
    OR public.text_has_blocked_language(_description) THEN
    RAISE EXCEPTION 'inappropriate_language';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_requests
    WHERE workspace_id = _workspace_id
      AND created_by = _uid
      AND lower(btrim(title)) = lower(btrim(_title))
      AND status IS NOT NULL
      AND status NOT IN ('completed','closed')
  ) THEN RAISE EXCEPTION 'duplicate_request'; END IF;

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