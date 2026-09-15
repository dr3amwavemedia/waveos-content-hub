-- Prepared for isolated staging first. Existing invoice rows keep an empty item list.
ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.invoice_line_items_total(_items jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  item jsonb;
  total bigint := 0;
  quantity bigint;
  unit_cents bigint;
BEGIN
  IF jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'line_items_must_be_array';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    IF jsonb_typeof(item) <> 'object'
       OR jsonb_typeof(item->'description') <> 'string'
       OR length(trim(item->>'description')) = 0
       OR jsonb_typeof(item->'quantity') <> 'number'
       OR jsonb_typeof(item->'unitCents') <> 'number'
       OR (item->>'quantity') !~ '^[0-9]+$'
       OR (item->>'unitCents') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'invalid_invoice_line_item';
    END IF;
    quantity := (item->>'quantity')::bigint;
    unit_cents := (item->>'unitCents')::bigint;
    IF quantity < 1 OR unit_cents < 0 THEN
      RAISE EXCEPTION 'invalid_invoice_line_item_amount';
    END IF;
    total := total + quantity * unit_cents;
    IF total > 2147483647 THEN
      RAISE EXCEPTION 'invoice_total_too_large';
    END IF;
  END LOOP;
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION public.invoice_line_items_total(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoice_line_items_total(jsonb) TO authenticated, service_role;

ALTER TABLE public.client_invoices
  ADD CONSTRAINT client_invoices_line_items_total_matches
  CHECK (
    jsonb_array_length(line_items) = 0
    OR amount_cents = public.invoice_line_items_total(line_items)
  );

-- A template-based contract begins as a private draft without an external URL.
ALTER TABLE public.client_contracts
  ALTER COLUMN hosted_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_template_version integer;

ALTER TABLE public.client_contracts
  ADD CONSTRAINT client_contracts_external_link_when_sent
  CHECK (status = 'draft' OR provider NOT IN ('bloom', 'other') OR hosted_url IS NOT NULL);
