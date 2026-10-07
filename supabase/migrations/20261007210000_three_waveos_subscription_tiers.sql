-- Three public WaveOS tiers with plan-specific AI Assist and scheduling access.
-- Stripe remains the billing/invoice source of truth; this table stores the
-- entitlement selected in Checkout metadata and confirmed by webhooks.

ALTER TABLE public.workspace_social_subscriptions
  DROP CONSTRAINT IF EXISTS workspace_social_subscriptions_plan_check;
ALTER TABLE public.workspace_social_subscriptions
  DROP CONSTRAINT IF EXISTS workspace_social_subscriptions_account_limit_check;
ALTER TABLE public.workspace_social_subscriptions
  DROP CONSTRAINT IF EXISTS workspace_social_subscription_plan_limit;

UPDATE public.workspace_social_subscriptions
SET account_limit = CASE WHEN plan = 'expanded' THEN 8 ELSE 3 END,
    updated_at = now()
WHERE account_limit <> CASE WHEN plan = 'expanded' THEN 8 ELSE 3 END;

ALTER TABLE public.workspace_social_subscriptions
  ADD CONSTRAINT workspace_social_subscriptions_plan_check
  CHECK (plan IN ('trial', 'standard', 'full', 'expanded'));
ALTER TABLE public.workspace_social_subscriptions
  ADD CONSTRAINT workspace_social_subscriptions_account_limit_check
  CHECK (account_limit IN (3, 8));
ALTER TABLE public.workspace_social_subscriptions
  ADD CONSTRAINT workspace_social_subscription_plan_limit CHECK (
    (plan IN ('trial', 'standard', 'full') AND account_limit = 3) OR
    (plan = 'expanded' AND account_limit = 8)
  );

CREATE TABLE IF NOT EXISTS public.workspace_social_subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stripe_invoice_id text NOT NULL UNIQUE,
  stripe_subscription_id text,
  invoice_number text,
  status text NOT NULL,
  amount_due_cents bigint NOT NULL DEFAULT 0 CHECK (amount_due_cents >= 0),
  amount_paid_cents bigint NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  hosted_invoice_url text,
  invoice_pdf_url text,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  stripe_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_social_subscription_invoices_workspace_created_idx
  ON public.workspace_social_subscription_invoices(workspace_id, created_at DESC);

ALTER TABLE public.workspace_social_subscription_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_social_subscription_invoices FROM PUBLIC, anon;
GRANT SELECT ON public.workspace_social_subscription_invoices TO authenticated;
GRANT ALL ON public.workspace_social_subscription_invoices TO service_role;

DROP POLICY IF EXISTS "Members view subscription invoices"
  ON public.workspace_social_subscription_invoices;
CREATE POLICY "Members view subscription invoices"
  ON public.workspace_social_subscription_invoices FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.is_dream_wave_staff((SELECT auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.has_feature(_workspace_id uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _tier public.client_access_tier;
  _status public.account_status;
  _expires timestamptz;
  _overrides jsonb;
  _override_val jsonb;
  _data_source text;
  _social_plan text;
BEGIN
  SELECT access_tier, account_status, access_expires_at, feature_overrides, data_source
    INTO _tier, _status, _expires, _overrides, _data_source
    FROM public.workspaces WHERE id = _workspace_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF _data_source = 'os_data' THEN
    SELECT plan INTO _social_plan
      FROM public.workspace_social_subscriptions
      WHERE workspace_id = _workspace_id;

    IF NOT public.social_subscription_is_active(_workspace_id) THEN RETURN false; END IF;
    IF _feature IN ('can_use_ai_tools', 'can_schedule_content') THEN
      RETURN _social_plan IN ('full', 'expanded');
    END IF;
    RETURN _feature IN (
      'can_view_profile', 'can_edit_profile', 'can_manage_brand_voice',
      'can_view_calendar_preview', 'can_view_media_library', 'can_upload_media',
      'can_create_content', 'can_connect_socials', 'can_publish_content',
      'can_view_analytics', 'can_view_activity_log', 'can_invite_members',
      'can_manage_workspace'
    );
  END IF;

  _override_val := _overrides -> _feature;
  IF _override_val IS NOT NULL AND pg_catalog.jsonb_typeof(_override_val) = 'boolean' THEN
    RETURN (_override_val)::text::boolean;
  END IF;
  IF _tier::text = 'wedding_client' THEN
    RETURN _feature IN ('can_view_profile', 'can_view_invoices', 'can_contact_support')
      OR (_status = 'active' AND _feature = 'can_view_deliveries');
  END IF;
  IF _status IN ('suspended', 'archived') THEN
    RETURN _feature IN ('can_view_deliveries', 'can_view_invoices', 'can_view_profile');
  END IF;
  IF _status = 'expired' OR (_expires IS NOT NULL AND _expires < now()) THEN
    RETURN _feature IN (
      'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
      'can_edit_profile', 'can_contact_support'
    );
  END IF;

  CASE _tier::text
    WHEN 'project_client' THEN
      RETURN _feature IN (
        'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
        'can_edit_profile', 'can_contact_support'
      );
    WHEN 'growth_90' THEN
      RETURN _feature IN (
        'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
        'can_edit_profile', 'can_contact_support', 'can_review_content',
        'can_request_changes', 'can_manage_brand_voice',
        'can_view_calendar_preview', 'can_view_media_library',
        'can_upload_media', 'can_use_ai_tools', 'can_view_analytics',
        'can_view_activity_log', 'can_invite_members', 'can_manage_workspace'
      );
    WHEN 'retainer_full' THEN RETURN true;
    WHEN 'social_management' THEN RETURN true;
    ELSE RETURN false;
  END CASE;
END;
$function$;

REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
