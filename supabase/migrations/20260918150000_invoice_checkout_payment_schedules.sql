alter table public.client_invoices
  add column if not exists checkout_payment_type text not null default 'remaining',
  add column if not exists checkout_payment_cents integer;

alter table public.client_invoices
  drop constraint if exists client_invoices_checkout_payment_type_check;
alter table public.client_invoices
  add constraint client_invoices_checkout_payment_type_check
  check (checkout_payment_type in ('remaining', 'deposit', 'fixed'));

alter table public.client_invoices
  drop constraint if exists client_invoices_checkout_payment_amount_check;
alter table public.client_invoices
  add constraint client_invoices_checkout_payment_amount_check
  check (
    (checkout_payment_type = 'remaining' and checkout_payment_cents is null)
    or (
      checkout_payment_type in ('deposit', 'fixed')
      and checkout_payment_cents is not null
      and checkout_payment_cents > 0
      and (amount_cents is null or checkout_payment_cents <= amount_cents)
    )
  );

comment on column public.client_invoices.checkout_payment_type is
  'How the next Stripe Checkout amount is calculated: remaining balance, first deposit then balance, or a recurring fixed installment.';
comment on column public.client_invoices.checkout_payment_cents is
  'Configured deposit or fixed installment amount in cents. Null when the full remaining balance is due.';
