-- Promo trials are the only owner-authorized free-access path for public
-- WaveOS accounts. They are deliberately separate from Dream Wave client
-- workspaces and may never grant more than 30 days or three social accounts.

UPDATE public.os_promo_codes
SET bonus_trial_days = least(bonus_trial_days, 30)
WHERE bonus_trial_days > 30;

UPDATE public.os_promo_redemptions
SET bonus_trial_days = least(bonus_trial_days, 30)
WHERE bonus_trial_days > 30;

ALTER TABLE public.os_promo_codes
  DROP CONSTRAINT IF EXISTS os_promo_codes_bonus_trial_days_check;
ALTER TABLE public.os_promo_codes
  ADD CONSTRAINT os_promo_codes_bonus_trial_days_check
  CHECK (bonus_trial_days BETWEEN 1 AND 30);

COMMENT ON COLUMN public.os_promo_codes.bonus_trial_days IS
  'Promo trial duration in days. Legacy column name retained for API compatibility; maximum 30.';

ALTER TABLE public.email_automation_deliveries
  DROP CONSTRAINT IF EXISTS email_automation_deliveries_entity_type_check;
ALTER TABLE public.email_automation_deliveries
  ADD CONSTRAINT email_automation_deliveries_entity_type_check
  CHECK (entity_type IN ('project', 'invoice', 'promo_trial'));

