ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS amount_paid_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_month date,
  ADD COLUMN IF NOT EXISTS payment_plan text NOT NULL DEFAULT 'one_time';

ALTER TABLE public.client_invoices
  DROP CONSTRAINT IF EXISTS client_invoices_payment_plan_check;

ALTER TABLE public.client_invoices
  ADD CONSTRAINT client_invoices_payment_plan_check
  CHECK (payment_plan IN ('one_time','deposit_balance','installments','monthly_retainer'));