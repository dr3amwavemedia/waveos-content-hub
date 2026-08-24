CREATE OR REPLACE FUNCTION public.can_staff_manage_workspace(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
                w.access_tier::text = 'social_management'
                OR coalesce(w.feature_overrides -> 'social_management_access' = 'true'::jsonb, false)
                OR coalesce(w.feature_overrides -> 'media_manager_access' = 'true'::jsonb, false)
              )
          )
        )
      )
  );
$function$;