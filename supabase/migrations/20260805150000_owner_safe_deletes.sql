-- Owner-only permanent deletion for unused CRM leads and empty client workspaces.
-- Client deletion intentionally blocks when substantive client work exists.

DROP POLICY IF EXISTS "staff manage crm accounts" ON public.crm_accounts;

CREATE POLICY "staff view crm accounts"
  ON public.crm_accounts FOR SELECT TO authenticated
  USING (public.is_dream_wave_staff((select auth.uid())));

CREATE POLICY "staff create crm accounts"
  ON public.crm_accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_dream_wave_staff((select auth.uid())));

CREATE POLICY "staff update crm accounts"
  ON public.crm_accounts FOR UPDATE TO authenticated
  USING (public.is_dream_wave_staff((select auth.uid())))
  WITH CHECK (public.is_dream_wave_staff((select auth.uid())));

CREATE POLICY "owners delete crm accounts"
  ON public.crm_accounts FOR DELETE TO authenticated
  USING (public.has_role((select auth.uid()), 'dream_wave_owner'));

CREATE OR REPLACE FUNCTION public.crm_delete_lead(_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _linked_workspace_id uuid;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'dream_wave_owner') THEN
    RAISE EXCEPTION 'owner_required';
  END IF;

  SELECT linked_workspace_id
    INTO _linked_workspace_id
    FROM public.crm_accounts
   WHERE id = _account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  IF _linked_workspace_id IS NOT NULL THEN
    RAISE EXCEPTION 'linked_lead_cannot_be_deleted';
  END IF;

  DELETE FROM public.crm_accounts WHERE id = _account_id;
  RETURN _account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_delete_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_delete_lead(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_empty_client_workspace(
  _workspace_id uuid,
  _confirmation text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _workspace_name text;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'dream_wave_owner') THEN
    RAISE EXCEPTION 'owner_required';
  END IF;

  SELECT name INTO _workspace_name
    FROM public.workspaces
   WHERE id = _workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  IF _confirmation IS DISTINCT FROM _workspace_name THEN
    RAISE EXCEPTION 'confirmation_name_mismatch';
  END IF;

  IF EXISTS (SELECT 1 FROM public.crm_accounts WHERE linked_workspace_id = _workspace_id) THEN
    RAISE EXCEPTION 'client_has_linked_crm_lead';
  END IF;
  IF EXISTS (SELECT 1 FROM public.media_assets WHERE workspace_id = _workspace_id) THEN
    RAISE EXCEPTION 'client_has_media';
  END IF;
  IF EXISTS (SELECT 1 FROM public.content_items WHERE workspace_id = _workspace_id) THEN
    RAISE EXCEPTION 'client_has_content';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_deliveries WHERE workspace_id = _workspace_id) THEN
    RAISE EXCEPTION 'client_has_deliveries';
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_invoices WHERE workspace_id = _workspace_id) THEN
    RAISE EXCEPTION 'client_has_invoices';
  END IF;
  IF EXISTS (SELECT 1 FROM public.social_connections WHERE workspace_id = _workspace_id) THEN
    RAISE EXCEPTION 'client_has_social_connections';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ayrshare_profiles WHERE workspace_id = _workspace_id) THEN
    RAISE EXCEPTION 'client_has_publishing_profile';
  END IF;
  IF EXISTS (SELECT 1 FROM public.brand_profiles WHERE workspace_id = _workspace_id) THEN
    RAISE EXCEPTION 'client_has_brand_profile';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workspace_internal_notes
     WHERE workspace_id = _workspace_id AND btrim(notes) <> ''
  ) THEN
    RAISE EXCEPTION 'client_has_internal_notes';
  END IF;

  DELETE FROM public.workspaces WHERE id = _workspace_id;
  RETURN _workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_empty_client_workspace(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_empty_client_workspace(uuid, text) TO authenticated;
