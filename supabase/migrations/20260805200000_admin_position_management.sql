-- Existing admins can promote accepted staff to full Admin access or move
-- admins/team members between Admin, Sales, and Media Manager positions.

CREATE OR REPLACE FUNCTION public.set_staff_position(
  _target_user uuid,
  _position text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor uuid := auth.uid();
  _owner_count integer;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role(_actor, 'dream_wave_owner') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF _position NOT IN ('admin', 'sales', 'media_manager') THEN
    RAISE EXCEPTION 'invalid_staff_position';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _target_user
      AND role IN ('dream_wave_owner', 'dream_wave_team')
  ) THEN
    RAISE EXCEPTION 'staff_member_not_found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(918273645);

  IF _position = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role, staff_type)
    VALUES (_target_user, 'dream_wave_owner', NULL)
    ON CONFLICT (user_id, role) DO UPDATE SET staff_type = NULL;

    DELETE FROM public.user_roles
    WHERE user_id = _target_user AND role = 'dream_wave_team';
  ELSE
    IF public.has_role(_target_user, 'dream_wave_owner') THEN
      SELECT count(*) INTO _owner_count
      FROM public.user_roles
      WHERE role = 'dream_wave_owner';
      IF _owner_count <= 1 THEN RAISE EXCEPTION 'cannot_remove_last_admin'; END IF;
    END IF;

    INSERT INTO public.user_roles (user_id, role, staff_type)
    VALUES (_target_user, 'dream_wave_team', _position::public.staff_type)
    ON CONFLICT (user_id, role) DO UPDATE SET staff_type = excluded.staff_type;

    DELETE FROM public.user_roles
    WHERE user_id = _target_user AND role = 'dream_wave_owner';
  END IF;

  INSERT INTO public.activity_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    '11111111-1111-1111-1111-111111111111', _actor,
    'staff_position_changed', 'user_role', _target_user,
    pg_catalog.jsonb_build_object('position', _position)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_staff_position(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_position(uuid, text) TO authenticated;

