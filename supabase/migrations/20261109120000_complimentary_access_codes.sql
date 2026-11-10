-- First-class WaveOS complimentary access. This is deliberately separate from
-- promo trials, internal product-test access, and Stripe billing.

CREATE TABLE public.waveos_complimentary_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  code_hint text NOT NULL CHECK (char_length(code_hint) BETWEEN 4 AND 12),
  plan text NOT NULL CHECK (plan IN ('standard', 'full', 'expanded')),
  max_redemptions integer NOT NULL DEFAULT 1 CHECK (max_redemptions BETWEEN 1 AND 100000),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (
    redemption_count >= 0 AND redemption_count <= max_redemptions
  ),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  access_ends_at timestamptz,
  eligible_email text,
  eligible_email_domain text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > starts_at),
  CHECK (access_ends_at IS NULL OR access_ends_at > starts_at),
  CHECK (eligible_email IS NULL OR eligible_email = lower(btrim(eligible_email))),
  CHECK (
    eligible_email_domain IS NULL
    OR eligible_email_domain = lower(trim(leading '@' FROM eligible_email_domain))
  )
);

CREATE TABLE public.waveos_complimentary_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.waveos_complimentary_codes(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  plan text NOT NULL CHECK (plan IN ('standard', 'full', 'expanded')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  access_ends_at timestamptz,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason text,
  UNIQUE (code_id, user_id),
  UNIQUE (code_id, workspace_id)
);

CREATE TABLE public.waveos_complimentary_code_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL DEFAULT false
);

CREATE INDEX waveos_complimentary_codes_active_idx
  ON public.waveos_complimentary_codes(is_active, starts_at, expires_at);
CREATE INDEX waveos_complimentary_grants_workspace_idx
  ON public.waveos_complimentary_grants(workspace_id, status);
CREATE INDEX waveos_complimentary_attempts_user_time_idx
  ON public.waveos_complimentary_code_attempts(user_id, attempted_at DESC);

ALTER TABLE public.waveos_complimentary_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waveos_complimentary_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waveos_complimentary_code_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.waveos_complimentary_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.waveos_complimentary_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.waveos_complimentary_code_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.waveos_complimentary_codes TO service_role;
GRANT ALL ON public.waveos_complimentary_grants TO service_role;
GRANT ALL ON public.waveos_complimentary_code_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.waveos_complimentary_code_attempts_id_seq TO service_role;

ALTER TABLE public.workspace_social_subscriptions
  ADD COLUMN entitlement_source text NOT NULL DEFAULT 'stripe',
  ADD COLUMN complimentary_grant_id uuid REFERENCES public.waveos_complimentary_grants(id) ON DELETE SET NULL,
  ADD COLUMN complimentary_access_ends_at timestamptz;

UPDATE public.workspace_social_subscriptions
SET entitlement_source = 'internal_test'
WHERE internal_test_access;

ALTER TABLE public.workspace_social_subscriptions
  ADD CONSTRAINT workspace_social_subscriptions_entitlement_source_check
  CHECK (entitlement_source IN ('stripe', 'internal_test', 'complimentary_code'));

COMMENT ON COLUMN public.workspace_social_subscriptions.entitlement_source IS
  'Authoritative access source. Complimentary codes are not trials, test accounts, or Stripe subscriptions.';

