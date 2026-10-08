-- Keep the client-facing invoice total at the agreed base amount while allowing
-- Stripe Checkout to itemize an optional processing fee. Existing invoices stay
-- in the legacy model so historical balances and live payments never change.
alter table public.client_invoices
  add column if not exists processing_fee_at_checkout boolean not null default false;

alter table public.payment_ledger
  add column if not exists processing_fee_cents bigint not null default 0;

alter table public.payment_ledger
  drop constraint if exists payment_ledger_processing_fee_cents_valid;

alter table public.payment_ledger
  add constraint payment_ledger_processing_fee_cents_valid
    check (processing_fee_cents >= 0);

alter table public.client_invoices
  drop constraint if exists client_invoices_discounted_total_matches;

alter table public.client_invoices
  add constraint client_invoices_discounted_total_matches
  check (
    amount_cents is null
    or (
      subtotal_cents is not null
      and (jsonb_array_length(line_items) = 0 or subtotal_cents = public.invoice_line_items_total(line_items))
      and service_fee_cents = round(
        (
          subtotal_cents - case
            when discount_type = 'fixed' then discount_value
            when discount_type = 'percentage' then round(subtotal_cents * discount_value / 10000.0)::integer
            else 0
          end
        ) * service_fee_percent / 10000.0
      )::integer
      and amount_cents = subtotal_cents - case
        when discount_type = 'fixed' then discount_value
        when discount_type = 'percentage' then round(subtotal_cents * discount_value / 10000.0)::integer
        else 0
      end + case when processing_fee_at_checkout then 0 else service_fee_cents end
    )
  );

comment on column public.client_invoices.processing_fee_at_checkout is
  'When true, service_fee_cents is disclosed and charged as a separate Stripe Checkout line item, not included in amount_cents.';

comment on column public.payment_ledger.processing_fee_cents is
  'Processing fee collected in addition to amount_cents; amount_cents is the payment applied to the invoice balance.';
