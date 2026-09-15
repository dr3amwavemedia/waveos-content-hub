-- Prepared for isolated staging first. Existing invoice rows keep an empty item list.
ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE public.client_invoices
SET published_at = COALESCE(published_at, issued_at, created_at)
WHERE status <> 'draft' AND published_at IS NULL;

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
  DROP CONSTRAINT IF EXISTS client_invoices_line_items_total_matches;
ALTER TABLE public.client_invoices
  ADD CONSTRAINT client_invoices_line_items_total_matches
  CHECK (
    jsonb_array_length(line_items) = 0
    OR amount_cents = public.invoice_line_items_total(line_items)
  );

-- Drafts remain owner-only; clients see an invoice only after publication.
DROP POLICY IF EXISTS "Client members view their invoices" ON public.client_invoices;
CREATE POLICY "Client members view their invoices"
  ON public.client_invoices FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      NOT public.is_dream_wave_staff((SELECT auth.uid()))
      AND public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND published_at IS NOT NULL
      AND status <> 'draft'
    )
  );