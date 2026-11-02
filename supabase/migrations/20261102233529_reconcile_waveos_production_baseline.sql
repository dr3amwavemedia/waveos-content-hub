-- Reconcile the verified WaveOS production baseline directly to the current
-- schema without replaying historical migrations or rewriting live billing data.
-- This file is intentionally self-contained because production migration history
-- stops at 20260814013731.
BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('waveos-production-baseline-reconciliation', 0)
);

-- Fail closed when the verified baseline has drifted. This migration must never
-- be pointed at another Supabase project or a partially reconciled tenant model.
DO $preflight$
DECLARE
  _missing text[];
BEGIN
  SELECT array_agg(required.object_name ORDER BY required.object_name)
  INTO _missing
  FROM (
    VALUES
      ('public.workspaces'),
      ('public.profiles'),
      ('public.workspace_members'),
      ('public.user_roles'),
      ('public.content_items'),
      ('public.post_variants'),
      ('public.approvals'),
      ('public.comments'),
      ('public.publish_attempts'),
      ('public.media_assets'),
      ('public.media_folders'),
      ('public.client_invoices'),
      ('public.client_deliveries'),
      ('public.webhook_events'),
      ('storage.objects')
  ) AS required(object_name)
  WHERE pg_catalog.to_regclass(required.object_name) IS NULL;

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'waveos reconciliation prerequisites missing: %', _missing;
  END IF;

  IF pg_catalog.to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL
     OR pg_catalog.to_regprocedure('public.is_workspace_member(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.is_dream_wave_staff(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.can_staff_manage_workspace(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION 'waveos reconciliation authorization prerequisites missing';
  END IF;
END;
$preflight$;

-- Existing workspaces and profiles remain Dream Wave client data. PostgreSQL's
-- constant defaults add the values without reclassifying any row.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'client_data';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_source text NOT NULL DEFAULT 'client_data',
  ADD COLUMN IF NOT EXISTS payments_enabled boolean NOT NULL DEFAULT true;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass
      AND conname = 'workspaces_data_source_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_data_source_check
      CHECK (data_source IN ('client_data', 'os_data')) NOT VALID;
    ALTER TABLE public.workspaces VALIDATE CONSTRAINT workspaces_data_source_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_account_source_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_source_check
      CHECK (account_source IN ('client_data', 'os_data')) NOT VALID;
    ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_account_source_check;
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS workspaces_data_source_created_idx
  ON public.workspaces(data_source, created_at DESC);
CREATE INDEX IF NOT EXISTS profiles_account_source_created_idx
  ON public.profiles(account_source, created_at DESC);

-- Add the final invoice surface without changing existing invoice totals,
-- numbers, Stripe identifiers, or webhook rows.
ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS amount_paid_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_month date,
  ADD COLUMN IF NOT EXISTS payment_plan text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS checkout_payment_type text NOT NULL DEFAULT 'remaining',
  ADD COLUMN IF NOT EXISTS checkout_payment_cents integer,
  ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS subtotal_cents integer,
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value integer,
  ADD COLUMN IF NOT EXISTS service_fee_percent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_fee_at_checkout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_lock_enabled boolean,
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS provider_session_id text,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_flagged_at timestamptz;

-- Preserve historical visibility and balances using only deterministic values
-- already present on each invoice. No amount_cents or number value is changed.
UPDATE public.client_invoices
SET amount_paid_cents = CASE
      WHEN status::text = 'paid' THEN coalesce(amount_cents, 0)
      ELSE amount_paid_cents
    END,
    published_at = CASE
      WHEN status::text <> 'draft' THEN coalesce(published_at, issued_at, created_at)
      ELSE published_at
    END,
    subtotal_cents = coalesce(subtotal_cents, amount_cents),
    delivery_lock_enabled = coalesce(delivery_lock_enabled, false)
WHERE (status::text = 'paid' AND amount_paid_cents = 0)
   OR (status::text <> 'draft' AND published_at IS NULL)
   OR (subtotal_cents IS NULL AND amount_cents IS NOT NULL)
   OR delivery_lock_enabled IS NULL;

ALTER TABLE public.client_invoices
  ALTER COLUMN delivery_lock_enabled SET DEFAULT true,
  ALTER COLUMN delivery_lock_enabled SET NOT NULL;

CREATE OR REPLACE FUNCTION public.invoice_line_items_total(_items jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  item jsonb;
  total bigint := 0;
  quantity bigint;
  unit_cents bigint;
BEGIN
  IF pg_catalog.jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'line_items_must_be_array';
  END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(_items) LOOP
    IF pg_catalog.jsonb_typeof(item) <> 'object'
       OR pg_catalog.jsonb_typeof(item->'description') <> 'string'
       OR length(btrim(item->>'description')) = 0
       OR pg_catalog.jsonb_typeof(item->'quantity') <> 'number'
       OR pg_catalog.jsonb_typeof(item->'unit_cents') <> 'number' THEN
      RAISE EXCEPTION 'invalid_invoice_line_item';
    END IF;
    quantity := (item->>'quantity')::bigint;
    unit_cents := (item->>'unit_cents')::bigint;
    IF quantity <= 0 OR unit_cents < 0 THEN
      RAISE EXCEPTION 'invalid_invoice_line_item_amount';
    END IF;
    total := total + quantity * unit_cents;
  END LOOP;
  RETURN total;
END;
$function$;
REVOKE ALL ON FUNCTION public.invoice_line_items_total(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_line_items_total(jsonb)
  TO authenticated, service_role;

DO $invoice_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_payment_plan_check') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_payment_plan_check
      CHECK (payment_plan IN ('one_time','deposit_balance','installments','monthly_retainer')) NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_payment_plan_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_amount_paid_check') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_amount_paid_check
      CHECK (amount_paid_cents >= 0 AND (amount_cents IS NULL OR amount_paid_cents <= amount_cents)) NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_amount_paid_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_line_items_array_check') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_line_items_array_check
      CHECK (pg_catalog.jsonb_typeof(line_items) = 'array') NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_line_items_array_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_subtotal_nonnegative') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_subtotal_nonnegative
      CHECK (subtotal_cents IS NULL OR subtotal_cents >= 0) NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_subtotal_nonnegative;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_discount_type_valid') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_discount_type_valid
      CHECK (discount_type IS NULL OR discount_type IN ('fixed','percentage')) NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_discount_type_valid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_discount_value_valid') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_discount_value_valid
      CHECK (
        (discount_type IS NULL AND discount_value IS NULL)
        OR (discount_type = 'fixed' AND discount_value >= 0 AND discount_value <= subtotal_cents)
        OR (discount_type = 'percentage' AND discount_value BETWEEN 0 AND 10000)
      ) NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_discount_value_valid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_checkout_payment_type_check') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_checkout_payment_type_check
      CHECK (checkout_payment_type IN ('remaining','deposit','fixed')) NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_checkout_payment_type_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_checkout_payment_amount_check') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_checkout_payment_amount_check
      CHECK (
        (checkout_payment_type = 'remaining' AND checkout_payment_cents IS NULL)
        OR (
          checkout_payment_type IN ('deposit','fixed')
          AND checkout_payment_cents > 0
          AND (amount_cents IS NULL OR checkout_payment_cents <= amount_cents)
        )
      ) NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_checkout_payment_amount_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_service_fee_percent_valid') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_service_fee_percent_valid
      CHECK (service_fee_percent BETWEEN 0 AND 10000) NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_service_fee_percent_valid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_service_fee_cents_valid') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_service_fee_cents_valid
      CHECK (service_fee_cents >= 0) NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_service_fee_cents_valid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_discounted_total_matches') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_discounted_total_matches
      CHECK (
        amount_cents IS NULL
        OR (
          subtotal_cents IS NOT NULL
          AND (
            pg_catalog.jsonb_array_length(line_items) = 0
            OR subtotal_cents = public.invoice_line_items_total(line_items)
          )
          AND service_fee_cents = round(
            (
              subtotal_cents - CASE
                WHEN discount_type = 'fixed' THEN discount_value
                WHEN discount_type = 'percentage'
                  THEN round(subtotal_cents * discount_value / 10000.0)::integer
                ELSE 0
              END
            ) * service_fee_percent / 10000.0
          )::integer
          AND amount_cents = subtotal_cents - CASE
            WHEN discount_type = 'fixed' THEN discount_value
            WHEN discount_type = 'percentage'
              THEN round(subtotal_cents * discount_value / 10000.0)::integer
            ELSE 0
          END + CASE WHEN processing_fee_at_checkout THEN 0 ELSE service_fee_cents END
        )
      ) NOT VALID;
    ALTER TABLE public.client_invoices VALIDATE CONSTRAINT client_invoices_discounted_total_matches;
  END IF;
END;
$invoice_constraints$;

CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('stripe', 'bloom_csv', 'invoice_backfill')),
  external_id text NOT NULL CHECK (length(btrim(external_id)) > 0),
  import_batch_id uuid,
  invoice_id uuid REFERENCES public.client_invoices(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('payment', 'refund', 'invoice', 'expense')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  processing_fee_cents bigint NOT NULL DEFAULT 0 CHECK (processing_fee_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'unmatched')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS payment_ledger_occurred_idx ON public.payment_ledger(occurred_at DESC);
CREATE INDEX IF NOT EXISTS payment_ledger_invoice_idx ON public.payment_ledger(invoice_id);
CREATE INDEX IF NOT EXISTS payment_ledger_batch_idx ON public.payment_ledger(import_batch_id);
ALTER TABLE public.payment_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_ledger FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.payment_ledger TO authenticated;
GRANT UPDATE (status) ON public.payment_ledger TO authenticated;
GRANT ALL ON public.payment_ledger TO service_role;
DROP POLICY IF EXISTS "Owners read payment books" ON public.payment_ledger;
CREATE POLICY "Owners read payment books" ON public.payment_ledger
  FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));
DROP POLICY IF EXISTS "Owners import Bloom records" ON public.payment_ledger;
CREATE POLICY "Owners import Bloom records" ON public.payment_ledger
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    AND source = 'bloom_csv'
    AND created_by = (SELECT auth.uid())
  );
DROP POLICY IF EXISTS "Owners review pending records" ON public.payment_ledger;
CREATE POLICY "Owners review pending records" ON public.payment_ledger
  FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner') AND source IN ('bloom_csv','stripe'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'dream_wave_owner') AND source IN ('bloom_csv','stripe'));

