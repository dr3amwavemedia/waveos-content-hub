-- Owner-only client member directory used to address password-reset emails.
-- Passwords and password hashes are never exposed or changed by this function.
CREATE OR REPLACE FUNCTION public.get_client_member_directory(_workspace_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  workspace_role public.workspace_member_role
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
    members.user_id,
    users.email::text,
    profiles.first_name,
    profiles.last_name,
    members.role
  FROM public.workspace_members AS members
  JOIN auth.users AS users ON users.id = members.user_id
  LEFT JOIN public.profiles AS profiles ON profiles.id = members.user_id
  WHERE members.workspace_id = _workspace_id
  ORDER BY profiles.first_name NULLS LAST, users.email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_member_directory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_member_directory(uuid) TO authenticated;
