-- Grandfather existing client memberships as Client Admin. Owners and admins
-- already count as Client Admin, so they keep their current role unchanged.
UPDATE public.workspace_members AS member
SET role = 'admin'::public.workspace_member_role
WHERE member.role NOT IN ('owner', 'admin')
AND EXISTS (
  SELECT 1 FROM public.user_roles AS client_role
  WHERE client_role.user_id = member.user_id
    AND client_role.role IN ('client_owner', 'client_approver', 'client_viewer')
)
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles AS staff_role
  WHERE staff_role.user_id = member.user_id
    AND staff_role.role IN ('dream_wave_owner', 'dream_wave_team')
);

UPDATE public.invites
SET workspace_role = 'admin'::public.workspace_member_role,
    app_role = 'client_owner'::public.app_role
WHERE app_role IN ('client_owner', 'client_approver', 'client_viewer')
  AND status = 'pending'
  AND workspace_role NOT IN ('owner', 'admin');

UPDATE public.invites
SET app_role = 'client_owner'::public.app_role
WHERE app_role IN ('client_approver', 'client_viewer')
  AND status = 'pending';

CREATE OR REPLACE FUNCTION public.client_can_view_financials(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members AS member
    WHERE member.user_id = _user_id
      AND member.workspace_id = _workspace_id
      AND member.role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.client_can_view_financials(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_can_view_financials(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members view invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Client members view their invoices" ON public.client_invoices;
CREATE POLICY "Client admins view their invoices"
  ON public.client_invoices FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      NOT public.is_dream_wave_staff((SELECT auth.uid()))
      AND public.client_can_view_financials((SELECT auth.uid()), workspace_id)
      AND published_at IS NOT NULL
      AND status <> 'draft'
    )
  );

DROP POLICY IF EXISTS "Client members view their contracts" ON public.client_contracts;
CREATE POLICY "Client admins view their contracts"
  ON public.client_contracts FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      NOT public.is_dream_wave_staff((SELECT auth.uid()))
      AND public.client_can_view_financials((SELECT auth.uid()), workspace_id)
      AND status <> 'draft'
      AND (provider <> 'signwell' OR published_at IS NOT NULL)
    )
  );

DROP POLICY IF EXISTS "Workspace members view autopay schedules" ON public.invoice_autopay_schedules;
CREATE POLICY "Client admins view autopay schedules"
  ON public.invoice_autopay_schedules FOR SELECT TO authenticated
  USING (
    public.is_dream_wave_staff((SELECT auth.uid()))
    OR public.client_can_view_financials((SELECT auth.uid()), workspace_id)
  );

CREATE OR REPLACE FUNCTION public.admin_set_workspace_member_role(
  _workspace_id uuid, _user_id uuid, _role public.workspace_member_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _role NOT IN ('admin', 'editor') THEN RAISE EXCEPTION 'unsupported_client_access'; END IF;

  UPDATE public.workspace_members SET role = _role
  WHERE workspace_id = _workspace_id AND user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found'; END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND role IN ('client_owner', 'client_approver', 'client_viewer');

  INSERT INTO public.user_roles(user_id, role)
  VALUES (_user_id, CASE WHEN _role = 'admin' THEN 'client_owner'::public.app_role ELSE 'client_viewer'::public.app_role END)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activity_logs(workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_workspace_id, _uid, 'client_access_changed', 'workspace_member', _user_id,
    jsonb_build_object('access', CASE WHEN _role = 'admin' THEN 'client_admin' ELSE 'client_second_account' END));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_workspace_member_role(uuid, uuid, public.workspace_member_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_workspace_member_role(uuid, uuid, public.workspace_member_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_client_invite_access(_invite_id uuid, _access text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _workspace_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _access NOT IN ('client_admin', 'client_second_account') THEN RAISE EXCEPTION 'invalid_client_access'; END IF;

  UPDATE public.invites
  SET workspace_role = CASE WHEN _access = 'client_admin' THEN 'admin'::public.workspace_member_role ELSE 'editor'::public.workspace_member_role END,
      app_role = CASE WHEN _access = 'client_admin' THEN 'client_owner'::public.app_role ELSE 'client_viewer'::public.app_role END
  WHERE id = _invite_id AND status = 'pending'
    AND app_role IN ('client_owner', 'client_approver', 'client_viewer')
  RETURNING workspace_id INTO _workspace_id;

  IF _workspace_id IS NULL THEN RAISE EXCEPTION 'pending_client_invite_not_found'; END IF;

  INSERT INTO public.activity_logs(workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_workspace_id, _uid, 'client_invite_access_changed', 'invite', _invite_id, jsonb_build_object('access', _access));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_client_invite_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_client_invite_access(uuid, text) TO authenticated;