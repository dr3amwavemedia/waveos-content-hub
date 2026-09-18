-- Agency-wide invoice numbering: Invoice #02026-00054 onward.
-- Additive only: no existing client_invoices row is touched.

UPDATE public.global_invoice_number_counter
SET prefix = 'Invoice #02026-',
    last_value = 53,
    pad_width = 5,
    updated_at = now()
WHERE singleton;

-- Atomic, staff-authorized allocation from the single global counter.
CREATE OR REPLACE FUNCTION public.next_invoice_number(_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  counter public.global_invoice_number_counter%ROWTYPE;
BEGIN
  IF NOT public.is_dream_wave_staff(auth.uid()) THEN
    RAISE EXCEPTION 'staff_required';
  END IF;

  UPDATE public.global_invoice_number_counter
  SET last_value = last_value + 1,
      updated_at = now()
  WHERE singleton
  RETURNING * INTO counter;

  RETURN counter.prefix || lpad(counter.last_value::text, counter.pad_width, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_invoice_number(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated;

-- Issued invoice numbers are immutable; only private drafts may be renumbered,
-- and only by the Dream Wave owner.
CREATE OR REPLACE FUNCTION public.protect_issued_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.number IS NOT DISTINCT FROM OLD.number THEN
    RETURN NEW;
  END IF;
  IF OLD.number IS NOT NULL AND (
       OLD.published_at IS NOT NULL
       OR OLD.status <> 'draft'
       OR OLD.provider_session_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'An issued invoice number cannot be changed.';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'dream_wave_owner') THEN
    RAISE EXCEPTION 'Only the Dream Wave owner can change an invoice number.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_issued_invoice_number ON public.client_invoices;
CREATE TRIGGER protect_issued_invoice_number
  BEFORE UPDATE ON public.client_invoices
  FOR EACH ROW EXECUTE FUNCTION public.protect_issued_invoice_number();