
-- Lock search_path on the trigger helper we just added
ALTER FUNCTION public.protect_last_owner() SET search_path = public;

-- Revoke default PUBLIC EXECUTE on SECURITY DEFINER functions.
REVOKE ALL ON FUNCTION public.accept_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invite(TEXT, UUID, public.workspace_member_role, public.app_role, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_invite(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resend_invite(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_staff_role(UUID, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_staff_role(UUID, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_activity(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_invite_public(TEXT) FROM PUBLIC;

-- Regrant to the appropriate audiences
GRANT EXECUTE ON FUNCTION public.accept_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invite(TEXT, UUID, public.workspace_member_role, public.app_role, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_invite(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_staff_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_staff_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_activity(UUID, TEXT, TEXT, UUID, JSONB) TO authenticated;
-- get_invite_public is deliberately reachable pre-auth so the /accept-invite
-- page can show workspace name + status without leaking anything sensitive.
GRANT EXECUTE ON FUNCTION public.get_invite_public(TEXT) TO anon, authenticated;
