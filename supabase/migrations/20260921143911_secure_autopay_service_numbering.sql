-- Server-only invoice numbering for automatic monthly invoices. The existing
-- next_invoice_number RPC remains owner-only for interactive dashboard saves.
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

REVOKE ALL ON FUNCTION public.next_service_invoice_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_service_invoice_number(uuid) TO service_role;

-- Providers can deliver the same event concurrently. Serialize the claim in
-- the database so no historical webhook rows need to be deleted to add a
-- uniqueness constraint.
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

REVOKE ALL ON FUNCTION public.claim_webhook_event(
  text, text, text, jsonb, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_event(
  text, text, text, jsonb, timestamptz
) TO service_role;

-- Apply a successful automatic charge, its ledger entry, its invoice state,
-- its delivery holds, and its next schedule state in one database transaction.
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

REVOKE ALL ON FUNCTION public.record_autopay_payment(
  uuid, uuid, text, integer, text, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_autopay_payment(
  uuid, uuid, text, integer, text, timestamptz, timestamptz
) TO service_role;

-- Later SECURITY DEFINER helpers were added after the original privilege
-- hardening migration. Keep them callable only by signed-in users and the
-- backend, never through PostgreSQL's implicit PUBLIC execute grant.
REVOKE ALL ON FUNCTION public.create_brand_workspace(
  text, text, text, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_brand_workspace(
  text, text, text, text, text, text, text, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_staff_manage_workspace(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_staff_manage_workspace(uuid, uuid) TO authenticated, service_role;