CREATE OR REPLACE FUNCTION public.redeem_waveos_complimentary_code(
  _workspace_id uuid,
  _code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _code_row public.waveos_complimentary_codes%ROWTYPE;
  _subscription public.workspace_social_subscriptions%ROWTYPE;
  _grant_id uuid;
  _account_limit integer;
  _result text := 'unavailable';
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;

  IF (
    SELECT count(*)
    FROM public.waveos_complimentary_code_attempts
    WHERE user_id = _uid
      AND attempted_at > now() - interval '15 minutes'
      AND NOT succeeded
  ) >= 5 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid;

  SELECT * INTO _code_row
  FROM public.waveos_complimentary_codes
  WHERE code_hash = encode(
    extensions.digest(upper(btrim(coalesce(_code, '')))::bytea, 'sha256'),
    'hex'
  )
  FOR UPDATE;

  IF NOT FOUND
     OR NOT _code_row.is_active
     OR _code_row.starts_at > now()
     OR (_code_row.expires_at IS NOT NULL AND _code_row.expires_at <= now())
     OR (_code_row.access_ends_at IS NOT NULL AND _code_row.access_ends_at <= now())
     OR _code_row.redemption_count >= _code_row.max_redemptions
     OR (_code_row.eligible_email IS NOT NULL AND _code_row.eligible_email <> _email)
     OR (
       _code_row.eligible_email_domain IS NOT NULL
       AND split_part(_email, '@', 2) <> _code_row.eligible_email_domain
     ) THEN
    INSERT INTO public.waveos_complimentary_code_attempts(user_id, succeeded)
    VALUES (_uid, false);
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    JOIN public.workspace_members AS member ON member.workspace_id = workspace.id
    WHERE workspace.id = _workspace_id
      AND workspace.data_source = 'os_data'
      AND NOT workspace.is_archived
      AND member.user_id = _uid
      AND member.role IN ('owner', 'admin')
  ) THEN
    INSERT INTO public.waveos_complimentary_code_attempts(user_id, succeeded)
    VALUES (_uid, false);
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.waveos_complimentary_grants
    WHERE code_id = _code_row.id AND (user_id = _uid OR workspace_id = _workspace_id)
  ) THEN
    INSERT INTO public.waveos_complimentary_code_attempts(user_id, succeeded)
    VALUES (_uid, false);
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT * INTO _subscription
  FROM public.workspace_social_subscriptions
  WHERE workspace_id = _workspace_id
  FOR UPDATE;

  IF FOUND AND (
    _subscription.internal_test_access
    OR _subscription.entitlement_source = 'internal_test'
    OR _subscription.stripe_customer_id IS NOT NULL
    OR _subscription.stripe_subscription_id IS NOT NULL
    OR _subscription.stripe_checkout_session_id IS NOT NULL
    OR (
      _subscription.entitlement_source = 'complimentary_code'
      AND _subscription.complimentary_grant_id IS NOT NULL
      AND _subscription.service_locked_at IS NULL
      AND (
        _subscription.complimentary_access_ends_at IS NULL
        OR _subscription.complimentary_access_ends_at > now()
      )
    )
  ) THEN
    INSERT INTO public.waveos_complimentary_code_attempts(user_id, succeeded)
    VALUES (_uid, false);
    RETURN jsonb_build_object('status', 'billing_review_required');
  END IF;

  _account_limit := CASE _code_row.plan
    WHEN 'standard' THEN 3
    WHEN 'full' THEN 4
    WHEN 'expanded' THEN 8
  END;

  INSERT INTO public.waveos_complimentary_grants(
    code_id, user_id, workspace_id, plan, access_ends_at
  ) VALUES (
    _code_row.id, _uid, _workspace_id, _code_row.plan, _code_row.access_ends_at
  ) RETURNING id INTO _grant_id;

  INSERT INTO public.workspace_social_subscriptions(
    workspace_id, plan, status, internal_test_access, entitlement_source,
    complimentary_grant_id, complimentary_access_ends_at, billing_interval,
    account_limit, trial_started_at, trial_ends_at, current_period_end,
    cancel_at_period_end, payment_failure_count, last_payment_failed_at,
    service_locked_at
  ) VALUES (
    _workspace_id, _code_row.plan, 'active', false, 'complimentary_code',
    _grant_id, _code_row.access_ends_at, NULL, _account_limit, NULL, NULL, NULL,
    false, 0, NULL, NULL
  )
  ON CONFLICT (workspace_id) DO UPDATE SET
    plan = EXCLUDED.plan,
    status = 'active',
    internal_test_access = false,
    entitlement_source = 'complimentary_code',
    complimentary_grant_id = EXCLUDED.complimentary_grant_id,
    complimentary_access_ends_at = EXCLUDED.complimentary_access_ends_at,
    billing_interval = NULL,
    account_limit = EXCLUDED.account_limit,
    trial_started_at = NULL,
    trial_ends_at = NULL,
    current_period_end = NULL,
    cancel_at_period_end = false,
    payment_failure_count = 0,
    last_payment_failed_at = NULL,
    service_locked_at = NULL,
    updated_at = now();

  UPDATE public.waveos_complimentary_codes
  SET redemption_count = redemption_count + 1, updated_at = now()
  WHERE id = _code_row.id;

  INSERT INTO public.waveos_complimentary_code_attempts(user_id, succeeded)
  VALUES (_uid, true);

  INSERT INTO public.activity_logs(
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _workspace_id, _uid, 'complimentary_access_redeemed',
    'waveos_complimentary_grant', _grant_id,
    jsonb_build_object(
      'code_id', _code_row.id,
      'plan', _code_row.plan,
      'access_ends_at', _code_row.access_ends_at,
      'entitlement_source', 'complimentary_code'
    )
  );

  RETURN jsonb_build_object(
    'status', 'redeemed',
    'plan', _code_row.plan,
    'access_ends_at', _code_row.access_ends_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_waveos_complimentary_grant(
  _grant_id uuid,
  _actor_user_id uuid,
  _reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _actor_user_id AND role = 'dream_wave_owner'
  ) THEN
    RAISE EXCEPTION 'owner_required';
  END IF;

  UPDATE public.waveos_complimentary_grants
  SET status = 'revoked', revoked_at = now(), revoked_by = _actor_user_id,
      revoke_reason = nullif(btrim(_reason), '')
  WHERE id = _grant_id AND status = 'active'
  RETURNING workspace_id INTO _workspace_id;

  IF _workspace_id IS NULL THEN RETURN false; END IF;

  UPDATE public.workspace_social_subscriptions
  SET status = 'expired', service_locked_at = now(), updated_at = now()
  WHERE workspace_id = _workspace_id
    AND complimentary_grant_id = _grant_id
    AND entitlement_source = 'complimentary_code';

  INSERT INTO public.activity_logs(
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _workspace_id, _actor_user_id, 'complimentary_access_revoked',
    'waveos_complimentary_grant', _grant_id,
    jsonb_build_object('reason', nullif(btrim(_reason), ''))
  );
  RETURN true;
END;
$$;

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
        OR subscription.entitlement_source = 'internal_test'
        OR (
          subscription.entitlement_source = 'complimentary_code'
          AND subscription.status = 'active'
          AND subscription.service_locked_at IS NULL
          AND subscription.complimentary_grant_id IS NOT NULL
          AND (
            subscription.complimentary_access_ends_at IS NULL
            OR subscription.complimentary_access_ends_at > now()
          )
          AND EXISTS (
            SELECT 1 FROM public.waveos_complimentary_grants AS grant_record
            WHERE grant_record.id = subscription.complimentary_grant_id
              AND grant_record.workspace_id = subscription.workspace_id
              AND grant_record.status = 'active'
              AND (grant_record.access_ends_at IS NULL OR grant_record.access_ends_at > now())
          )
        )
        OR (
          subscription.entitlement_source = 'stripe'
          AND subscription.service_locked_at IS NULL
          AND (
            (subscription.status = 'active' AND subscription.stripe_subscription_id IS NOT NULL)
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
                SELECT 1 FROM public.os_promo_redemptions AS redemption
                WHERE redemption.workspace_id = subscription.workspace_id
              )
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.redeem_waveos_complimentary_code(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_waveos_complimentary_code(uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_waveos_complimentary_grant(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_waveos_complimentary_grant(uuid, uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.social_subscription_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_subscription_is_active(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
