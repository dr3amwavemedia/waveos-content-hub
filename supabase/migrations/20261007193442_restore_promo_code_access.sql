-- Restore the existing owner-managed promo flow as the only free-access
-- exception. Ordinary public signups still require Stripe payment.

CREATE OR REPLACE FUNCTION public.block_public_os_free_trials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _valid_promo boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    JOIN auth.users AS account ON account.id = workspace.created_by
    JOIN public.os_promo_codes AS promo
      ON lower(promo.code) = lower(btrim(account.raw_user_meta_data ->> 'promo_code'))
    WHERE workspace.id = NEW.workspace_id
      AND workspace.data_source = 'os_data'
      AND promo.is_active
      AND promo.starts_at <= now()
      AND (promo.expires_at IS NULL OR promo.expires_at > now())
      AND promo.redemption_count < promo.max_redemptions
  ) INTO _valid_promo;

  IF EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    WHERE workspace.id = NEW.workspace_id
      AND workspace.data_source = 'os_data'
  ) AND (NEW.plan = 'trial' OR NEW.status = 'trialing')
    AND NOT _valid_promo THEN
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
        OR (
          subscription.status = 'trialing'
          AND subscription.trial_ends_at > now()
          AND EXISTS (
            SELECT 1
            FROM public.os_promo_redemptions AS redemption
            WHERE redemption.workspace_id = subscription.workspace_id
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.social_subscription_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_subscription_is_active(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
