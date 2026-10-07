-- Current includes four connected social accounts. Ripple remains at three
-- and Tidal remains at eight.

ALTER TABLE public.workspace_social_subscriptions
  DROP CONSTRAINT IF EXISTS workspace_social_subscriptions_account_limit_check;

ALTER TABLE public.workspace_social_subscriptions
  DROP CONSTRAINT IF EXISTS workspace_social_subscriptions_plan_account_limit_check;

UPDATE public.workspace_social_subscriptions
SET account_limit = 4,
    updated_at = now()
WHERE plan = 'full'
  AND account_limit <> 4;

ALTER TABLE public.workspace_social_subscriptions
  ADD CONSTRAINT workspace_social_subscriptions_account_limit_check
  CHECK (account_limit IN (2, 3, 4, 6, 8));

ALTER TABLE public.workspace_social_subscriptions
  ADD CONSTRAINT workspace_social_subscriptions_plan_account_limit_check
  CHECK (
    (plan = 'trial' AND account_limit IN (2, 3)) OR
    (plan = 'standard' AND account_limit = 3) OR
    (plan = 'full' AND account_limit = 4) OR
    (plan = 'expanded' AND account_limit IN (6, 8))
  );