CREATE TABLE IF NOT EXISTS public.global_invoice_number_counter (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  prefix text NOT NULL,
  last_value bigint NOT NULL CHECK (last_value >= 0),
  pad_width integer NOT NULL CHECK (pad_width BETWEEN 1 AND 18),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.global_invoice_number_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_invoice_number_counter FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.global_invoice_number_counter TO service_role;

WITH highest AS (
  SELECT regexp_match(number, '^(.*?)([0-9]+)$') AS parts
  FROM public.client_invoices
  WHERE number ~ '^(.*?)[0-9]+$'
    AND length((regexp_match(number, '^(.*?)([0-9]+)$'))[2]) <= 18
  ORDER BY ((regexp_match(number, '^(.*?)([0-9]+)$'))[2])::numeric DESC
  LIMIT 1
)
INSERT INTO public.global_invoice_number_counter(singleton, prefix, last_value, pad_width)
SELECT true,
       coalesce(parts[1], 'INV-' || EXTRACT(YEAR FROM now())::integer::text),
       coalesce(parts[2]::bigint, 0),
       coalesce(length(parts[2]), 3)
FROM (SELECT parts FROM highest UNION ALL SELECT NULL::text[] WHERE NOT EXISTS (SELECT 1 FROM highest)) seed
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.invoice_autopay_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_invoice_id uuid NOT NULL UNIQUE REFERENCES public.client_invoices(id) ON DELETE CASCADE,
  current_invoice_id uuid REFERENCES public.client_invoices(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'one_time' CHECK (frequency IN ('one_time','monthly')),
  charge_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  description text,
  status text NOT NULL DEFAULT 'pending_authorization'
    CHECK (status IN ('disabled','pending_authorization','active','processing','completed','failed','action_required','cancelled')),
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_setup_session_id text,
  stripe_last_payment_intent_id text,
  service_fee_percent integer NOT NULL DEFAULT 0 CHECK (service_fee_percent BETWEEN 0 AND 10000),
  service_fee_cents integer NOT NULL DEFAULT 0 CHECK (service_fee_cents >= 0),
  authorized_at timestamptz,
  last_attempt_at timestamptz,
  last_succeeded_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_autopay_due_idx
  ON public.invoice_autopay_schedules(charge_at)
  WHERE enabled AND status = 'active';
ALTER TABLE public.invoice_autopay_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_autopay_schedules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_autopay_schedules TO authenticated;
GRANT ALL ON public.invoice_autopay_schedules TO service_role;
DROP POLICY IF EXISTS "Workspace members view autopay schedules" ON public.invoice_autopay_schedules;
CREATE POLICY "Workspace members view autopay schedules"
  ON public.invoice_autopay_schedules FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.is_dream_wave_staff((SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "Staff manage autopay schedules" ON public.invoice_autopay_schedules;
CREATE POLICY "Staff manage autopay schedules"
  ON public.invoice_autopay_schedules FOR ALL TO authenticated
  USING (public.is_dream_wave_staff((SELECT auth.uid())))
  WITH CHECK (public.is_dream_wave_staff((SELECT auth.uid())));
DROP TRIGGER IF EXISTS update_invoice_autopay_schedules_updated_at ON public.invoice_autopay_schedules;
CREATE TRIGGER update_invoice_autopay_schedules_updated_at
  BEFORE UPDATE ON public.invoice_autopay_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.invoice_delivery_locks (
  invoice_id uuid NOT NULL REFERENCES public.client_invoices(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES public.client_deliveries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, delivery_id)
);
CREATE INDEX IF NOT EXISTS invoice_delivery_locks_delivery_idx
  ON public.invoice_delivery_locks(delivery_id);
ALTER TABLE public.invoice_delivery_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_delivery_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.invoice_delivery_locks TO service_role;

CREATE INDEX IF NOT EXISTS webhook_events_source_external_idx
  ON public.webhook_events(source, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.workspace_social_subscriptions (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan text NOT NULL,
  status text NOT NULL,
  billing_interval text,
  account_limit smallint NOT NULL,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  payment_failure_count integer NOT NULL DEFAULT 0,
  last_payment_failed_at timestamptz,
  service_locked_at timestamptz,
  internal_test_access boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_social_subscriptions_plan_check
    CHECK (plan IN ('trial','standard','full','expanded')),
  CONSTRAINT workspace_social_subscriptions_status_check
    CHECK (status IN ('trialing','checkout_pending','active','past_due','canceled','expired')),
  CONSTRAINT workspace_social_subscriptions_billing_interval_check
    CHECK (billing_interval IS NULL OR billing_interval IN ('monthly','annual')),
  CONSTRAINT workspace_social_subscriptions_account_limit_check
    CHECK (account_limit IN (2,3,4,6,8)),
  CONSTRAINT workspace_social_subscriptions_plan_account_limit_check
    CHECK (
      (plan = 'trial' AND account_limit IN (2,3))
      OR (plan = 'standard' AND account_limit = 3)
      OR (plan = 'full' AND account_limit = 4)
      OR (plan = 'expanded' AND account_limit IN (6,8))
    ),
  CONSTRAINT workspace_social_subscriptions_payment_failure_count_check
    CHECK (payment_failure_count >= 0)
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
DROP POLICY IF EXISTS "OS members view social subscription" ON public.workspace_social_subscriptions;
CREATE POLICY "OS members view social subscription"
  ON public.workspace_social_subscriptions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE workspaces.id = workspace_social_subscriptions.workspace_id
        AND workspaces.data_source = 'os_data'
    )
    AND (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      OR public.is_dream_wave_staff((SELECT auth.uid()))
    )
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
DROP POLICY IF EXISTS "Members view subscription invoices" ON public.workspace_social_subscription_invoices;
CREATE POLICY "Members view subscription invoices"
  ON public.workspace_social_subscription_invoices FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.is_dream_wave_staff((SELECT auth.uid()))
  );

CREATE TABLE IF NOT EXISTS public.os_promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  bonus_trial_days smallint NOT NULL CHECK (bonus_trial_days BETWEEN 1 AND 30),
  max_redemptions integer NOT NULL CHECK (max_redemptions BETWEEN 1 AND 100000),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  color_theme text NOT NULL DEFAULT 'ocean'
    CHECK (color_theme IN ('ocean','violet','emerald','sunset')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{2,23}$'),
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS os_promo_codes_lower_code_unique
  ON public.os_promo_codes(lower(code));
CREATE INDEX IF NOT EXISTS os_promo_codes_status_idx
  ON public.os_promo_codes(is_active, starts_at, expires_at);

CREATE TABLE IF NOT EXISTS public.os_promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.os_promo_codes(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bonus_trial_days smallint NOT NULL CHECK (bonus_trial_days BETWEEN 1 AND 30),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(workspace_id)
);
ALTER TABLE public.os_promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_promo_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.os_promo_codes, public.os_promo_redemptions
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.os_promo_codes, public.os_promo_redemptions TO service_role;
DROP TRIGGER IF EXISTS os_promo_codes_updated_at ON public.os_promo_codes;
CREATE TRIGGER os_promo_codes_updated_at
  BEFORE UPDATE ON public.os_promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.publishing_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  paused boolean NOT NULL DEFAULT false,
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publishing_controls_scope_unique UNIQUE NULLS NOT DISTINCT (workspace_id)
);
CREATE TABLE IF NOT EXISTS public.social_subscription_lifecycle (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('active','grace','disconnected','retention','archived','error')),
  reason text,
  inactive_since timestamptz,
  disconnect_at timestamptz,
  disconnected_at timestamptz,
  archive_at timestamptz,
  archived_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.publishing_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_subscription_lifecycle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publishing_controls, public.social_subscription_lifecycle
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.publishing_controls, public.social_subscription_lifecycle TO service_role;
CREATE INDEX IF NOT EXISTS publish_attempts_stale_sending_idx
  ON public.publish_attempts(attempted_at) WHERE status = 'sending';
CREATE INDEX IF NOT EXISTS social_lifecycle_due_idx
  ON public.social_subscription_lifecycle(state, disconnect_at, archive_at);

CREATE TABLE IF NOT EXISTS public.os_account_support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  request_type text NOT NULL
    CHECK (request_type IN ('sign_in','password_reset','account_help')),
  detail text,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','sent','failed','skipped')),
  delivery_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS os_account_support_requests_email_created_idx
  ON public.os_account_support_requests(lower(email), created_at DESC);
ALTER TABLE public.os_account_support_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.os_account_support_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.os_account_support_requests TO authenticated;
GRANT ALL ON public.os_account_support_requests TO service_role;
DROP POLICY IF EXISTS "Owners view OS support requests" ON public.os_account_support_requests;
CREATE POLICY "Owners view OS support requests"
  ON public.os_account_support_requests FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

-- This service-only table is referenced by the existing Stripe invoice
-- settlement path. Creating it empty cannot place or release a client hold.
CREATE TABLE IF NOT EXISTS public.delivery_payment_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'workspace'
    CHECK (scope IN ('workspace','delivery','project')),
  target_id uuid,
  release_condition text NOT NULL DEFAULT 'paid_in_full'
    CHECK (release_condition IN ('deposit_paid','paid_in_full')),
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  released_at timestamptz,
  released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_payment_holds_workspace_active_idx
  ON public.delivery_payment_holds(workspace_id, is_active);
ALTER TABLE public.delivery_payment_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_payment_holds FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.delivery_payment_holds TO service_role;


-- Final definition from 20261006034433_auto_provision_os_workspaces.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, avatar_url, account_source)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'avatar_url',
    'client_data'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


-- Final definition from 20261003123000_separate_os_and_client_data.sql
CREATE OR REPLACE FUNCTION public.admin_set_os_account_payments(
  _user_id uuid, _enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'dream_wave_owner') THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND account_source = 'os_data')
    THEN RAISE EXCEPTION 'os_account_not_found'; END IF;
  UPDATE public.profiles SET payments_enabled = _enabled WHERE id = _user_id;
  INSERT INTO public.activity_logs(actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (auth.uid(), 'os_account_payments_changed', 'profile', _user_id,
    jsonb_build_object('payments_enabled', _enabled));
END;
$$;


-- Final definition from 20261003140000_os_promo_codes.sql
CREATE OR REPLACE FUNCTION public.validate_os_promo_code(_code text)
RETURNS TABLE(name text, bonus_trial_days integer, color_theme text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT promo.name, promo.bonus_trial_days::integer, promo.color_theme
  FROM public.os_promo_codes AS promo
  WHERE lower(promo.code) = lower(btrim(_code))
    AND promo.is_active
    AND promo.starts_at <= now()
    AND (promo.expires_at IS NULL OR promo.expires_at > now())
    AND promo.redemption_count < promo.max_redemptions
  LIMIT 1;
$$;


-- Final definition from 20261003140000_os_promo_codes.sql
CREATE OR REPLACE FUNCTION public.create_os_trial_workspace(
  _name text,
  _business_name text DEFAULT NULL,
  _industry text DEFAULT NULL,
  _website text DEFAULT NULL,
  _timezone text DEFAULT 'America/New_York',
  _primary_language text DEFAULT 'en',
  _service_area text DEFAULT NULL,
  _target_audience text DEFAULT NULL,
  _promo_code text DEFAULT NULL
)
RETURNS TABLE(id uuid, slug text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _created record;
  _promo public.os_promo_codes%ROWTYPE;
  _bonus_days integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = _uid AND profiles.account_source = 'os_data'
  ) THEN
    RAISE EXCEPTION 'os_account_required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.workspace_members
    JOIN public.workspaces ON workspaces.id = workspace_members.workspace_id
    WHERE workspace_members.user_id = _uid
      AND workspaces.data_source = 'os_data'
  ) THEN
    RAISE EXCEPTION 'os_workspace_already_exists';
  END IF;

  IF nullif(btrim(coalesce(_promo_code, '')), '') IS NOT NULL THEN
    SELECT * INTO _promo
    FROM public.os_promo_codes AS promo
    WHERE lower(promo.code) = lower(btrim(_promo_code))
    FOR UPDATE;
    IF NOT FOUND OR NOT _promo.is_active OR _promo.starts_at > now()
       OR (_promo.expires_at IS NOT NULL AND _promo.expires_at <= now())
       OR _promo.redemption_count >= _promo.max_redemptions THEN
      RAISE EXCEPTION 'promo_code_invalid_or_unavailable';
    END IF;
    _bonus_days := _promo.bonus_trial_days;
  END IF;

  SELECT created.id, created.slug, created.name INTO _created
  FROM public.create_brand_workspace(
    _name, _business_name, _industry, _website, _timezone,
    _primary_language, _service_area, _target_audience
  ) AS created;

  UPDATE public.workspaces
  SET data_source = 'os_data'
  WHERE workspaces.id = _created.id AND workspaces.created_by = _uid;

  INSERT INTO public.workspace_social_subscriptions (
    workspace_id, plan, status, account_limit, trial_started_at, trial_ends_at
  ) VALUES (
    _created.id, 'trial', 'trialing', 2, now(),
    now() + make_interval(days => 30 + _bonus_days)
  ) ON CONFLICT (workspace_id) DO NOTHING;

  IF _promo.id IS NOT NULL THEN
    INSERT INTO public.os_promo_redemptions (
      promo_code_id, user_id, workspace_id, bonus_trial_days
    ) VALUES (_promo.id, _uid, _created.id, _bonus_days);
    UPDATE public.os_promo_codes
    SET redemption_count = redemption_count + 1
    WHERE os_promo_codes.id = _promo.id;
  END IF;

  INSERT INTO public.activity_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _created.id, _uid, 'os_trial_started', 'workspace', _created.id,
    jsonb_build_object(
      'account_limit', 2,
      'trial_days', 30 + _bonus_days,
      'promo_applied', _promo.id IS NOT NULL
    )
  );

  RETURN QUERY SELECT _created.id, _created.slug, _created.name;
END;
$$;


-- Final definition from 20261007194700_promo_trial_guardrails.sql
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


-- Final definition from 20261006034433_auto_provision_os_workspaces.sql
CREATE OR REPLACE FUNCTION public.activate_public_os_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _created_at timestamptz;
  _account_source text;
  _workspace_name text;
  _promo_code text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT auth_users.email,
         auth_users.created_at,
         profiles.account_source,
         auth_users.raw_user_meta_data ->> 'workspace_name',
         auth_users.raw_user_meta_data ->> 'promo_code'
  INTO _email, _created_at, _account_source, _workspace_name, _promo_code
  FROM auth.users AS auth_users
  JOIN public.profiles ON profiles.id = auth_users.id
  WHERE auth_users.id = _uid;

  IF _account_source <> 'os_data' THEN
    IF _created_at < now() - interval '15 minutes' THEN
      RAISE EXCEPTION 'public_signup_window_closed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid)
       OR EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = _uid)
       OR EXISTS (
         SELECT 1 FROM public.invites
         WHERE lower(email) = lower(_email)
           AND status IN ('pending', 'accepted')
       ) THEN
      RAISE EXCEPTION 'account_already_assigned';
    END IF;
    UPDATE public.profiles SET account_source = 'os_data' WHERE id = _uid;
  END IF;

  -- Metadata is only untrusted input here. provision_os_trial_workspace
  -- validates any promo against the locked server-side promo table.
  RETURN public.provision_os_trial_workspace(_uid, _workspace_name, _promo_code);
END;
$$;


-- Final definition from 20261007194700_promo_trial_guardrails.sql
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


-- Final definition from 20261007194700_promo_trial_guardrails.sql
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


-- Final definition from 20261008000000_internal_test_subscription_access.sql
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


-- Final definition from 20261006040214_separate_public_subscriptions_from_clients.sql
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


-- Final definition from 20261007191323_require_public_subscription_payment.sql
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


-- Final definition from 20261008004514_tidal_team_access.sql
CREATE OR REPLACE FUNCTION public.create_invite(
  _email text, _workspace_id uuid,
  _workspace_role public.workspace_member_role, _app_role public.app_role,
  _expires_days integer DEFAULT 14
)
RETURNS TABLE(invite_id uuid, raw_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := auth.uid(); _token text; _hash text; _id uuid;
  _clean_email text := lower(btrim(coalesce(_email, '')));
  _data_source text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF _workspace_role NOT IN ('admin', 'editor', 'approver', 'viewer') THEN
    RAISE EXCEPTION 'invalid_workspace_role';
  END IF;
  IF NOT public.is_dream_wave_staff(_uid) AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id AND wm.user_id = _uid
      AND wm.role IN ('owner', 'admin')
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT data_source INTO _data_source FROM public.workspaces WHERE id = _workspace_id;
  IF _data_source = 'os_data' AND NOT public.has_feature(_workspace_id, 'can_invite_members') THEN
    RAISE EXCEPTION 'tidal_plan_required';
  END IF;
  IF _app_role IN ('dream_wave_owner', 'dream_wave_team') THEN
    RAISE EXCEPTION 'staff_roles_not_invitable_here';
  END IF;

  _token := replace(replace(replace(encode(extensions.gen_random_bytes(48), 'base64'), '+', '-'), '/', '_'), '=', '');
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');
  UPDATE public.invites SET status = 'revoked', revoked_at = now(), revoked_by = _uid
  WHERE email = _clean_email AND workspace_id = _workspace_id AND status = 'pending';
  INSERT INTO public.invites (
    email, workspace_id, workspace_role, app_role, token, token_hash, invited_by, expires_at
  ) VALUES (
    _clean_email, _workspace_id, _workspace_role, _app_role, _token, _hash, _uid,
    now() + make_interval(days => greatest(1, least(_expires_days, 30)))
  ) RETURNING id INTO _id;
  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_workspace_id, _uid, 'invitation_created', 'invite', _id,
    jsonb_build_object('email', _clean_email, 'role', _workspace_role::text));
  RETURN QUERY SELECT _id, _token;
END;
$$;


-- Final definition from 20261008004514_tidal_team_access.sql
CREATE OR REPLACE FUNCTION public.resend_invite(_invite_id uuid, _extend_days integer DEFAULT 14)
RETURNS TABLE(raw_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := auth.uid(); _token text; _hash text; _ws uuid; _app_role public.app_role;
  _data_source text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT i.workspace_id, i.app_role INTO _ws, _app_role FROM public.invites i WHERE i.id = _invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF _app_role = 'dream_wave_team' THEN
    IF NOT public.has_role(_uid, 'dream_wave_owner') THEN RAISE EXCEPTION 'owner_required'; END IF;
  ELSIF NOT public.is_dream_wave_staff(_uid) AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _ws AND wm.user_id = _uid AND wm.role IN ('owner', 'admin')
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT data_source INTO _data_source FROM public.workspaces WHERE id = _ws;
  IF _data_source = 'os_data' AND NOT public.has_feature(_ws, 'can_invite_members') THEN
    RAISE EXCEPTION 'tidal_plan_required';
  END IF;
  _token := replace(replace(replace(encode(extensions.gen_random_bytes(48), 'base64'), '+', '-'), '/', '_'), '=', '');
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');
  UPDATE public.invites SET token = _token, token_hash = _hash,
    expires_at = now() + make_interval(days => greatest(1, least(_extend_days, 30))),
    resend_count = resend_count + 1, last_sent_at = now(), status = 'pending',
    revoked_at = NULL, revoked_by = NULL, accepted_at = NULL WHERE id = _invite_id;
  IF _ws IS NOT NULL THEN
    INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
    VALUES (_ws, _uid, 'invitation_resent', 'invite', _invite_id, '{}'::jsonb);
  END IF;
  RETURN QUERY SELECT _token;
END;
$$;


-- Final definition from 20260917173000_contract_visibility_and_global_invoice_sequence.sql
CREATE OR REPLACE FUNCTION public.next_invoice_number(_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  counter public.global_invoice_number_counter%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'dream_wave_owner')
     OR NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = _workspace_id) THEN
    RAISE EXCEPTION 'Only the WaveOS owner can assign invoice numbers.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.global_invoice_number_counter
  SET last_value = last_value + 1, updated_at = now()
  WHERE singleton
  RETURNING * INTO counter;

  RETURN counter.prefix || lpad(counter.last_value::text, counter.pad_width, '0');
END;
$$;


-- Final definition from 20260918044000_preserve_legacy_invoice_number_edits.sql
CREATE OR REPLACE FUNCTION public.register_global_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parts text[];
  current_counter public.global_invoice_number_counter%ROWTYPE;
  candidate bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.number IS NOT DISTINCT FROM OLD.number THEN
    RETURN NEW;
  END IF;

  IF NEW.number IS NULL OR NEW.number !~ '^(.*?)[0-9]+$' THEN
    RETURN NEW;
  END IF;

  parts := regexp_match(NEW.number, '^(.*?)([0-9]+)$');
  IF length(parts[2]) > 18 THEN
    RAISE EXCEPTION 'Invoice number numeric suffix is too long.';
  END IF;
  candidate := parts[2]::bigint;

  IF EXISTS (
    SELECT 1 FROM public.client_invoices
    WHERE number = NEW.number AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Invoice number % is already in use.', NEW.number USING ERRCODE = '23505';
  END IF;

  SELECT * INTO current_counter
  FROM public.global_invoice_number_counter
  WHERE singleton
  FOR UPDATE;

  IF parts[1] <> current_counter.prefix OR candidate > current_counter.last_value THEN
    UPDATE public.global_invoice_number_counter
    SET prefix = parts[1],
        last_value = candidate,
        pad_width = length(parts[2]),
        updated_at = now()
    WHERE singleton;
  END IF;

  RETURN NEW;
END;
$$;


-- Final definition from 20260921143911_secure_autopay_service_numbering.sql
CREATE OR REPLACE FUNCTION public.next_service_invoice_number(_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  counter public.global_invoice_number_counter%ROWTYPE;
BEGIN
  IF coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = _workspace_id) THEN
    RAISE EXCEPTION 'workspace_not_found';
  END IF;

  UPDATE public.global_invoice_number_counter
  SET last_value = last_value + 1, updated_at = now()
  WHERE singleton
  RETURNING * INTO counter;

  IF counter IS NULL THEN
    RAISE EXCEPTION 'invoice_counter_missing';
  END IF;
  RETURN counter.prefix || lpad(counter.last_value::text, counter.pad_width, '0');
END;
$$;


-- Final definition from 20260921143911_secure_autopay_service_numbering.sql
CREATE OR REPLACE FUNCTION public.claim_webhook_event(
  _source text,
  _event_type text,
  _external_id text,
  _payload jsonb,
  _processed_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF _external_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(_source || ':' || _external_id, 0)
    );
    IF EXISTS (
      SELECT 1 FROM public.webhook_events
      WHERE source = _source AND external_id = _external_id
    ) THEN
      RETURN false;
    END IF;
  END IF;

  INSERT INTO public.webhook_events(source, event_type, external_id, payload, processed_at)
  VALUES (_source, _event_type, _external_id, _payload, _processed_at);
  RETURN true;
END;
$$;


-- Final definition from 20260921143911_secure_autopay_service_numbering.sql
CREATE OR REPLACE FUNCTION public.record_autopay_payment(
  _schedule_id uuid,
  _invoice_id uuid,
  _payment_id text,
  _amount_cents integer,
  _currency text,
  _occurred_at timestamptz,
  _next_charge_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  applied boolean,
  invoice_number text,
  total_paid_cents bigint,
  balance_cents bigint,
  invoice_currency text,
  invoice_workspace_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  schedule public.invoice_autopay_schedules%ROWTYPE;
  invoice public.client_invoices%ROWTYPE;
  paid_now bigint;
  settled boolean;
BEGIN
  IF coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_payment_id), '') IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_autopay_payment';
  END IF;

  SELECT * INTO schedule
  FROM public.invoice_autopay_schedules
  WHERE id = _schedule_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'autopay_schedule_missing'; END IF;

  SELECT * INTO invoice
  FROM public.client_invoices
  WHERE id = _invoice_id AND workspace_id = schedule.workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'autopay_invoice_missing'; END IF;

  IF _amount_cents <> schedule.amount_cents
     OR upper(_currency) <> upper(schedule.currency)
     OR upper(invoice.currency) <> upper(schedule.currency) THEN
    RAISE EXCEPTION 'autopay_amount_or_currency_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_ledger
    WHERE source = 'stripe' AND external_id = _payment_id
  ) THEN
    RETURN QUERY SELECT false, invoice.number, invoice.amount_paid_cents,
      greatest(coalesce(invoice.amount_cents, 0) - coalesce(invoice.amount_paid_cents, 0), 0)::bigint,
      invoice.currency, invoice.workspace_id;
    RETURN;
  END IF;

  IF coalesce(invoice.amount_cents, 0) - coalesce(invoice.amount_paid_cents, 0) <> _amount_cents THEN
    RAISE EXCEPTION 'autopay_invoice_balance_changed';
  END IF;

  INSERT INTO public.payment_ledger (
    source, external_id, invoice_id, workspace_id, kind, amount_cents,
    currency, occurred_at, description, status
  ) VALUES (
    'stripe', _payment_id, invoice.id, invoice.workspace_id, 'payment', _amount_cents,
    upper(_currency), coalesce(_occurred_at, now()),
    'Automatic Stripe charge for invoice ' || invoice.id::text, 'posted'
  );

  paid_now := least(
    coalesce(invoice.amount_paid_cents, 0) + _amount_cents,
    coalesce(invoice.amount_cents, _amount_cents)
  );
  settled := coalesce(invoice.amount_cents, 0) > 0 AND paid_now >= invoice.amount_cents;

  UPDATE public.client_invoices
  SET amount_paid_cents = paid_now,
      status = CASE WHEN settled THEN 'paid'::public.invoice_status ELSE 'deposit'::public.invoice_status END,
      paid_at = CASE WHEN settled THEN coalesce(_occurred_at, now()) ELSE NULL END,
      payment_provider = 'stripe',
      provider_payment_id = _payment_id
  WHERE id = invoice.id;

  UPDATE public.delivery_payment_holds
  SET is_active = false, released_at = now()
  WHERE workspace_id = invoice.workspace_id
    AND is_active
    AND release_condition IN (
      CASE WHEN settled THEN 'paid_in_full' ELSE 'deposit_paid' END,
      'deposit_paid'
    );

  IF schedule.frequency = 'monthly' THEN
    IF _next_charge_at IS NULL OR _next_charge_at <= schedule.charge_at THEN
      RAISE EXCEPTION 'invalid_next_autopay_charge';
    END IF;
    UPDATE public.invoice_autopay_schedules
    SET status = 'active', charge_at = _next_charge_at, current_invoice_id = NULL,
        last_succeeded_at = coalesce(_occurred_at, now()), last_error = NULL
    WHERE id = schedule.id;
  ELSE
    UPDATE public.invoice_autopay_schedules
    SET status = 'completed', enabled = false,
        last_succeeded_at = coalesce(_occurred_at, now()), last_error = NULL
    WHERE id = schedule.id;
  END IF;

  RETURN QUERY SELECT true, invoice.number, paid_now,
    greatest(coalesce(invoice.amount_cents, 0) - paid_now, 0)::bigint,
    invoice.currency, invoice.workspace_id;
