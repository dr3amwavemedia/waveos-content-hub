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

-- Layer 4 is deliberately stored as the existing full-retainer tier plus a
-- workspace flag. This keeps the original three-tier enum and all existing
-- client behavior intact while adding staff-managed access independently.

UPDATE public.workspaces
SET access_tier = 'retainer_full',
    feature_overrides = coalesce(feature_overrides, '{}'::jsonb) ||
      jsonb_build_object('social_management_access', true)
WHERE access_tier::text = 'social_management';

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
                OR coalesce(w.feature_overrides -> 'social_management_access' = 'true'::jsonb, false)
              )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_staff_manage_workspace(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_staff_manage_workspace(uuid, uuid)
  TO authenticated, service_role;

-- Invoices are financial records. Every client tier may view its own workspace
-- invoices, but Dream Wave social managers and other non-owner staff must not
-- see them while managing a client account. Dream Wave owners retain full
-- invoice administration access.

DROP POLICY IF EXISTS "Members view invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Staff manage invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Client members view their invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Dream Wave owners create invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Dream Wave owners update invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Dream Wave owners delete invoices" ON public.client_invoices;

CREATE POLICY "Client members view their invoices"
  ON public.client_invoices
  FOR SELECT
  TO authenticated
  USING (
    (
      NOT public.is_dream_wave_staff((SELECT auth.uid()))
      AND public.is_workspace_member((SELECT auth.uid()), workspace_id)
    )
    OR public.has_role((SELECT auth.uid()), 'dream_wave_owner')
  );

CREATE POLICY "Dream Wave owners create invoices"
  ON public.client_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

CREATE POLICY "Dream Wave owners update invoices"
  ON public.client_invoices
  FOR UPDATE
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

CREATE POLICY "Dream Wave owners delete invoices"
  ON public.client_invoices
  FOR DELETE
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));