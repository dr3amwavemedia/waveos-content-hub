-- Existing invoices may share a legacy number from the former per-workspace
-- sequence. Keep those rows editable when their number is unchanged, while
-- continuing to reject newly introduced agency-wide duplicates.
CREATE OR REPLACE FUNCTION public.register_global_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parts text[];
  current_counter public.global_invoice_number_counter%ROWTYPE;
  candidate bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.number IS NOT DISTINCT FROM OLD.number THEN
    RETURN NEW;
  END IF;

  IF NEW.number IS NULL OR NEW.number !~ '^(.*?)[0-9]+$' THEN
    RETURN NEW;
  END IF;

  parts := regexp_match(NEW.number, '^(.*?)([0-9]+)$');
  IF length(parts[2]) > 18 THEN
    RAISE EXCEPTION 'Invoice number numeric suffix is too long.';
  END IF;
  candidate := parts[2]::bigint;

  IF EXISTS (
    SELECT 1 FROM public.client_invoices
    WHERE number = NEW.number AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Invoice number % is already in use.', NEW.number USING ERRCODE = '23505';
  END IF;

  SELECT * INTO current_counter
  FROM public.global_invoice_number_counter
  WHERE singleton
  FOR UPDATE;

  IF parts[1] <> current_counter.prefix OR candidate > current_counter.last_value THEN
    UPDATE public.global_invoice_number_counter
    SET prefix = parts[1],
        last_value = candidate,
        pad_width = length(parts[2]),
        updated_at = now()
    WHERE singleton;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.register_global_invoice_number() FROM PUBLIC, anon, authenticated;