END;
$$;


-- Final definition from 20261002120000_invoice_delivery_access_locks.sql
CREATE OR REPLACE FUNCTION public.attach_outstanding_invoice_locks(_delivery_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_id uuid;
  _inserted integer := 0;
BEGIN
  SELECT workspace_id INTO _workspace_id
  FROM public.client_deliveries
  WHERE id = _delivery_id;

  IF _workspace_id IS NULL THEN
    RAISE EXCEPTION 'delivery_not_found';
  END IF;

  INSERT INTO public.invoice_delivery_locks(invoice_id, delivery_id)
  SELECT invoice.id, _delivery_id
  FROM public.client_invoices AS invoice
  WHERE invoice.workspace_id = _workspace_id
    AND invoice.delivery_lock_enabled
    AND invoice.status NOT IN ('draft', 'paid', 'void')
  ON CONFLICT (invoice_id, delivery_id) DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$$;


-- Final definition from 20261002120000_invoice_delivery_access_locks.sql
CREATE OR REPLACE FUNCTION public.capture_delivery_invoice_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.attach_outstanding_invoice_locks(NEW.id);
  RETURN NEW;
END;
$$;


-- Final definition from 20261002120000_invoice_delivery_access_locks.sql
CREATE OR REPLACE FUNCTION public.delivery_access_unlocked(_delivery_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.invoice_delivery_locks AS delivery_lock
    JOIN public.client_invoices AS invoice ON invoice.id = delivery_lock.invoice_id
    WHERE delivery_lock.delivery_id = _delivery_id
      AND invoice.delivery_lock_enabled
      AND invoice.status NOT IN ('paid', 'void')
  );
$$;


-- Final definition from 20261002120000_invoice_delivery_access_locks.sql
CREATE OR REPLACE FUNCTION public.notify_delivery_revisions_updated(_delivery_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _delivery public.client_deliveries%ROWTYPE;
  _member record;
  _sent integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.has_role(_uid, 'dream_wave_owner') THEN
    RAISE EXCEPTION 'owner_required';
  END IF;

  SELECT * INTO _delivery
  FROM public.client_deliveries
  WHERE id = _delivery_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_not_found';
  END IF;

  PERFORM public.attach_outstanding_invoice_locks(_delivery.id);

  IF NOT public.delivery_access_unlocked(_delivery.id) THEN
    INSERT INTO public.activity_logs(
      workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
    ) VALUES (
      _delivery.workspace_id,
      _uid,
      'delivery_revisions_payment_locked',
      'client_delivery',
      _delivery.id,
      jsonb_build_object('title', _delivery.title)
    );
    RETURN -1;
  END IF;

  FOR _member IN
    SELECT user_id
    FROM public.workspace_members
    WHERE workspace_id = _delivery.workspace_id
  LOOP
    INSERT INTO public.notifications(user_id, workspace_id, kind, title, body, link)
    VALUES (
      _member.user_id,
      _delivery.workspace_id,
      'generic',
      'Revisions are updated',
      _delivery.title || ' has updated revisions ready for you to review.',
      '/home#your-content'
    );
    _sent := _sent + 1;
  END LOOP;

  INSERT INTO public.activity_logs(
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _delivery.workspace_id,
    _uid,
    'delivery_revisions_notified',
    'client_delivery',
    _delivery.id,
    jsonb_build_object('title', _delivery.title, 'recipients', _sent)
  );

  RETURN _sent;
END;
$$;


-- Final definition from 20261003133000_staff_direct_content_release.sql
CREATE OR REPLACE FUNCTION public.staff_release_content(
  _content_id uuid,
  _release_mode text,
  _requested_action text,
  _scheduled_at timestamptz DEFAULT NULL
)
RETURNS public.content_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _item public.content_items%ROWTYPE;
  _next public.content_status;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _release_mode NOT IN ('approval', 'direct') THEN RAISE EXCEPTION 'invalid_release_mode'; END IF;
  IF _requested_action NOT IN ('publish_now', 'schedule') THEN RAISE EXCEPTION 'invalid_requested_action'; END IF;
  IF _requested_action = 'schedule' AND (_scheduled_at IS NULL OR _scheduled_at <= now()) THEN
    RAISE EXCEPTION 'schedule_time_must_be_future';
  END IF;

  SELECT * INTO _item
  FROM public.content_items
  WHERE id = _content_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'content_not_found'; END IF;
  IF NOT public.can_staff_manage_workspace(_uid, _item.workspace_id) THEN
    RAISE EXCEPTION 'social_media_staff_required';
  END IF;
  IF _item.status IN ('publishing', 'published', 'archived') THEN
    RAISE EXCEPTION 'content_cannot_be_released';
  END IF;

  IF _release_mode = 'approval' THEN
    INSERT INTO public.approvals (content_item_id, workspace_id, decision, note)
    VALUES (
      _item.id,
      _item.workspace_id,
      'pending',
      CASE WHEN _requested_action = 'schedule'
        THEN 'Requested schedule: ' || _scheduled_at::text
        ELSE 'Requested immediate publishing' END
    );

    UPDATE public.content_items
    SET status = 'in_review',
        scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
        approved_by = NULL,
        approved_at = NULL,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'approval_request', jsonb_build_object(
            'action', _requested_action,
            'submitted_by', _uid,
            'submitted_at', now(),
            'staff_selected_mode', 'approval'
          )
        )
    WHERE id = _item.id;

    INSERT INTO public.notifications (user_id, workspace_id, kind, title, body, link)
    SELECT members.user_id, _item.workspace_id, 'content_submitted',
      'Content ready for approval', coalesce(_item.title, 'Untitled post'), '/approvals'
    FROM public.workspace_members AS members
    WHERE members.workspace_id = _item.workspace_id
      AND members.role::text IN ('owner', 'admin', 'approver')
      AND members.user_id <> _uid;

    _next := 'in_review'::public.content_status;
  ELSE
    _next := CASE WHEN _requested_action = 'schedule'
      THEN 'scheduled'::public.content_status
      ELSE 'approved'::public.content_status END;

    UPDATE public.content_items
    SET status = _next,
        scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
        approved_by = _uid,
        approved_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'approval_bypass', jsonb_build_object(
            'action', _requested_action,
            'selected_by', _uid,
            'selected_at', now(),
            'reason', 'authorized_social_media_staff'
          )
        )
    WHERE id = _item.id;
  END IF;

  INSERT INTO public.activity_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _item.workspace_id,
    _uid,
    'content_release_mode_selected',
    'content_item',
    _item.id,
    jsonb_build_object('release_mode', _release_mode, 'requested_action', _requested_action)
  );

  RETURN _next;
