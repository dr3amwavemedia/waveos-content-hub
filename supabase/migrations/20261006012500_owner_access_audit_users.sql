-- Owner-only identity directory for the login and workspace routing audit.
-- Keeps auth.users private while avoiding the Auth Admin gateway in app code.
CREATE OR REPLACE FUNCTION public.get_access_audit_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  account_source text
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
    users.id,
    users.email::text,
    users.email_confirmed_at,
    users.last_sign_in_at,
    CASE
      WHEN users.raw_user_meta_data ->> 'account_source' = 'os_data' THEN 'os_data'
      ELSE 'client_data'
    END
  FROM auth.users AS users
  ORDER BY users.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_access_audit_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_access_audit_users() TO authenticated;
