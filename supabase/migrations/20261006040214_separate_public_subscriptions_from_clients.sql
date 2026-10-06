-- Public WaveOS subscriptions belong only to OS-data workspaces. Dream Wave
-- Media clients continue to receive social access from their service tier and
-- feature overrides, never from the public app's billing records.

DROP POLICY IF EXISTS "Members view social subscription"
  ON public.workspace_social_subscriptions;
CREATE POLICY "OS members view social subscription"
  ON public.workspace_social_subscriptions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = workspace_social_subscriptions.workspace_id
        AND workspace.data_source = 'os_data'
    )
    AND (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      OR public.is_dream_wave_staff((SELECT auth.uid()))
    )
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
    JOIN public.workspaces AS workspace ON workspace.id = subscription.workspace_id
    WHERE subscription.workspace_id = _workspace_id
      AND workspace.data_source = 'os_data'
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
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace record;
BEGIN
  SELECT
    workspace.data_source,
    workspace.access_tier::text AS access_tier,
    workspace.account_status::text AS account_status,
    workspace.access_expires_at,
    workspace.feature_overrides
  INTO _workspace
  FROM public.workspaces AS workspace
  WHERE workspace.id = _workspace_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  IF _workspace.data_source = 'os_data' THEN
    IF NOT public.social_subscription_is_active(_workspace_id) THEN RETURN 0; END IF;
    RETURN coalesce((
      SELECT subscription.account_limit
      FROM public.workspace_social_subscriptions AS subscription
      WHERE subscription.workspace_id = _workspace_id
    ), 0);
  END IF;

  IF _workspace.account_status <> 'active'
     OR (_workspace.access_expires_at IS NOT NULL AND _workspace.access_expires_at < now())
  THEN
    RETURN 0;
  END IF;

  IF _workspace.feature_overrides -> 'can_connect_socials' = 'false'::jsonb THEN
    RETURN 0;
  END IF;

  IF _workspace.access_tier IN ('retainer_full', 'social_management')
     OR coalesce(
       _workspace.feature_overrides -> 'social_management_access' = 'true'::jsonb,
       false
     )
     OR _workspace.feature_overrides -> 'can_connect_socials' = 'true'::jsonb
  THEN
    RETURN 6;
  END IF;

  RETURN 0;
END;
$$;

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

  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = _workspace_id AND data_source = 'os_data'
  ) THEN
    RAISE EXCEPTION 'public_subscription_workspace_required';
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

CREATE OR REPLACE FUNCTION public.enforce_public_subscription_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = NEW.workspace_id AND data_source = 'os_data'
  ) THEN
    RAISE EXCEPTION 'public_subscription_workspace_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_public_subscription_workspace
  ON public.workspace_social_subscriptions;
CREATE TRIGGER enforce_public_subscription_workspace
  BEFORE INSERT OR UPDATE
  ON public.workspace_social_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_public_subscription_workspace();

-- This legacy trigger created synthetic public subscription rows whenever a
-- Dream Wave client received Social Management access. Service-tier access is
-- now calculated independently by social_account_limit and has_feature.
DROP TRIGGER IF EXISTS ensure_social_management_entitlement ON public.workspaces;
DROP FUNCTION IF EXISTS public.ensure_social_management_entitlement();

REVOKE ALL ON FUNCTION public.social_subscription_is_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_account_limit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_workspace_social_trial(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_public_subscription_workspace()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_subscription_is_active(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.social_account_limit(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_workspace_social_trial(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
