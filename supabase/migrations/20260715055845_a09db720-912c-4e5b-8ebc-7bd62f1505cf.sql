
-- 1. Drop vulnerable invite policy
DROP POLICY IF EXISTS "Invitees can view unclaimed invites" ON public.invites;

-- 2. Safe staff-only view (excludes token & token_hash)
CREATE OR REPLACE VIEW public.invites_admin
WITH (security_invoker = true) AS
SELECT id, email, workspace_id, workspace_role, app_role, status,
       expires_at, created_at, accepted_at, revoked_at, revoked_by,
       invited_by, resend_count, last_sent_at
FROM public.invites;

REVOKE ALL ON public.invites_admin FROM PUBLIC, anon;
GRANT SELECT ON public.invites_admin TO authenticated;
GRANT ALL ON public.invites_admin TO service_role;

-- 3. Default-deny EXECUTE on every public SECURITY DEFINER function, then restore minimum.

-- Trigger / internal helpers: no direct callers
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_notification(uuid, uuid, notification_kind, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_activity(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Role helpers: required by RLS. Keep EXECUTE for authenticated (and anon for policies that may check).
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_dream_wave_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dream_wave_staff(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.workspace_role(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_role(uuid, uuid) TO authenticated, service_role;

-- Invitation preview: intentionally anon (preview page loads before sign-in).
REVOKE ALL ON FUNCTION public.get_invite_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_public(text) TO anon, authenticated, service_role;

-- Authenticated-only privileged RPCs
REVOKE ALL ON FUNCTION public.accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_invite(text, uuid, workspace_member_role, app_role, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invite(text, uuid, workspace_member_role, app_role, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resend_invite(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_invite(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.grant_staff_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_staff_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_staff_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_staff_role(uuid, app_role) TO authenticated, service_role;

-- 4. Harden accept_invite: row lock + trusted email from JWT
CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _hash TEXT;
  _invite public.invites%ROWTYPE;
  _jwt_email TEXT;
  _auth_email TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');

  -- Lock the invite row to prevent concurrent redemption
  SELECT * INTO _invite FROM public.invites WHERE token_hash = _hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF _invite.status = 'accepted' THEN RAISE EXCEPTION 'invite_already_used'; END IF;
  IF _invite.status = 'revoked' THEN RAISE EXCEPTION 'invite_revoked'; END IF;
  IF _invite.expires_at < now() OR _invite.status = 'expired' THEN
    UPDATE public.invites SET status='expired' WHERE id=_invite.id AND status='pending';
    RAISE EXCEPTION 'invite_expired';
  END IF;

  -- Prefer verified email from auth.users; fall back to JWT claim
  SELECT email INTO _auth_email FROM auth.users WHERE id = _uid;
  _jwt_email := auth.jwt() ->> 'email';
  IF lower(trim(coalesce(_auth_email, ''))) <> lower(trim(_invite.email))
     AND lower(trim(coalesce(_jwt_email, ''))) <> lower(trim(_invite.email)) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  IF _invite.workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES (_invite.workspace_id, _uid, _invite.workspace_role)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;
  IF _invite.app_role IN ('client_owner','client_approver','client_viewer') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _invite.app_role) ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.invites SET accepted_at = now(), status = 'accepted' WHERE id = _invite.id;

  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_invite.workspace_id, _uid, 'invitation_accepted', 'invite', _invite.id, '{}'::jsonb);

  RETURN _invite.workspace_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated, service_role;
