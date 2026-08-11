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
