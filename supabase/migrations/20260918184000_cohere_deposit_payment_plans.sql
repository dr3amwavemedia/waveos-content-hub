-- Repair invoices where the visible WaveOS payment plan was changed to a
-- deposit, but the separate Stripe amount control was left at its old default.
-- New saves keep these values together in the application.
update public.client_invoices
set checkout_payment_type = 'deposit',
    checkout_payment_cents = greatest(1, round(amount_cents / 2.0)::integer)
where payment_plan = 'deposit_balance'
  and checkout_payment_type = 'remaining'
  and checkout_payment_cents is null
  and amount_cents is not null
  and amount_cents > 0
  and amount_paid_cents = 0;