END;
$$;


-- Privileged function execution is explicit; PostgreSQL's default PUBLIC grant
-- is never allowed to expose SECURITY DEFINER entry points.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_os_account_payments(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_os_account_payments(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.validate_os_promo_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_os_promo_code(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.create_os_trial_workspace(text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_os_trial_workspace(text,text,text,text,text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.provision_os_trial_workspace(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_os_trial_workspace(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.activate_public_os_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_public_os_account() TO authenticated;
REVOKE ALL ON FUNCTION public.block_public_os_free_trials() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_os_promo_trials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_os_promo_trials() TO service_role;
REVOKE ALL ON FUNCTION public.social_subscription_is_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_account_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_subscription_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.social_account_limit(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_workspace_social_trial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_workspace_social_trial(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_invite(text,uuid,public.workspace_member_role,public.app_role,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resend_invite(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invite(text,uuid,public.workspace_member_role,public.app_role,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_invite(uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.next_invoice_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_global_invoice_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_service_invoice_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_service_invoice_number(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.claim_webhook_event(text,text,text,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_event(text,text,text,jsonb,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.record_autopay_payment(uuid,uuid,text,integer,text,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_autopay_payment(uuid,uuid,text,integer,text,timestamptz,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.attach_outstanding_invoice_locks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_outstanding_invoice_locks(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.capture_delivery_invoice_locks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delivery_access_unlocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_access_unlocked(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_delivery_revisions_updated(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_delivery_revisions_updated(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.can_staff_manage_workspace(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_staff_manage_workspace(uuid,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_release_content(uuid,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_release_content(uuid,text,text,timestamptz) TO authenticated, service_role;

DROP TRIGGER IF EXISTS block_public_os_free_trials ON public.workspace_social_subscriptions;
CREATE TRIGGER block_public_os_free_trials
  BEFORE INSERT OR UPDATE OF plan, status, trial_started_at, trial_ends_at
  ON public.workspace_social_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.block_public_os_free_trials();

DROP TRIGGER IF EXISTS register_global_invoice_number ON public.client_invoices;
CREATE TRIGGER register_global_invoice_number
  BEFORE INSERT OR UPDATE OF number ON public.client_invoices
  FOR EACH ROW EXECUTE FUNCTION public.register_global_invoice_number();

DROP TRIGGER IF EXISTS capture_delivery_invoice_locks ON public.client_deliveries;
CREATE TRIGGER capture_delivery_invoice_locks
  AFTER INSERT OR UPDATE OF title, description, kind, url, delivered_at, is_pinned
  ON public.client_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.capture_delivery_invoice_locks();

DROP POLICY IF EXISTS "Members view deliveries" ON public.client_deliveries;
DROP POLICY IF EXISTS "Members view unlocked deliveries" ON public.client_deliveries;
CREATE POLICY "Members view unlocked deliveries"
  ON public.client_deliveries FOR SELECT TO authenticated
  USING (
    public.is_dream_wave_staff((SELECT auth.uid()))
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.delivery_access_unlocked(id)
    )
  );


-- Social strategy and calendar reconciliation.
-- Monthly social planning plus shared and personal calendar colors.
-- New tables are workspace-scoped and additive; existing calendar/content data
-- is not rewritten.

CREATE TABLE IF NOT EXISTS public.social_strategy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  details text,
  item_kind text NOT NULL DEFAULT 'idea'
    CHECK (item_kind IN ('idea','campaign','product','promotion','launch','announcement')),
  status text NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea','planned','in_progress','awaiting_approval','scheduled','completed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high')),
  start_date date NOT NULL,
  end_date date,
  platforms text[] NOT NULL DEFAULT '{}',
  links text[] NOT NULL DEFAULT '{}',
  media_asset_ids uuid[] NOT NULL DEFAULT '{}',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  related_content_item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS social_strategy_workspace_date_idx
  ON public.social_strategy_items(workspace_id, start_date, status);

CREATE TABLE IF NOT EXISTS public.calendar_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category_key text NOT NULL CHECK (category_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, category_key)
);

CREATE TABLE IF NOT EXISTS public.calendar_color_preferences (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  category_key text NOT NULL CHECK (category_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, category_key)
);

CREATE OR REPLACE FUNCTION public.touch_social_planning_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_social_planning_row() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_social_planning_row() TO authenticated, service_role;

DROP TRIGGER IF EXISTS social_strategy_items_touch ON public.social_strategy_items;
CREATE TRIGGER social_strategy_items_touch
  BEFORE UPDATE ON public.social_strategy_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_social_planning_row();

DROP TRIGGER IF EXISTS calendar_categories_touch ON public.calendar_categories;
CREATE TRIGGER calendar_categories_touch
  BEFORE UPDATE ON public.calendar_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_social_planning_row();

ALTER TABLE public.social_strategy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_color_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.social_strategy_items, public.calendar_categories, public.calendar_color_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_strategy_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_color_preferences TO authenticated;
GRANT ALL ON public.social_strategy_items, public.calendar_categories, public.calendar_color_preferences TO service_role;

DROP POLICY IF EXISTS "authorized workspaces read strategy" ON public.social_strategy_items;
CREATE POLICY "authorized workspaces read strategy"
  ON public.social_strategy_items FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.has_feature(workspace_id, 'can_connect_socials')
    )
  );

DROP POLICY IF EXISTS "authorized workspaces create strategy" ON public.social_strategy_items;
CREATE POLICY "authorized workspaces create strategy"
  ON public.social_strategy_items FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.has_feature(workspace_id, 'can_connect_socials')
    )
  );

DROP POLICY IF EXISTS "authorized workspaces update strategy" ON public.social_strategy_items;
CREATE POLICY "authorized workspaces update strategy"
  ON public.social_strategy_items FOR UPDATE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.has_feature(workspace_id, 'can_connect_socials')
    )
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.has_feature(workspace_id, 'can_connect_socials')
    )
  );

DROP POLICY IF EXISTS "authorized workspaces delete strategy" ON public.social_strategy_items;
CREATE POLICY "authorized workspaces delete strategy"
  ON public.social_strategy_items FOR DELETE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.has_feature(workspace_id, 'can_connect_socials')
    )
  );

DROP POLICY IF EXISTS "workspace members read calendar categories" ON public.calendar_categories;
CREATE POLICY "workspace members read calendar categories"
  ON public.calendar_categories FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
  );

DROP POLICY IF EXISTS "workspace members create calendar categories" ON public.calendar_categories;
CREATE POLICY "workspace members create calendar categories"
  ON public.calendar_categories FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
  );

DROP POLICY IF EXISTS "workspace members update calendar categories" ON public.calendar_categories;
CREATE POLICY "workspace members update calendar categories"
  ON public.calendar_categories FOR UPDATE TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
  );

DROP POLICY IF EXISTS "workspace members delete custom calendar categories" ON public.calendar_categories;
CREATE POLICY "workspace members delete custom calendar categories"
  ON public.calendar_categories FOR DELETE TO authenticated
  USING (
    category_key NOT IN ('content','production','strategy')
    AND (
      public.has_role((SELECT auth.uid()), 'dream_wave_owner')
      OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
    )
  );

DROP POLICY IF EXISTS "users manage their calendar colors" ON public.calendar_color_preferences;
CREATE POLICY "users manage their calendar colors"
  ON public.calendar_color_preferences FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      public.has_role((SELECT auth.uid()), 'dream_wave_owner')
      OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      public.has_role((SELECT auth.uid()), 'dream_wave_owner')
      OR public.is_workspace_member((SELECT auth.uid()), workspace_id)
    )
  );

INSERT INTO public.calendar_categories (workspace_id, category_key, name, color, sort_order)
SELECT workspace.id, defaults.category_key, defaults.name, defaults.color, defaults.sort_order
FROM public.workspaces AS workspace
CROSS JOIN (
  VALUES
    ('content', 'Social posts', '#38BDF8', 10),
    ('production', 'Productions', '#F59E0B', 20),
    ('strategy', 'Ideas & strategy', '#A78BFA', 30)
) AS defaults(category_key, name, color, sort_order)
ON CONFLICT (workspace_id, category_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_calendar_categories_for_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.calendar_categories (workspace_id, category_key, name, color, sort_order)
  VALUES
    (NEW.id, 'content', 'Social posts', '#38BDF8', 10),
    (NEW.id, 'production', 'Productions', '#F59E0B', 20),
    (NEW.id, 'strategy', 'Ideas & strategy', '#A78BFA', 30)
  ON CONFLICT (workspace_id, category_key) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_calendar_categories_for_workspace() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_calendar_categories_for_workspace() TO service_role;

DROP TRIGGER IF EXISTS workspaces_seed_calendar_categories ON public.workspaces;
CREATE TRIGGER workspaces_seed_calendar_categories
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_calendar_categories_for_workspace();


-- Phase 1 tenant integrity, entitlements, and authenticated write controls.
-- WaveOS Phase 1 backend security foundation.
--
-- This migration is deliberately additive. It preserves all existing read
-- policies and the public-WaveOS/Dream-Wave-client split, while making tenant
-- relationships and browser-authenticated mutations enforceable in Postgres.

-- ---------------------------------------------------------------------------
-- Fail closed if historical rows already violate same-workspace invariants.
-- No data is rewritten or deleted by this audit.
-- ---------------------------------------------------------------------------

DO $audit$
DECLARE
  _mismatches bigint;
BEGIN
  SELECT count(*) INTO _mismatches
  FROM public.post_variants AS child
  JOIN public.content_items AS parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % post_variants rows reference another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.approvals AS child
  JOIN public.content_items AS parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % approvals rows reference another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.comments AS child
  JOIN public.content_items AS parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % comments rows reference another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.publish_attempts AS child
  JOIN public.content_items AS parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % publish_attempts rows reference another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.social_strategy_items AS child
  JOIN public.content_items AS parent ON parent.id = child.related_content_item_id
  WHERE child.related_content_item_id IS NOT NULL
    AND child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % social strategy rows reference content in another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.media_assets AS asset
  JOIN public.media_folders AS folder ON folder.id = asset.folder_id
  WHERE asset.folder_id IS NOT NULL
    AND asset.workspace_id <> folder.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % media assets reference folders in another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.media_folders AS child
  JOIN public.media_folders AS parent ON parent.id = child.parent_folder_id
  WHERE child.parent_folder_id IS NOT NULL
    AND child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % media folders reference parents in another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.content_items AS item
  WHERE EXISTS (
    SELECT 1
    FROM unnest(item.media_asset_ids) AS selected(asset_id)
    WHERE selected.asset_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.media_assets AS asset
         WHERE asset.id = selected.asset_id
           AND asset.workspace_id = item.workspace_id
       )
  );
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % content items contain missing or cross-workspace media references', _mismatches;
  END IF;
END;
$audit$;

-- ---------------------------------------------------------------------------
-- Composite tenant keys. Keeping workspace_id in each foreign key makes a
-- caller-supplied workspace identifier part of referential integrity rather
-- than merely an RLS input.
-- ---------------------------------------------------------------------------

DO $tenant_keys$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.content_items'::regclass
      AND conname = 'content_items_id_workspace_key'
  ) THEN
    ALTER TABLE public.content_items
      ADD CONSTRAINT content_items_id_workspace_key UNIQUE (id, workspace_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.media_folders'::regclass
      AND conname = 'media_folders_id_workspace_key'
  ) THEN
    ALTER TABLE public.media_folders
      ADD CONSTRAINT media_folders_id_workspace_key UNIQUE (id, workspace_id);
  END IF;
END;
$tenant_keys$;

DO $tenant_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.media_folders'::regclass
      AND conname = 'media_folders_parent_workspace_fkey'
  ) THEN
    ALTER TABLE public.media_folders DROP CONSTRAINT IF EXISTS media_folders_parent_folder_id_fkey;
    ALTER TABLE public.media_folders
      ADD CONSTRAINT media_folders_parent_workspace_fkey
    FOREIGN KEY (parent_folder_id, workspace_id)
    REFERENCES public.media_folders(id, workspace_id)
    ON DELETE CASCADE;
  END IF;
END;
$tenant_fk$;

DO $tenant_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.post_variants'::regclass
      AND conname = 'post_variants_content_workspace_fkey'
  ) THEN
    ALTER TABLE public.post_variants DROP CONSTRAINT IF EXISTS post_variants_content_item_id_fkey;
    ALTER TABLE public.post_variants
      ADD CONSTRAINT post_variants_content_workspace_fkey
    FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES public.content_items(id, workspace_id)
    ON DELETE CASCADE;
  END IF;
END;
$tenant_fk$;

DO $tenant_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.approvals'::regclass
      AND conname = 'approvals_content_workspace_fkey'
  ) THEN
    ALTER TABLE public.approvals DROP CONSTRAINT IF EXISTS approvals_content_item_id_fkey;
    ALTER TABLE public.approvals
      ADD CONSTRAINT approvals_content_workspace_fkey
    FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES public.content_items(id, workspace_id)
    ON DELETE CASCADE;
  END IF;
END;
$tenant_fk$;

DO $tenant_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.comments'::regclass
      AND conname = 'comments_content_workspace_fkey'
  ) THEN
    ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_content_item_id_fkey;
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_content_workspace_fkey
    FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES public.content_items(id, workspace_id)
    ON DELETE CASCADE;
  END IF;
END;
$tenant_fk$;

DO $tenant_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.publish_attempts'::regclass
      AND conname = 'publish_attempts_content_workspace_fkey'
  ) THEN
    ALTER TABLE public.publish_attempts DROP CONSTRAINT IF EXISTS publish_attempts_content_item_id_fkey;
    ALTER TABLE public.publish_attempts
      ADD CONSTRAINT publish_attempts_content_workspace_fkey
    FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES public.content_items(id, workspace_id)
    ON DELETE CASCADE;
  END IF;
END;
$tenant_fk$;

DO $tenant_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.social_strategy_items'::regclass
      AND conname = 'social_strategy_related_content_workspace_fkey'
  ) THEN
    ALTER TABLE public.social_strategy_items DROP CONSTRAINT IF EXISTS social_strategy_items_related_content_item_id_fkey;
    ALTER TABLE public.social_strategy_items
      ADD CONSTRAINT social_strategy_related_content_workspace_fkey
    FOREIGN KEY (related_content_item_id, workspace_id)
    REFERENCES public.content_items(id, workspace_id)
    ON DELETE SET NULL (related_content_item_id);
  END IF;
END;
$tenant_fk$;

DO $tenant_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.media_assets'::regclass
      AND conname = 'media_assets_folder_workspace_fkey'
  ) THEN
    ALTER TABLE public.media_assets DROP CONSTRAINT IF EXISTS media_assets_folder_id_fkey;
    ALTER TABLE public.media_assets
      ADD CONSTRAINT media_assets_folder_workspace_fkey
    FOREIGN KEY (folder_id, workspace_id)
    REFERENCES public.media_folders(id, workspace_id)
    ON DELETE SET NULL (folder_id);
  END IF;
END;
$tenant_fk$;

CREATE INDEX IF NOT EXISTS post_variants_workspace_content_idx
  ON public.post_variants(workspace_id, content_item_id);
CREATE INDEX IF NOT EXISTS approvals_workspace_content_idx
  ON public.approvals(workspace_id, content_item_id);
CREATE INDEX IF NOT EXISTS comments_workspace_content_idx
  ON public.comments(workspace_id, content_item_id);
CREATE INDEX IF NOT EXISTS publish_attempts_workspace_content_idx
  ON public.publish_attempts(workspace_id, content_item_id);
CREATE INDEX IF NOT EXISTS social_strategy_related_content_workspace_idx
  ON public.social_strategy_items(workspace_id, related_content_item_id)
  WHERE related_content_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_assets_workspace_folder_idx
  ON public.media_assets(workspace_id, folder_id)
  WHERE folder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_folders_workspace_parent_idx
  ON public.media_folders(workspace_id, parent_folder_id)
  WHERE parent_folder_id IS NOT NULL;

-- UUID arrays cannot use a native foreign key. Validate every content write,
-- remove references transactionally when an asset is deleted, and prevent a
-- referenced asset from being moved to another tenant.
CREATE OR REPLACE FUNCTION public.validate_content_media_asset_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(NEW.media_asset_ids, '{}'::uuid[])) AS selected(asset_id)
    WHERE selected.asset_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.media_assets AS asset
         WHERE asset.id = selected.asset_id
           AND asset.workspace_id = NEW.workspace_id
       )
  ) THEN
    RAISE EXCEPTION 'content_media_asset_workspace_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_media_asset_tenant_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     AND EXISTS (
       SELECT 1
       FROM public.content_items AS item
       WHERE item.media_asset_ids @> ARRAY[OLD.id]::uuid[]
     ) THEN
    RAISE EXCEPTION 'referenced_media_asset_workspace_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_deleted_media_asset_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.content_items
  SET media_asset_ids = array_remove(media_asset_ids, OLD.id)
  WHERE workspace_id = OLD.workspace_id
    AND media_asset_ids @> ARRAY[OLD.id]::uuid[];
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_content_media_asset_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_media_asset_tenant_references() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_deleted_media_asset_references() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS content_items_validate_media_assets ON public.content_items;
CREATE TRIGGER content_items_validate_media_assets
  BEFORE INSERT OR UPDATE OF workspace_id, media_asset_ids ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_content_media_asset_ids();

