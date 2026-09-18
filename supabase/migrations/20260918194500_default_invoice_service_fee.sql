-- Future WaveOS invoices can itemize an ordinary service fee. Existing invoices
-- are backfilled with zero so completed and historical totals never change.
alter table public.client_invoices
  add column if not exists service_fee_percent integer not null default 0,
  add column if not exists service_fee_cents integer not null default 0;

alter table public.invoice_autopay_schedules
  add column if not exists service_fee_percent integer not null default 0,
  add column if not exists service_fee_cents integer not null default 0;

alter table public.client_invoices
  drop constraint if exists client_invoices_service_fee_percent_valid,
  drop constraint if exists client_invoices_service_fee_cents_valid;

alter table public.client_invoices
  add constraint client_invoices_service_fee_percent_valid
    check (service_fee_percent between 0 and 10000),
  add constraint client_invoices_service_fee_cents_valid
    check (service_fee_cents >= 0);

alter table public.invoice_autopay_schedules
  drop constraint if exists invoice_autopay_service_fee_percent_valid,
  drop constraint if exists invoice_autopay_service_fee_cents_valid;

alter table public.invoice_autopay_schedules
  add constraint invoice_autopay_service_fee_percent_valid
    check (service_fee_percent between 0 and 10000),
  add constraint invoice_autopay_service_fee_cents_valid
    check (service_fee_cents >= 0);

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
      end + service_fee_cents
    )
  );
