-- Apply before deploying the payment progress UI.
-- Extends the existing table; existing workspace RLS policies remain in force.
BEGIN;
ALTER TABLE public.client_invoices
  ADD COLUMN amount_paid_cents bigint,
  ADD COLUMN payment_plan text NOT NULL DEFAULT 'one_time',
  ADD COLUMN billing_month date,
  ADD CONSTRAINT invoice_payment_plan_valid CHECK (payment_plan IN ('one_time', 'deposit_balance', 'installments', 'monthly_retainer')),
  ADD CONSTRAINT invoice_received_valid CHECK (amount_paid_cents IS NULL OR (amount_cents IS NOT NULL AND amount_paid_cents >= 0 AND amount_paid_cents <= amount_cents)),
  ADD CONSTRAINT invoice_billing_month_valid CHECK (payment_plan <> 'monthly_retainer' OR (billing_month IS NOT NULL AND EXTRACT(DAY FROM billing_month) = 1));
UPDATE public.client_invoices SET amount_paid_cents = amount_cents WHERE status = 'paid' AND amount_cents >= 0;
UPDATE public.client_invoices SET payment_plan = 'deposit_balance' WHERE status = 'deposit';
COMMIT;