DROP TRIGGER IF EXISTS media_assets_guard_tenant_move ON public.media_assets;
CREATE TRIGGER media_assets_guard_tenant_move
  BEFORE UPDATE OF workspace_id ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.guard_media_asset_tenant_references();

DROP TRIGGER IF EXISTS media_assets_remove_content_references ON public.media_assets;
CREATE TRIGGER media_assets_remove_content_references
  AFTER DELETE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_media_asset_references();

-- ---------------------------------------------------------------------------
-- Entitlements. Public subscriptions remain OS-only. DWM feature overrides
-- still win, and inactive/expired workspace behavior remains unchanged.
-- ---------------------------------------------------------------------------

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
  _social_status text;
BEGIN
  SELECT access_tier, account_status, access_expires_at, feature_overrides, data_source
    INTO _tier, _status, _expires, _overrides, _data_source
    FROM public.workspaces
    WHERE id = _workspace_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF _data_source = 'os_data' THEN
    SELECT plan, status INTO _social_plan, _social_status
    FROM public.workspace_social_subscriptions
    WHERE workspace_id = _workspace_id;

    IF NOT public.social_subscription_is_active(_workspace_id) THEN RETURN false; END IF;

    IF _feature = 'can_view_analytics_checkup' THEN RETURN true; END IF;
    IF _feature IN ('can_use_ai_tools', 'can_schedule_content') THEN
      RETURN _social_status = 'trialing' OR _social_plan IN ('full', 'expanded');
    END IF;
    IF _feature IN (
      'can_use_creative_studio', 'can_use_campaign_manager',
      'can_use_competitive_intelligence'
    ) THEN
      RETURN _social_plan IN ('full', 'expanded');
    END IF;
    IF _feature = 'can_invite_members' THEN
      RETURN _social_plan = 'expanded';
    END IF;
    RETURN _feature IN (
      'can_view_profile', 'can_edit_profile', 'can_manage_brand_voice',
      'can_view_calendar_preview', 'can_view_media_library', 'can_upload_media',
      'can_create_content', 'can_connect_socials', 'can_publish_content',
      'can_view_analytics', 'can_view_activity_log', 'can_manage_workspace'
    );
  END IF;

  _override_val := _overrides -> _feature;
  IF _override_val IS NOT NULL
     AND pg_catalog.jsonb_typeof(_override_val) = 'boolean' THEN
    RETURN (_override_val)::text::boolean;
  END IF;

  -- The Phase 1 checkup is additive for every active DWM client workspace,
  -- including project and wedding workspaces, without granting full analytics.
  IF _feature = 'can_view_analytics_checkup' THEN
    RETURN _status = 'active' AND (_expires IS NULL OR _expires >= now());
  END IF;

  -- Preserve the existing locked wedding-client access contract exactly.
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

  IF _feature IN (
    'can_use_creative_studio', 'can_use_campaign_manager',
    'can_use_competitive_intelligence'
  ) THEN
    RETURN _tier::text IN ('retainer_full', 'social_management')
      OR coalesce(_overrides -> 'social_management_access' = 'true'::jsonb, false);
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

