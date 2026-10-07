-- Public WaveOS accounts require a paid Stripe subscription before any app
-- services are available. Dream Wave Media client workspaces are intentionally
-- excluded: their access continues to come from their client service tier.

CREATE OR REPLACE FUNCTION public.block_public_os_free_trials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    WHERE workspace.id = NEW.workspace_id
      AND workspace.data_source = 'os_data'
  ) AND (NEW.plan = 'trial' OR NEW.status = 'trialing') THEN
    NEW.plan := 'standard';
    NEW.status := 'checkout_pending';
    NEW.billing_interval := NULL;
    NEW.account_limit := 3;
    NEW.trial_started_at := NULL;
    NEW.trial_ends_at := NULL;
    NEW.service_locked_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_public_os_free_trials()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS block_public_os_free_trials
  ON public.workspace_social_subscriptions;
CREATE TRIGGER block_public_os_free_trials
  BEFORE INSERT OR UPDATE OF plan, status, trial_started_at, trial_ends_at
  ON public.workspace_social_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.block_public_os_free_trials();

-- Lock existing public-app accounts that have never converted from the legacy
-- free trial. Paid subscriptions and all Dream Wave client data are untouched.
UPDATE public.workspace_social_subscriptions AS subscription
SET
  plan = 'standard',
  status = 'checkout_pending',
  billing_interval = NULL,
  account_limit = 3,
  trial_started_at = NULL,
  trial_ends_at = NULL,
  updated_at = now()
FROM public.workspaces AS workspace
WHERE workspace.id = subscription.workspace_id
  AND workspace.data_source = 'os_data'
  AND (subscription.plan = 'trial' OR subscription.status = 'trialing')
  AND subscription.stripe_subscription_id IS NULL;

CREATE OR REPLACE FUNCTION public.social_subscription_is_active(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_social_subscriptions AS subscription
    JOIN public.workspaces AS workspace ON workspace.id = subscription.workspace_id
    WHERE subscription.workspace_id = _workspace_id
      AND workspace.data_source = 'os_data'
      AND subscription.service_locked_at IS NULL
      AND (
        subscription.status = 'active'
        OR (
          subscription.status = 'past_due'
          AND subscription.stripe_subscription_id IS NOT NULL
          AND subscription.payment_failure_count < 2
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.social_subscription_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_subscription_is_active(uuid)
  TO authenticated, service_role;

-- Retire the callable trial path. Keeping the function with an explicit error
-- avoids breaking old clients while preventing a free-access bypass.
CREATE OR REPLACE FUNCTION public.start_workspace_social_trial(_workspace_id uuid)
RETURNS public.workspace_social_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'payment_required';
END;
$$;

REVOKE ALL ON FUNCTION public.start_workspace_social_trial(uuid)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
