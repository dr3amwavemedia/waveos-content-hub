-- Owner-only staff directory for the Staff screen.
-- Keeps auth.users private while returning only the identity fields the owner needs.

CREATE OR REPLACE FUNCTION public.get_staff_directory()
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  role public.app_role,
  staff_type public.staff_type,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.has_role(auth.uid(), 'dream_wave_owner') THEN
    RAISE EXCEPTION 'owner_required';
  END IF;

  RETURN QUERY
  SELECT
    roles.user_id,
    users.email::text,
    profiles.first_name,
    profiles.last_name,
    roles.role,
    roles.staff_type,
    roles.created_at
  FROM public.user_roles AS roles
  JOIN auth.users AS users ON users.id = roles.user_id
  LEFT JOIN public.profiles AS profiles ON profiles.id = roles.user_id
  WHERE roles.role IN ('dream_wave_owner', 'dream_wave_team')
  ORDER BY roles.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_directory() TO authenticated;

