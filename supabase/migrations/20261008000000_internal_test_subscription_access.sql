-- Internal product-test accounts need to exercise their exact plan experience
-- without creating a real Stripe subscription. This flag is service-role-only:
-- authenticated users can read their subscription row but cannot update it.

ALTER TABLE public.workspace_social_subscriptions
  ADD COLUMN IF NOT EXISTS internal_test_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspace_social_subscriptions.internal_test_access IS
  'Owner-authorized internal product testing. Bypasses payment entitlement only; plan feature and account limits still apply.';

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
      AND (
        subscription.internal_test_access
        OR (
          subscription.service_locked_at IS NULL
          AND (
            subscription.status = 'active'
            OR (
              subscription.status = 'past_due'
              AND subscription.stripe_subscription_id IS NOT NULL
              AND subscription.payment_failure_count < 2
            )
            OR (
              subscription.status = 'trialing'
              AND subscription.stripe_subscription_id IS NOT NULL
              AND subscription.account_limit <= 3
              AND subscription.trial_ends_at > now()
              AND subscription.trial_ends_at <= subscription.trial_started_at + interval '30 days'
              AND EXISTS (
                SELECT 1
                FROM public.os_promo_redemptions AS redemption
                WHERE redemption.workspace_id = subscription.workspace_id
              )
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.social_subscription_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_subscription_is_active(uuid)
  TO authenticated, service_role;

-- These three owner-requested accounts are permanent internal product testers.
-- Remove any placeholder Stripe references so no billing portal or provider
-- webhook can be mistaken for the source of their entitlement.
UPDATE public.workspace_social_subscriptions AS subscription
SET
  plan = CASE lower(account.email)
    WHEN 'waveos.ripple.test@dwmsrq.com' THEN 'standard'
    WHEN 'waveos.current.test@dwmsrq.com' THEN 'full'
    WHEN 'waveos.tidal.test@dwmsrq.com' THEN 'expanded'
    ELSE subscription.plan
  END,
  account_limit = CASE lower(account.email)
    WHEN 'waveos.ripple.test@dwmsrq.com' THEN 3
    WHEN 'waveos.current.test@dwmsrq.com' THEN 4
    WHEN 'waveos.tidal.test@dwmsrq.com' THEN 8
    ELSE subscription.account_limit
  END,
  status = 'active',
  billing_interval = NULL,
  stripe_customer_id = NULL,
  stripe_subscription_id = NULL,
  stripe_checkout_session_id = NULL,
  current_period_end = NULL,
  cancel_at_period_end = false,
  payment_failure_count = 0,
  last_payment_failed_at = NULL,
  service_locked_at = NULL,
  internal_test_access = true,
  updated_at = now()
FROM public.workspace_members AS membership
JOIN auth.users AS account ON account.id = membership.user_id
JOIN public.workspaces AS workspace ON workspace.id = membership.workspace_id
WHERE subscription.workspace_id = workspace.id
  AND workspace.data_source = 'os_data'
  AND lower(account.email) IN (
    'waveos.ripple.test@dwmsrq.com',
    'waveos.current.test@dwmsrq.com',
    'waveos.tidal.test@dwmsrq.com'
  );

NOTIFY pgrst, 'reload schema';
