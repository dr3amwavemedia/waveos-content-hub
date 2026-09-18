-- Store the original subtotal and a normalized discount while keeping
-- amount_cents as the final amount charged throughout checkout and reporting.
ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS subtotal_cents integer,
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value integer;

UPDATE public.client_invoices
SET subtotal_cents = amount_cents,
    discount_type = NULL,
    discount_value = NULL
WHERE subtotal_cents IS NULL;

ALTER TABLE public.client_invoices
  ADD CONSTRAINT client_invoices_subtotal_nonnegative
    CHECK (subtotal_cents IS NULL OR subtotal_cents >= 0),
  ADD CONSTRAINT client_invoices_discount_type_valid
    CHECK (discount_type IS NULL OR discount_type IN ('fixed', 'percentage')),
  ADD CONSTRAINT client_invoices_discount_value_valid
    CHECK (
      (discount_type IS NULL AND discount_value IS NULL)
      OR (discount_type = 'fixed' AND discount_value >= 0 AND discount_value <= subtotal_cents)
      OR (discount_type = 'percentage' AND discount_value >= 0 AND discount_value <= 10000)
    );

ALTER TABLE public.client_invoices
  DROP CONSTRAINT IF EXISTS client_invoices_line_items_total_matches;

ALTER TABLE public.client_invoices
  ADD CONSTRAINT client_invoices_discounted_total_matches
  CHECK (
    amount_cents IS NULL
    OR (
      subtotal_cents IS NOT NULL
      AND (jsonb_array_length(line_items) = 0 OR subtotal_cents = public.invoice_line_items_total(line_items))
      AND amount_cents = subtotal_cents - CASE
        WHEN discount_type = 'fixed' THEN discount_value
        WHEN discount_type = 'percentage' THEN round(subtotal_cents * discount_value / 10000.0)::integer
        ELSE 0
      END
    )
  );