CREATE OR REPLACE FUNCTION public.can_access_workspace_feature(
  _workspace_id uuid,
  _feature text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.can_staff_manage_workspace(auth.uid(), _workspace_id)
      OR (
        public.is_workspace_member(auth.uid(), _workspace_id)
        AND public.has_feature(_workspace_id, _feature)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace_feature(
  _workspace_id uuid,
  _feature text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.can_staff_manage_workspace(auth.uid(), _workspace_id)
      OR (
        public.has_feature(_workspace_id, _feature)
        AND coalesce(public.workspace_role(auth.uid(), _workspace_id)::text, '')
          IN ('owner', 'admin', 'editor')
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.can_access_workspace_feature(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_workspace_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_workspace_feature(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace_feature(uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Authenticated content/media writes. Existing SELECT policies are retained.
-- Service-role integrations continue to bypass RLS.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "members write content" ON public.content_items;
DROP POLICY IF EXISTS "members update content" ON public.content_items;
DROP POLICY IF EXISTS "members delete content" ON public.content_items;

DROP POLICY IF EXISTS "authorized authors create content" ON public.content_items;
CREATE POLICY "authorized authors create content"
  ON public.content_items FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_workspace_feature(workspace_id, 'can_create_content')
    AND created_by = (SELECT auth.uid())
    AND status = 'draft'
  );

DROP POLICY IF EXISTS "authorized authors update content" ON public.content_items;
CREATE POLICY "authorized authors update content"
  ON public.content_items FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_create_content'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_create_content'));

DROP POLICY IF EXISTS "authorized authors delete content" ON public.content_items;
CREATE POLICY "authorized authors delete content"
  ON public.content_items FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_create_content'));

DROP POLICY IF EXISTS "members access variants" ON public.post_variants;

DROP POLICY IF EXISTS "members read variants" ON public.post_variants;
CREATE POLICY "members read variants"
  ON public.post_variants FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.is_dream_wave_staff((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "authorized authors create variants" ON public.post_variants;
CREATE POLICY "authorized authors create variants"
  ON public.post_variants FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_create_content'));

DROP POLICY IF EXISTS "authorized authors update variants" ON public.post_variants;
CREATE POLICY "authorized authors update variants"
  ON public.post_variants FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_create_content'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_create_content'));

DROP POLICY IF EXISTS "authorized authors delete variants" ON public.post_variants;
CREATE POLICY "authorized authors delete variants"
  ON public.post_variants FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_create_content'));

DROP POLICY IF EXISTS "workspace members insert folders" ON public.media_folders;
DROP POLICY IF EXISTS "workspace members update folders" ON public.media_folders;
DROP POLICY IF EXISTS "workspace members delete folders" ON public.media_folders;

DROP POLICY IF EXISTS "authorized media editors create folders" ON public.media_folders;
CREATE POLICY "authorized media editors create folders"
  ON public.media_folders FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

DROP POLICY IF EXISTS "authorized media editors update folders" ON public.media_folders;
CREATE POLICY "authorized media editors update folders"
  ON public.media_folders FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

DROP POLICY IF EXISTS "authorized media editors delete folders" ON public.media_folders;
CREATE POLICY "authorized media editors delete folders"
  ON public.media_folders FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

DROP POLICY IF EXISTS "workspace members insert assets" ON public.media_assets;
DROP POLICY IF EXISTS "workspace members update assets" ON public.media_assets;
DROP POLICY IF EXISTS "workspace members delete assets" ON public.media_assets;

DROP POLICY IF EXISTS "authorized media editors create assets" ON public.media_assets;
CREATE POLICY "authorized media editors create assets"
  ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

DROP POLICY IF EXISTS "authorized media editors update assets" ON public.media_assets;
CREATE POLICY "authorized media editors update assets"
  ON public.media_assets FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

DROP POLICY IF EXISTS "authorized media editors delete assets" ON public.media_assets;
CREATE POLICY "authorized media editors delete assets"
  ON public.media_assets FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

-- Storage writes must match the database-table authorization. A CASE protects
-- the UUID cast from malformed object keys.
DROP POLICY IF EXISTS "media: workspace members upload" ON storage.objects;
DROP POLICY IF EXISTS "media: workspace members update" ON storage.objects;
DROP POLICY IF EXISTS "media: workspace members delete" ON storage.objects;

DROP POLICY IF EXISTS "media: authorized editors upload" ON storage.objects;
CREATE POLICY "media: authorized editors upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND public.can_manage_workspace_feature(
      CASE
        WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN split_part(name, '/', 1)::uuid
        ELSE NULL
      END,
      'can_upload_media'
    )
  );

DROP POLICY IF EXISTS "media: authorized editors update" ON storage.objects;
CREATE POLICY "media: authorized editors update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'media'
    AND public.can_manage_workspace_feature(
      CASE
        WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN split_part(name, '/', 1)::uuid
        ELSE NULL
      END,
      'can_upload_media'
    )
  )
  WITH CHECK (
    bucket_id = 'media'
    AND public.can_manage_workspace_feature(
      CASE
        WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN split_part(name, '/', 1)::uuid
        ELSE NULL
      END,
      'can_upload_media'
    )
  );

DROP POLICY IF EXISTS "media: authorized editors delete" ON storage.objects;
CREATE POLICY "media: authorized editors delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'media'
    AND public.can_manage_workspace_feature(
      CASE
        WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN split_part(name, '/', 1)::uuid
        ELSE NULL
      END,
      'can_upload_media'
    )
  );

-- Status transitions are enforced even when a caller attempts to bypass the
-- application and update content_items through PostgREST directly.
CREATE OR REPLACE FUNCTION public.enforce_content_item_write_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _approval_required boolean;
  _data_source text;
  _role public.workspace_member_role;
BEGIN
  -- Webhooks and vetted server integrations use service_role and have no JWT
  -- subject. Their existing operational paths are not changed here.
  IF _uid IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'content_must_begin_as_draft' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'content_workspace_is_immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('publishing', 'published', 'archived')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal_content_status_is_immutable' USING ERRCODE = '42501';
  END IF;

  -- Only the service-role publisher may claim work or record a provider
  -- success. Browser-authenticated callers must use the approval/scheduling
  -- RPCs and can never manufacture terminal publishing state directly.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('publishing', 'published') THEN
    RAISE EXCEPTION 'publisher_service_role_required' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'scheduled'
     AND (NEW.scheduled_at IS NULL OR NEW.scheduled_at <= now()) THEN
    RAISE EXCEPTION 'schedule_time_must_be_future' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'approved' AND NEW.scheduled_at IS NOT NULL THEN
    RAISE EXCEPTION 'approved_content_cannot_have_schedule_time' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('approved', 'scheduled')
     AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION 'content_approval_attribution_required' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved', 'scheduled') THEN
    IF NEW.approved_by IS DISTINCT FROM _uid THEN
      RAISE EXCEPTION 'content_approval_actor_mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT approval_required, data_source
      INTO _approval_required, _data_source
      FROM public.workspaces
      WHERE id = NEW.workspace_id;
    _role := public.workspace_role(_uid, NEW.workspace_id);
    IF _data_source <> 'os_data'
       AND _approval_required
       AND NOT public.can_staff_manage_workspace(_uid, NEW.workspace_id)
       AND coalesce(_role::text, '') NOT IN ('owner', 'admin', 'approver') THEN
      RAISE EXCEPTION 'content_approval_required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'scheduled'
     AND NOT (
       public.has_feature(NEW.workspace_id, 'can_publish_content')
       AND public.has_feature(NEW.workspace_id, 'can_schedule_content')
       OR public.can_staff_manage_workspace(_uid, NEW.workspace_id)
     ) THEN
    RAISE EXCEPTION 'scheduling_not_included' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = 'approved'
     AND NOT (
       public.has_feature(NEW.workspace_id, 'can_publish_content')
       OR public.can_staff_manage_workspace(_uid, NEW.workspace_id)
     ) THEN
    RAISE EXCEPTION 'publishing_not_included' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_content_item_write_rules() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS content_items_enforce_authenticated_writes ON public.content_items;
CREATE TRIGGER content_items_enforce_authenticated_writes
  BEFORE INSERT OR UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_content_item_write_rules();

