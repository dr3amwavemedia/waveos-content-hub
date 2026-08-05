-- Admin-only CRM lead conversion. Creates a complete client workspace, keeps the
-- CRM history, marks the opportunity won, and links both records atomically.
CREATE OR REPLACE FUNCTION public.crm_convert_lead_to_client(
  _account_id uuid,
  _access_tier public.client_access_tier DEFAULT 'retainer_full',
  _agreement_term public.agreement_term DEFAULT NULL,
  _timezone text DEFAULT 'America/New_York'
)
RETURNS TABLE(workspace_id uuid, workspace_name text, workspace_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _account public.crm_accounts%ROWTYPE;
  _created record;
  _service_area text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.has_role(_uid, 'dream_wave_owner') THEN
    RAISE EXCEPTION 'owner_required';
  END IF;

  SELECT * INTO _account
  FROM public.crm_accounts
  WHERE id = _account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  IF _account.linked_workspace_id IS NOT NULL THEN
    RAISE EXCEPTION 'lead_already_converted';
  END IF;

  IF _account.stage = 'archived' THEN
    RAISE EXCEPTION 'restore_lead_before_conversion';
  END IF;

  _service_area := nullif(concat_ws(', ', nullif(btrim(_account.city), ''), nullif(btrim(_account.state), '')), '');

  SELECT * INTO _created
  FROM public.create_brand_workspace(
    _account.business_name,
    _account.business_name,
    _account.industry,
    _account.website,
    coalesce(nullif(btrim(_timezone), ''), 'America/New_York'),
    'en',
    _service_area,
    NULL
  );

  UPDATE public.workspaces
  SET status = 'onboarding',
      account_status = 'pending',
      access_tier = _access_tier,
      agreement_term = _agreement_term
  WHERE id = _created.id;

  UPDATE public.crm_accounts
  SET linked_workspace_id = _created.id,
      stage = 'won',
      converted_at = now(),
      updated_at = now(),
      updated_by = _uid
  WHERE id = _account_id;

  INSERT INTO public.crm_activities (
    account_id, actor_id, activity_type, summary, safe_metadata
  ) VALUES (
    _account_id,
    _uid,
    'status_change',
    'Lead converted to client profile',
    jsonb_build_object(
      'workspace_id', _created.id,
      'workspace_name', _created.name,
      'access_tier', _access_tier,
      'agreement_term', _agreement_term
    )
  );

  RETURN QUERY SELECT _created.id, _created.name, _created.slug;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_convert_lead_to_client(uuid, public.client_access_tier, public.agreement_term, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_convert_lead_to_client(uuid, public.client_access_tier, public.agreement_term, text) TO authenticated;
