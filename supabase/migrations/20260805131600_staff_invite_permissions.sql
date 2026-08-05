-- Supabase may apply exposed-function defaults after creation; enforce the final ACL explicitly.
REVOKE ALL ON FUNCTION public.create_staff_invite(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_staff_invite(text, integer) TO authenticated;
