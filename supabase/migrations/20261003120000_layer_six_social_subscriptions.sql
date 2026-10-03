-- Layer Six social subscriptions are additive to every existing Dream Wave
-- service tier. They never alter invoice, contract, or workspace-member access.

CREATE TABLE IF NOT EXISTS public.workspace_social_subscriptions (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('trial', 'standard', 'expanded')),
  status text NOT NULL CHECK (status IN ('trialing', 'checkout_pending', 'active', 'past_due', 'canceled', 'expired')),
  billing_interval text CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'annual')),
  account_limit smallint NOT NULL CHECK (account_limit IN (2, 3, 6)),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_social_subscription_plan_limit CHECK (
    (plan = 'trial' AND account_limit = 2) OR
    (plan = 'standard' AND account_limit = 3) OR
    (plan = 'expanded' AND account_limit = 6)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_social_subscriptions_stripe_subscription_unique
  ON public.workspace_social_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_social_subscriptions_stripe_checkout_unique
  ON public.workspace_social_subscriptions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

ALTER TABLE public.workspace_social_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_social_subscriptions FROM PUBLIC, anon;
GRANT SELECT ON public.workspace_social_subscriptions TO authenticated;
GRANT ALL ON public.workspace_social_subscriptions TO service_role;

DROP POLICY IF EXISTS "Members view social subscription" ON public.workspace_social_subscriptions;
CREATE POLICY "Members view social subscription"
  ON public.workspace_social_subscriptions FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.is_dream_wave_staff((SELECT auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.social_subscription_is_active(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_social_subscriptions AS subscription
    WHERE subscription.workspace_id = _workspace_id
      AND (
        subscription.status = 'active'
        OR (
          subscription.status = 'trialing'
          AND subscription.trial_ends_at > now()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.social_account_limit(_workspace_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.social_subscription_is_active(_workspace_id)
      THEN coalesce((
        SELECT subscription.account_limit
        FROM public.workspace_social_subscriptions AS subscription
        WHERE subscription.workspace_id = _workspace_id
      ), 0)
    ELSE 0
  END;
$$;

REVOKE ALL ON FUNCTION public.social_subscription_is_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_account_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_subscription_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.social_account_limit(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_workspace_social_trial(_workspace_id uuid)
RETURNS public.workspace_social_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.workspace_social_subscriptions;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _uid
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'workspace_admin_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspace_social_subscriptions
    WHERE workspace_id = _workspace_id
  ) THEN
    RAISE EXCEPTION 'social_plan_already_started';
  END IF;

  INSERT INTO public.workspace_social_subscriptions (
    workspace_id, plan, status, account_limit, trial_started_at, trial_ends_at
  ) VALUES (
    _workspace_id, 'trial', 'trialing', 2, now(), now() + interval '30 days'
  ) RETURNING * INTO _row;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.start_workspace_social_trial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_workspace_social_trial(uuid) TO authenticated;

-- Existing Social Management clients keep full access and become grandfathered
-- Expanded accounts. No existing Project, Growth, Retainer, or Wedding client
-- is changed unless they explicitly start a trial or subscription.
INSERT INTO public.workspace_social_subscriptions (
  workspace_id, plan, status, account_limit
)
SELECT workspace.id, 'expanded', 'active', 6
FROM public.workspaces AS workspace
WHERE workspace.access_tier::text = 'social_management'
   OR coalesce(workspace.feature_overrides -> 'social_management_access' = 'true'::jsonb, false)
ON CONFLICT (workspace_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_social_management_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.access_tier::text = 'social_management'
     OR coalesce(NEW.feature_overrides -> 'social_management_access' = 'true'::jsonb, false)
  THEN
    INSERT INTO public.workspace_social_subscriptions (
      workspace_id, plan, status, account_limit
    ) VALUES (NEW.id, 'expanded', 'active', 6)
    ON CONFLICT (workspace_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_social_management_entitlement ON public.workspaces;
CREATE TRIGGER ensure_social_management_entitlement
  AFTER INSERT OR UPDATE OF access_tier, feature_overrides ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.ensure_social_management_entitlement();

-- Keep the established tier rules, but let an active Layer Six entitlement add
-- the social tools to any Dream Wave service tier.
CREATE OR REPLACE FUNCTION public.has_feature(_workspace_id uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tier public.client_access_tier;
  _status public.account_status;
  _expires timestamptz;
  _overrides jsonb;
  _override_val jsonb;
BEGIN
  SELECT access_tier, account_status, access_expires_at, feature_overrides
    INTO _tier, _status, _expires, _overrides
    FROM public.workspaces WHERE id = _workspace_id;
  IF NOT FOUND THEN RETURN false; END IF;

  _override_val := _overrides -> _feature;
  IF _override_val IS NOT NULL AND jsonb_typeof(_override_val) = 'boolean' THEN
    RETURN (_override_val)::text::boolean;
  END IF;

  IF _tier::text = 'wedding_client' THEN
    IF _feature IN ('can_connect_socials', 'can_schedule_content', 'can_publish_content', 'can_view_analytics', 'can_create_content', 'can_use_ai_tools', 'can_manage_brand_voice')
       AND public.social_subscription_is_active(_workspace_id)
    THEN RETURN true; END IF;
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

  IF _feature IN ('can_connect_socials', 'can_schedule_content', 'can_publish_content', 'can_view_analytics', 'can_create_content', 'can_use_ai_tools', 'can_manage_brand_voice')
     AND public.social_subscription_is_active(_workspace_id)
  THEN RETURN true; END IF;

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
        'can_upload_media', 'can_create_content', 'can_use_ai_tools',
        'can_view_analytics', 'can_view_activity_log', 'can_invite_members',
        'can_manage_workspace'
      );
    WHEN 'retainer_full' THEN RETURN true;
    WHEN 'social_management' THEN RETURN true;
    ELSE RETURN false;
  END CASE;
END;
$function$;

REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;