-- Keep the established approval workflow, but add plan checks at its database
-- boundary so MCP or direct RPC callers cannot bypass entitlements.
CREATE OR REPLACE FUNCTION public.submit_content_for_approval(
  _content_id uuid,
  _requested_action text,
  _scheduled_at timestamptz DEFAULT NULL
)
RETURNS public.content_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _item public.content_items%ROWTYPE;
  _workspace public.workspaces%ROWTYPE;
  _role public.workspace_member_role;
  _next public.content_status;
  _staff_can_manage boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _requested_action NOT IN ('publish_now', 'schedule') THEN
    RAISE EXCEPTION 'invalid_requested_action';
  END IF;
  IF _requested_action = 'schedule'
     AND (_scheduled_at IS NULL OR _scheduled_at <= now()) THEN
    RAISE EXCEPTION 'schedule_time_must_be_future';
  END IF;

  SELECT * INTO _item
  FROM public.content_items
  WHERE id = _content_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'content_not_found'; END IF;

  SELECT * INTO _workspace
  FROM public.workspaces
  WHERE id = _item.workspace_id;

  _role := public.workspace_role(_uid, _item.workspace_id);
  _staff_can_manage := public.can_staff_manage_workspace(_uid, _item.workspace_id);
  IF NOT _staff_can_manage
     AND coalesce(_role::text, '') NOT IN ('owner', 'admin', 'editor', 'approver') THEN
    RAISE EXCEPTION 'not_allowed_to_submit';
  END IF;
  IF _item.status IN ('publishing', 'published', 'archived') THEN
    RAISE EXCEPTION 'content_cannot_be_submitted';
  END IF;
  IF NOT _staff_can_manage
     AND NOT public.has_feature(_item.workspace_id, 'can_publish_content') THEN
    RAISE EXCEPTION 'publishing_not_included';
  END IF;
  IF _requested_action = 'schedule'
     AND NOT _staff_can_manage
     AND NOT public.has_feature(_item.workspace_id, 'can_schedule_content') THEN
    RAISE EXCEPTION 'scheduling_not_included';
  END IF;

  -- Public WaveOS workspaces are self-service. Client workspaces retain their
  -- configurable approval workflow, including the staff/direct-release path.
  IF _workspace.data_source = 'os_data'
     OR NOT _workspace.approval_required
     OR _item.workspace_id = '11111111-1111-1111-1111-111111111111'::uuid THEN
    _next := CASE WHEN _requested_action = 'schedule'
      THEN 'scheduled'::public.content_status
      ELSE 'approved'::public.content_status END;
    UPDATE public.content_items
    SET status = _next,
        scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
        approved_by = _uid,
        approved_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'approval_request', jsonb_build_object(
            'action', _requested_action,
            'submitted_by', _uid,
            'submitted_at', now(),
            'automatically_approved', true
          )
        )
    WHERE id = _item.id;
    RETURN _next;
  END IF;

  INSERT INTO public.approvals (content_item_id, workspace_id, decision, note)
  VALUES (
    _item.id,
    _item.workspace_id,
    'pending',
    CASE WHEN _requested_action = 'schedule'
      THEN 'Requested schedule: ' || _scheduled_at::text
      ELSE 'Requested immediate publishing' END
  );

  UPDATE public.content_items
  SET status = 'in_review',
      scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
      approved_by = NULL,
      approved_at = NULL,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'approval_request', jsonb_build_object(
          'action', _requested_action,
          'submitted_by', _uid,
          'submitted_at', now()
        )
      )
  WHERE id = _item.id;

  INSERT INTO public.notifications (user_id, workspace_id, kind, title, body, link)
  SELECT members.user_id,
         _item.workspace_id,
         'content_submitted',
         'Content ready for approval',
         coalesce(_item.title, 'Untitled post'),
         '/approvals'
  FROM public.workspace_members AS members
  WHERE members.workspace_id = _item.workspace_id
    AND members.role::text IN ('owner', 'admin', 'approver')
    AND members.user_id <> _uid;

  RETURN 'in_review'::public.content_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_content_for_approval(uuid, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_content_for_approval(uuid, text, timestamptz)
  TO authenticated, service_role;




-- Phase 1 durable product foundations. Production has none of these tables;
-- IF NOT EXISTS and replaceable policies/triggers make a reviewed retry safe.
-- WaveOS Phase 1 durable foundations.
-- User-facing tables are explicitly opted into the Data API, have RLS enabled,
-- and use either per-user ownership or workspace feature authorization.

-- ---------------------------------------------------------------------------
-- Product releases / What's New
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE
    CHECK (char_length(btrim(version)) BETWEEN 1 AND 40),
  title text NOT NULL
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  summary text NOT NULL
    CHECK (char_length(btrim(summary)) BETWEEN 1 AND 500),
  body text NOT NULL DEFAULT ''
    CHECK (char_length(body) <= 20000),
  published_at timestamptz,
  target_data_sources text[] NOT NULL DEFAULT '{}'
    CHECK (target_data_sources <@ ARRAY['client_data', 'os_data']::text[]),
  target_public_plans text[] NOT NULL DEFAULT '{}'
    CHECK (target_public_plans <@ ARRAY['trial', 'standard', 'full', 'expanded']::text[]),
  target_client_tiers text[] NOT NULL DEFAULT '{}'
    CHECK (target_client_tiers <@ ARRAY[
      'project_client', 'growth_90', 'retainer_full',
      'social_management', 'wedding_client'
    ]::text[]),
  target_workspace_roles text[] NOT NULL DEFAULT '{}'
    CHECK (target_workspace_roles <@ ARRAY['owner', 'admin', 'editor', 'approver', 'viewer']::text[]),
  link_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (link_url IS NULL OR link_url ~ '^https://')
);

CREATE TABLE IF NOT EXISTS public.release_user_states (
  release_id uuid NOT NULL REFERENCES public.product_releases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  viewed_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.release_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  auto_show_releases boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_releases_published_idx
  ON public.product_releases(published_at DESC)
  WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS release_user_states_user_idx
  ON public.release_user_states(user_id, acknowledged_at, dismissed_at);

-- ---------------------------------------------------------------------------
-- Reusable, per-user workflow drafts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workflow_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  workflow_key text NOT NULL
    CHECK (workflow_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object')
    CHECK (octet_length(payload::text) <= 262144),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_drafts_identity_key
  ON public.workflow_drafts(
    workspace_id,
    user_id,
    workflow_key,
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX IF NOT EXISTS workflow_drafts_user_updated_idx
  ON public.workflow_drafts(user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Historical social intelligence with explicit provenance and availability.
-- These records are provider/server maintained; authenticated UI users read
-- them through RLS without receiving mutation access.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_intelligence_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'zernio'
    CHECK (provider ~ '^[a-z][a-z0-9_-]{1,39}$'),
  sync_state text NOT NULL DEFAULT 'not_synced'
    CHECK (sync_state IN (
      'not_synced', 'syncing', 'available', 'partial',
      'permission_missing', 'connection_expired', 'sync_failed', 'unsupported'
    )),
  analyzed_sources text[] NOT NULL DEFAULT '{}',
  requested_range_start date,
  requested_range_end date,
  available_range_start date,
  available_range_end date,
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  safe_error_code text,
  safe_error_message text CHECK (char_length(safe_error_message) <= 500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object')
    CHECK (octet_length(metadata::text) <= 131072),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id),
  CHECK (requested_range_end IS NULL OR requested_range_start IS NULL OR requested_range_end >= requested_range_start),
  CHECK (available_range_end IS NULL OR available_range_start IS NULL OR available_range_end >= available_range_start)
);

CREATE TABLE IF NOT EXISTS public.social_intelligence_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  metric_key text NOT NULL
    CHECK (metric_key ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  provider text NOT NULL DEFAULT 'zernio'
    CHECK (provider ~ '^[a-z][a-z0-9_-]{1,39}$'),
  availability text NOT NULL
    CHECK (availability IN (
      'available', 'true_zero', 'not_synced', 'permission_missing',
      'connection_expired', 'sync_failed', 'unsupported'
    )),
  value numeric,
  unit text,
  range_start date,
  range_end date,
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  captured_at timestamptz NOT NULL DEFAULT now(),
  source_reference text,
  calculation_version text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object')
    CHECK (octet_length(evidence::text) <= 131072),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_intelligence_snapshot_profile_workspace_fkey
    FOREIGN KEY (profile_id, workspace_id)
    REFERENCES public.social_intelligence_profiles(id, workspace_id)
    ON DELETE CASCADE,
  CHECK (range_end IS NULL OR range_start IS NULL OR range_end >= range_start),
  CHECK (
    (availability = 'available' AND value IS NOT NULL AND value <> 0)
    OR (availability = 'true_zero' AND value = 0)
    OR (availability NOT IN ('available', 'true_zero') AND value IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS social_intelligence_snapshots_workspace_metric_idx
  ON public.social_intelligence_snapshots(workspace_id, metric_key, captured_at DESC);
CREATE INDEX IF NOT EXISTS social_intelligence_snapshots_profile_range_idx
  ON public.social_intelligence_snapshots(profile_id, range_start, range_end);

-- ---------------------------------------------------------------------------
-- Creative Studio
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.creative_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 180),
  format text NOT NULL CHECK (format ~ '^[a-z][a-z0-9_-]{1,59}$'),
  document jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(document) = 'object')
    CHECK (octet_length(document::text) <= 1048576),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creative_designs_workspace_updated_idx
  ON public.creative_designs(workspace_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Campaign Manager. Advanced campaign plans are separate from the existing
-- Ripple-visible social_strategy_items planner.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.campaign_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 180),
  goal text NOT NULL DEFAULT '' CHECK (char_length(goal) <= 2000),
  start_date date NOT NULL,
  end_date date NOT NULL,
  platforms text[] NOT NULL DEFAULT '{}',
  max_posts integer NOT NULL DEFAULT 12 CHECK (max_posts BETWEEN 1 AND 500),
  posting_hours text[] NOT NULL DEFAULT '{}',
  excluded_days text[] NOT NULL DEFAULT '{}'
    CHECK (excluded_days <@ ARRAY[
      'monday', 'tuesday', 'wednesday', 'thursday',
      'friday', 'saturday', 'sunday'
    ]::text[]),
  approval_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'scheduled', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.campaign_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_plan_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  planned_date date,
  planned_time time,
  platform text,
  content_pillar text CHECK (char_length(content_pillar) <= 160),
  working_title text CHECK (char_length(working_title) <= 240),
  copy_brief text CHECK (char_length(copy_brief) <= 10000),
  approval_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'scheduled', 'skipped', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_plan_items_plan_workspace_fkey
    FOREIGN KEY (campaign_plan_id, workspace_id)
    REFERENCES public.campaign_plans(id, workspace_id)
    ON DELETE CASCADE,
  UNIQUE (campaign_plan_id, position)
);

CREATE INDEX IF NOT EXISTS campaign_plans_workspace_dates_idx
  ON public.campaign_plans(workspace_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS campaign_plan_items_workspace_date_idx
  ON public.campaign_plan_items(workspace_id, planned_date, position);

-- ---------------------------------------------------------------------------
-- Competitive Intelligence. Reports store transparent WaveOS-defined inputs
-- and methodology; no external scraping source is implied by these tables.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 180),
  website_url text,
  social_handles jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(social_handles) = 'object')
    CHECK (octet_length(social_handles::text) <= 32768),
  notes text CHECK (char_length(notes) <= 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id),
  CHECK (website_url IS NULL OR website_url ~ '^https://')
);

CREATE TABLE IF NOT EXISTS public.competitive_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  metrics jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(metrics) = 'array')
    CHECK (octet_length(metrics::text) <= 262144),
  score numeric CHECK (score BETWEEN 0 AND 100),
  confidence numeric CHECK (confidence BETWEEN 0 AND 1),
  methodology text NOT NULL DEFAULT 'WaveOS-defined'
    CHECK (char_length(btrim(methodology)) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competitive_reports_competitor_workspace_fkey
    FOREIGN KEY (competitor_id, workspace_id)
    REFERENCES public.competitors(id, workspace_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS competitors_workspace_name_idx
  ON public.competitors(workspace_id, name);
CREATE INDEX IF NOT EXISTS competitive_reports_workspace_created_idx
  ON public.competitive_reports(workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS product_releases_updated_at ON public.product_releases;
CREATE TRIGGER product_releases_updated_at
  BEFORE UPDATE ON public.product_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS release_user_states_updated_at ON public.release_user_states;
CREATE TRIGGER release_user_states_updated_at
  BEFORE UPDATE ON public.release_user_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS release_preferences_updated_at ON public.release_preferences;
CREATE TRIGGER release_preferences_updated_at
  BEFORE UPDATE ON public.release_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS workflow_drafts_updated_at ON public.workflow_drafts;
CREATE TRIGGER workflow_drafts_updated_at
  BEFORE UPDATE ON public.workflow_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS social_intelligence_profiles_updated_at ON public.social_intelligence_profiles;
CREATE TRIGGER social_intelligence_profiles_updated_at
  BEFORE UPDATE ON public.social_intelligence_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS creative_designs_updated_at ON public.creative_designs;
CREATE TRIGGER creative_designs_updated_at
  BEFORE UPDATE ON public.creative_designs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS campaign_plans_updated_at ON public.campaign_plans;
CREATE TRIGGER campaign_plans_updated_at
  BEFORE UPDATE ON public.campaign_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS campaign_plan_items_updated_at ON public.campaign_plan_items;
CREATE TRIGGER campaign_plan_items_updated_at
  BEFORE UPDATE ON public.campaign_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS competitors_updated_at ON public.competitors;
CREATE TRIGGER competitors_updated_at
  BEFORE UPDATE ON public.competitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS competitive_reports_updated_at ON public.competitive_reports;
CREATE TRIGGER competitive_reports_updated_at
  BEFORE UPDATE ON public.competitive_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Data API grants and RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.product_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_user_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_intelligence_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_intelligence_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitive_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.product_releases,
  public.release_user_states,
  public.release_preferences,
  public.workflow_drafts,
  public.social_intelligence_profiles,
  public.social_intelligence_snapshots,
  public.creative_designs,
  public.campaign_plans,
  public.campaign_plan_items,
  public.competitors,
  public.competitive_reports
FROM PUBLIC, anon;

REVOKE ALL ON TABLE
  public.product_releases,
  public.release_user_states,
  public.release_preferences,
  public.workflow_drafts,
  public.social_intelligence_profiles,
  public.social_intelligence_snapshots,
  public.creative_designs,
  public.campaign_plans,
  public.campaign_plan_items,
  public.competitors,
  public.competitive_reports
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_releases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.release_user_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.release_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_drafts TO authenticated;
GRANT SELECT ON public.social_intelligence_profiles TO authenticated;
GRANT SELECT ON public.social_intelligence_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_designs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_plan_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitive_reports TO authenticated;

GRANT ALL ON TABLE
  public.product_releases,
  public.release_user_states,
  public.release_preferences,
  public.workflow_drafts,
  public.social_intelligence_profiles,
  public.social_intelligence_snapshots,
  public.creative_designs,
  public.campaign_plans,
  public.campaign_plan_items,
  public.competitors,
  public.competitive_reports
TO service_role;

-- Release authorship is owner-only; published release visibility is targeted
-- against at least one workspace the user belongs to. Empty target arrays mean
-- all values in that dimension.
DROP POLICY IF EXISTS "applicable releases are visible" ON public.product_releases;
CREATE POLICY "applicable releases are visible"
  ON public.product_releases FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      published_at IS NOT NULL
      AND published_at <= now()
      AND (
        public.is_dream_wave_staff((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.workspace_members AS membership
          JOIN public.workspaces AS workspace
            ON workspace.id = membership.workspace_id
          LEFT JOIN public.workspace_social_subscriptions AS subscription
            ON subscription.workspace_id = workspace.id
          WHERE membership.user_id = (SELECT auth.uid())
            AND (
              cardinality(product_releases.target_data_sources) = 0
              OR workspace.data_source = ANY(product_releases.target_data_sources)
            )
            AND (
              workspace.data_source <> 'os_data'
              OR cardinality(product_releases.target_public_plans) = 0
              OR subscription.plan = ANY(product_releases.target_public_plans)
            )
            AND (
              workspace.data_source = 'os_data'
              OR cardinality(product_releases.target_client_tiers) = 0
              OR workspace.access_tier::text = ANY(product_releases.target_client_tiers)
            )
            AND (
              cardinality(product_releases.target_workspace_roles) = 0
              OR membership.role::text = ANY(product_releases.target_workspace_roles)
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS "owners create releases" ON public.product_releases;
CREATE POLICY "owners create releases"
  ON public.product_releases FOR INSERT TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));
DROP POLICY IF EXISTS "owners update releases" ON public.product_releases;
CREATE POLICY "owners update releases"
  ON public.product_releases FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));
DROP POLICY IF EXISTS "owners delete releases" ON public.product_releases;
CREATE POLICY "owners delete releases"
  ON public.product_releases FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

DROP POLICY IF EXISTS "users read own release state" ON public.release_user_states;
CREATE POLICY "users read own release state"
  ON public.release_user_states FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "users create own applicable release state" ON public.release_user_states;
CREATE POLICY "users create own applicable release state"
  ON public.release_user_states FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.product_releases AS release
      WHERE release.id = release_user_states.release_id
    )
  );
DROP POLICY IF EXISTS "users update own release state" ON public.release_user_states;
CREATE POLICY "users update own release state"
  ON public.release_user_states FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "users delete own release state" ON public.release_user_states;
CREATE POLICY "users delete own release state"
  ON public.release_user_states FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users read own release preferences" ON public.release_preferences;
CREATE POLICY "users read own release preferences"
  ON public.release_preferences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "users create own release preferences" ON public.release_preferences;
CREATE POLICY "users create own release preferences"
  ON public.release_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "users update own release preferences" ON public.release_preferences;
CREATE POLICY "users update own release preferences"
  ON public.release_preferences FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "users delete own release preferences" ON public.release_preferences;
CREATE POLICY "users delete own release preferences"
  ON public.release_preferences FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users read own workflow drafts" ON public.workflow_drafts;
CREATE POLICY "users read own workflow drafts"
  ON public.workflow_drafts FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    )
  );