CREATE OR REPLACE FUNCTION public.block_public_os_free_trials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _promo_duration integer;
BEGIN
  SELECT least(redemption.bonus_trial_days::integer, 30)
  INTO _promo_duration
  FROM public.os_promo_redemptions AS redemption
  WHERE redemption.workspace_id = NEW.workspace_id
  LIMIT 1;

  -- During initial provisioning the redemption is inserted immediately after
  -- the subscription row, so validate the signup metadata only as a fallback.
  -- Existing redemptions remain valid even if the campaign later fills or is
  -- paused; those administrative changes must not revoke an awarded trial.
  IF _promo_duration IS NULL THEN
    SELECT least(promo.bonus_trial_days::integer, 30)
    INTO _promo_duration
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
    LIMIT 1;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    WHERE workspace.id = NEW.workspace_id
      AND workspace.data_source = 'os_data'
  ) AND (NEW.plan = 'trial' OR NEW.status = 'trialing') THEN
    IF _promo_duration IS NULL OR NEW.stripe_subscription_id IS NULL THEN
      NEW.plan := 'standard';
      NEW.status := 'checkout_pending';
      NEW.billing_interval := NULL;
      NEW.account_limit := 3;
      NEW.trial_started_at := NULL;
      NEW.trial_ends_at := NULL;
      NEW.service_locked_at := NULL;
    ELSE
      NEW.plan := 'trial';
      NEW.status := 'trialing';
      NEW.account_limit := 3;
      NEW.trial_started_at := coalesce(NEW.trial_started_at, now());
      NEW.trial_ends_at := least(
        coalesce(
          NEW.trial_ends_at,
          NEW.trial_started_at + make_interval(days => _promo_duration)
        ),
        NEW.trial_started_at + make_interval(days => _promo_duration),
        NEW.trial_started_at + interval '30 days'
      );
      NEW.service_locked_at := CASE
        WHEN NEW.trial_ends_at <= now() THEN coalesce(NEW.service_locked_at, now())
        ELSE NULL
      END;
      IF NEW.trial_ends_at <= now() THEN NEW.status := 'expired'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_public_os_free_trials()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.provision_os_trial_workspace(
  _user_id uuid,
  _workspace_name text DEFAULT NULL,
  _promo_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_id uuid;
  _first_name text;
  _last_name text;
  _email text;
  _clean_name text;
  _business_name text;
  _base_slug text;
  _slug text;
  _promo public.os_promo_codes%ROWTYPE;
  _trial_days integer := 0;
  _redemption_inserted integer := 0;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(_user_id::text, 0));

  SELECT workspaces.id INTO _workspace_id
  FROM public.workspace_members
  JOIN public.workspaces ON workspaces.id = workspace_members.workspace_id
  WHERE workspace_members.user_id = _user_id
    AND workspaces.data_source = 'os_data'
    AND NOT workspaces.is_archived
  ORDER BY workspace_members.created_at
  LIMIT 1;
  IF _workspace_id IS NOT NULL THEN RETURN _workspace_id; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = _user_id AND profiles.account_source = 'os_data'
  ) THEN
    RAISE EXCEPTION 'os_account_required';
  END IF;

  SELECT
    nullif(btrim(profiles.first_name), ''),
    nullif(btrim(profiles.last_name), ''),
    auth_users.email
  INTO _first_name, _last_name, _email
  FROM public.profiles
  JOIN auth.users AS auth_users ON auth_users.id = profiles.id
  WHERE profiles.id = _user_id;

  _business_name := nullif(btrim(concat_ws(' ', _first_name, _last_name)), '');
  _clean_name := nullif(btrim(coalesce(_workspace_name, '')), '');
  IF _clean_name IS NULL THEN
    _clean_name := CASE
      WHEN _business_name IS NOT NULL THEN _business_name || '''s Workspace'
      WHEN nullif(split_part(coalesce(_email, ''), '@', 1), '') IS NOT NULL
        THEN initcap(replace(split_part(_email, '@', 1), '.', ' ')) || '''s Workspace'
      ELSE 'My WaveOS Workspace'
    END;
  END IF;
  _clean_name := left(_clean_name, 80);

  _base_slug := btrim(regexp_replace(lower(_clean_name), '[^a-z0-9]+', '-', 'g'), '-');
  IF _base_slug = '' THEN _base_slug := 'waveos'; END IF;
  _slug := left(_base_slug, 31) || '-' || left(replace(_user_id::text, '-', ''), 8);

  IF nullif(btrim(coalesce(_promo_code, '')), '') IS NOT NULL THEN
    SELECT promo.* INTO _promo
    FROM public.os_promo_codes AS promo
    WHERE lower(promo.code) = lower(btrim(_promo_code))
      AND promo.is_active
      AND promo.starts_at <= now()
      AND (promo.expires_at IS NULL OR promo.expires_at > now())
      AND promo.redemption_count < promo.max_redemptions
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'promo_code_invalid_or_unavailable'; END IF;
    _trial_days := least(_promo.bonus_trial_days::integer, 30);
  END IF;

  INSERT INTO public.workspaces (
    name, slug, timezone, created_by, is_demo, is_archived, data_source,
    access_tier, account_status, activated_at
  ) VALUES (
    _clean_name, _slug, 'America/New_York', _user_id, false, false, 'os_data',
    'retainer_full', 'active', now()
  )
  RETURNING id INTO _workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_workspace_id, _user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';

  INSERT INTO public.brand_profiles (
    workspace_id, business_name, primary_language, timezone, onboarding_status
  ) VALUES (
    _workspace_id, coalesce(_business_name, _clean_name), 'en',
    'America/New_York', 'not_started'
  )
  ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO public.media_folders (workspace_id, name, created_by)
  SELECT _workspace_id, folder.name, _user_id
  FROM (VALUES
    ('Photos'), ('Videos'), ('Reels'), ('Brand Assets'),
    ('Logos'), ('Uploads'), ('Campaigns'), ('Archived')
  ) AS folder(name);

  INSERT INTO public.workspace_social_subscriptions (
    workspace_id, plan, status, account_limit, trial_started_at, trial_ends_at
  ) VALUES (
    _workspace_id, 'standard', 'checkout_pending', 3, NULL, NULL
  )
  ON CONFLICT (workspace_id) DO NOTHING;

  IF _promo.id IS NOT NULL THEN
    INSERT INTO public.os_promo_redemptions (
      promo_code_id, user_id, workspace_id, bonus_trial_days
    ) VALUES (
      _promo.id, _user_id, _workspace_id, _trial_days
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS _redemption_inserted = ROW_COUNT;
    IF _redemption_inserted = 1 THEN
      UPDATE public.os_promo_codes
      SET redemption_count = redemption_count + 1
      WHERE id = _promo.id;
    END IF;
  END IF;

  INSERT INTO public.activity_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _workspace_id, _user_id, 'os_promo_reserved', 'workspace', _workspace_id,
    jsonb_build_object(
      'account_limit', 3,
      'trial_days', _trial_days,
      'promo_applied', _redemption_inserted = 1,
      'automatic_provisioning', true
    )
  );

  RETURN _workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_os_trial_workspace(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

-- A promo reserves a trial, but does not unlock it until Stripe has collected
-- a card and created the subscription. Existing free promo access is therefore
-- returned to checkout_pending; paid public and Dream Wave client workspaces
-- are untouched.
UPDATE public.workspace_social_subscriptions AS subscription
SET
  plan = 'standard',
  status = 'checkout_pending',
  account_limit = 3,
  trial_started_at = NULL,
  trial_ends_at = NULL,
  service_locked_at = NULL,
  updated_at = now()
FROM public.os_promo_redemptions AS redemption
JOIN public.workspaces AS workspace ON workspace.id = redemption.workspace_id
WHERE subscription.workspace_id = redemption.workspace_id
  AND workspace.data_source = 'os_data'
  AND subscription.stripe_subscription_id IS NULL;

-- Stripe-backed promo trials retain only Standard access while trialing even
-- when the customer selected Expanded as the plan that will begin afterward.
UPDATE public.workspace_social_subscriptions AS subscription
SET
  plan = 'standard',
  account_limit = 3,
  trial_ends_at = least(
    subscription.trial_ends_at,
    subscription.trial_started_at + make_interval(days => least(redemption.bonus_trial_days::integer, 30)),
    subscription.trial_started_at + interval '30 days'
  ),
  updated_at = now()
FROM public.os_promo_redemptions AS redemption
JOIN public.workspaces AS workspace ON workspace.id = redemption.workspace_id
WHERE subscription.workspace_id = redemption.workspace_id
  AND workspace.data_source = 'os_data'
  AND subscription.status = 'trialing'
  AND subscription.stripe_subscription_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.expire_os_promo_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _expired integer := 0;
BEGIN
  UPDATE public.workspace_social_subscriptions AS subscription
  SET
    status = 'expired',
    service_locked_at = coalesce(subscription.service_locked_at, now()),
    updated_at = now()
  FROM public.os_promo_redemptions AS redemption
  JOIN public.workspaces AS workspace ON workspace.id = redemption.workspace_id
  WHERE subscription.workspace_id = redemption.workspace_id
    AND workspace.data_source = 'os_data'
    AND subscription.status = 'trialing'
    AND subscription.stripe_subscription_id IS NOT NULL
    AND subscription.trial_ends_at <= now();
  GET DIAGNOSTICS _expired = ROW_COUNT;
  RETURN _expired;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_os_promo_trials()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_os_promo_trials() TO service_role;

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
  );
$$;

REVOKE ALL ON FUNCTION public.social_subscription_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_subscription_is_active(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
