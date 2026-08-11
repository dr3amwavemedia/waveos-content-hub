-- Keep the approval preference available through the existing
-- feature_overrides field so workspace discovery never depends on a newly
-- deployed column appearing in the Data API schema cache first.

UPDATE public.workspaces
SET feature_overrides = coalesce(feature_overrides, '{}'::jsonb) ||
  jsonb_build_object('automatic_content_approval', NOT approval_required);

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
  SET approval_required = NOT _enabled,
      feature_overrides = coalesce(feature_overrides, '{}'::jsonb) ||
        jsonb_build_object('automatic_content_approval', _enabled)
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

REVOKE ALL ON FUNCTION public.set_workspace_automatic_content_approval(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_automatic_content_approval(uuid, boolean)
  TO authenticated, service_role;