DROP POLICY IF EXISTS "users create own workflow drafts" ON public.workflow_drafts;
CREATE POLICY "users create own workflow drafts"
  ON public.workflow_drafts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    )
  );
DROP POLICY IF EXISTS "users update own workflow drafts" ON public.workflow_drafts;
CREATE POLICY "users update own workflow drafts"
  ON public.workflow_drafts FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    )
  );
DROP POLICY IF EXISTS "users delete own workflow drafts" ON public.workflow_drafts;
CREATE POLICY "users delete own workflow drafts"
  ON public.workflow_drafts FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    )
  );

DROP POLICY IF EXISTS "authorized workspaces read intelligence profiles" ON public.social_intelligence_profiles;
CREATE POLICY "authorized workspaces read intelligence profiles"
  ON public.social_intelligence_profiles FOR SELECT TO authenticated
  USING (public.can_access_workspace_feature(workspace_id, 'can_view_analytics_checkup'));
DROP POLICY IF EXISTS "authorized workspaces read intelligence snapshots" ON public.social_intelligence_snapshots;
CREATE POLICY "authorized workspaces read intelligence snapshots"
  ON public.social_intelligence_snapshots FOR SELECT TO authenticated
  USING (public.can_access_workspace_feature(workspace_id, 'can_view_analytics_checkup'));

DROP POLICY IF EXISTS "authorized workspaces read creative designs" ON public.creative_designs;
CREATE POLICY "authorized workspaces read creative designs"
  ON public.creative_designs FOR SELECT TO authenticated
  USING (public.can_access_workspace_feature(workspace_id, 'can_use_creative_studio'));
DROP POLICY IF EXISTS "creative editors create designs" ON public.creative_designs;
CREATE POLICY "creative editors create designs"
  ON public.creative_designs FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.can_manage_workspace_feature(workspace_id, 'can_use_creative_studio')
  );
DROP POLICY IF EXISTS "creative editors update designs" ON public.creative_designs;
CREATE POLICY "creative editors update designs"
  ON public.creative_designs FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_use_creative_studio'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_use_creative_studio'));
DROP POLICY IF EXISTS "creative editors delete designs" ON public.creative_designs;
CREATE POLICY "creative editors delete designs"
  ON public.creative_designs FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_use_creative_studio'));

DROP POLICY IF EXISTS "authorized workspaces read campaign plans" ON public.campaign_plans;
CREATE POLICY "authorized workspaces read campaign plans"
  ON public.campaign_plans FOR SELECT TO authenticated
  USING (public.can_access_workspace_feature(workspace_id, 'can_use_campaign_manager'));
DROP POLICY IF EXISTS "campaign editors create plans" ON public.campaign_plans;
CREATE POLICY "campaign editors create plans"
  ON public.campaign_plans FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.can_manage_workspace_feature(workspace_id, 'can_use_campaign_manager')
  );
DROP POLICY IF EXISTS "campaign editors update plans" ON public.campaign_plans;
CREATE POLICY "campaign editors update plans"
  ON public.campaign_plans FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_use_campaign_manager'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_use_campaign_manager'));
DROP POLICY IF EXISTS "campaign editors delete plans" ON public.campaign_plans;
CREATE POLICY "campaign editors delete plans"
  ON public.campaign_plans FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_use_campaign_manager'));

DROP POLICY IF EXISTS "authorized workspaces read campaign items" ON public.campaign_plan_items;
CREATE POLICY "authorized workspaces read campaign items"
  ON public.campaign_plan_items FOR SELECT TO authenticated
  USING (public.can_access_workspace_feature(workspace_id, 'can_use_campaign_manager'));
DROP POLICY IF EXISTS "campaign editors create items" ON public.campaign_plan_items;
CREATE POLICY "campaign editors create items"
  ON public.campaign_plan_items FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_use_campaign_manager'));
DROP POLICY IF EXISTS "campaign editors update items" ON public.campaign_plan_items;
CREATE POLICY "campaign editors update items"
  ON public.campaign_plan_items FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_use_campaign_manager'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_use_campaign_manager'));
DROP POLICY IF EXISTS "campaign editors delete items" ON public.campaign_plan_items;
CREATE POLICY "campaign editors delete items"
  ON public.campaign_plan_items FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_use_campaign_manager'));

DROP POLICY IF EXISTS "authorized workspaces read competitors" ON public.competitors;
CREATE POLICY "authorized workspaces read competitors"
  ON public.competitors FOR SELECT TO authenticated
  USING (public.can_access_workspace_feature(workspace_id, 'can_use_competitive_intelligence'));
DROP POLICY IF EXISTS "competitive editors create competitors" ON public.competitors;
CREATE POLICY "competitive editors create competitors"
  ON public.competitors FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.can_manage_workspace_feature(workspace_id, 'can_use_competitive_intelligence')
  );
DROP POLICY IF EXISTS "competitive editors update competitors" ON public.competitors;
CREATE POLICY "competitive editors update competitors"
  ON public.competitors FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_use_competitive_intelligence'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_use_competitive_intelligence'));
DROP POLICY IF EXISTS "competitive editors delete competitors" ON public.competitors;
CREATE POLICY "competitive editors delete competitors"
  ON public.competitors FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_use_competitive_intelligence'));

DROP POLICY IF EXISTS "authorized workspaces read competitive reports" ON public.competitive_reports;
CREATE POLICY "authorized workspaces read competitive reports"
  ON public.competitive_reports FOR SELECT TO authenticated
  USING (public.can_access_workspace_feature(workspace_id, 'can_use_competitive_intelligence'));
DROP POLICY IF EXISTS "competitive editors create reports" ON public.competitive_reports;
CREATE POLICY "competitive editors create reports"
  ON public.competitive_reports FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.can_manage_workspace_feature(workspace_id, 'can_use_competitive_intelligence')
  );
DROP POLICY IF EXISTS "competitive editors update reports" ON public.competitive_reports;
CREATE POLICY "competitive editors update reports"
  ON public.competitive_reports FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_use_competitive_intelligence'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_use_competitive_intelligence'));
DROP POLICY IF EXISTS "competitive editors delete reports" ON public.competitive_reports;
CREATE POLICY "competitive editors delete reports"
  ON public.competitive_reports FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_use_competitive_intelligence'));




-- Mac handoff AI telemetry and campaign optimization, included here because
-- the earlier historical migration is intentionally not replayed.
-- Additive Mac handoff foundations. Existing campaign rows retain the
-- conservative approval-required behavior and no billing/auth tables change.

ALTER TABLE public.campaign_plans
  ADD COLUMN IF NOT EXISTS optimization_mode text NOT NULL DEFAULT 'approval_required';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_plans_optimization_mode_check'
      AND conrelid = 'public.campaign_plans'::regclass
  ) THEN
    ALTER TABLE public.campaign_plans
      ADD CONSTRAINT campaign_plans_optimization_mode_check
      CHECK (optimization_mode IN ('automatic', 'approval_required'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text NOT NULL CHECK (feature ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_.-]{1,39}$'),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count = 1),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  estimated_cost_micros bigint CHECK (estimated_cost_micros IS NULL OR estimated_cost_micros >= 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status text NOT NULL CHECK (status IN ('succeeded', 'provider_error', 'invalid_response')),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_.-]{1,80}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_workspace_created_idx
  ON public.ai_usage_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_status_created_idx
  ON public.ai_usage_events(status, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_usage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ai_usage_events TO service_role;

COMMENT ON TABLE public.ai_usage_events IS
  'Server-only AI request telemetry. Contains usage totals and safe failure codes, never prompts, generated content, credentials, or provider payloads.';




NOTIFY pgrst, 'reload schema';
COMMIT;

