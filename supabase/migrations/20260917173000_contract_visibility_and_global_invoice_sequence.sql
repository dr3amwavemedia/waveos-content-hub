-- Keep client contract drafts private even if a portal query is accidentally
-- broadened. Legacy external contracts remain visible after they are sent;
-- SignWell contracts must also have passed the explicit publish step.
DROP POLICY IF EXISTS "Client members view their contracts" ON public.client_contracts;
CREATE POLICY "Client members view their contracts"
  ON public.client_contracts FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dream_wave_owner')
    OR (
      NOT public.is_dream_wave_staff((SELECT auth.uid()))
      AND public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND status <> 'draft'
      AND (provider <> 'signwell' OR published_at IS NOT NULL)
    )
  );

-- One agency-wide counter replaces the old per-workspace counter. The prefix
-- and final numeric width are learned from the highest existing invoice, so
-- both INV-2026050 and INV-2026-050 continue in the format the owner chose.
CREATE TABLE IF NOT EXISTS public.global_invoice_number_counter (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  prefix text NOT NULL,
  last_value bigint NOT NULL CHECK (last_value >= 0),
  pad_width integer NOT NULL CHECK (pad_width BETWEEN 1 AND 18),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_invoice_number_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_invoice_number_counter FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.global_invoice_number_counter TO service_role;

INSERT INTO public.global_invoice_number_counter (singleton, prefix, last_value, pad_width)
VALUES (true, 'INV-' || EXTRACT(YEAR FROM now())::integer::text, 0, 3)
ON CONFLICT (singleton) DO NOTHING;

DO $$
DECLARE
  chosen text[];
BEGIN
  SELECT regexp_match(number, '^(.*?)([0-9]+)$')
  INTO chosen
  FROM public.client_invoices
  WHERE number ~ '^(.*?)[0-9]+$'
    AND length((regexp_match(number, '^(.*?)([0-9]+)$'))[2]) <= 18
  ORDER BY ((regexp_match(number, '^(.*?)([0-9]+)$'))[2])::numeric DESC
  LIMIT 1;

  IF chosen IS NOT NULL THEN
    UPDATE public.global_invoice_number_counter
    SET prefix = chosen[1],
        last_value = chosen[2]::bigint,
        pad_width = length(chosen[2]),
        updated_at = now()
    WHERE singleton;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  counter public.global_invoice_number_counter%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'dream_wave_owner')
     OR NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = _workspace_id) THEN
    RAISE EXCEPTION 'Only the WaveOS owner can assign invoice numbers.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.global_invoice_number_counter
  SET last_value = last_value + 1, updated_at = now()
  WHERE singleton
  RETURNING * INTO counter;

  RETURN counter.prefix || lpad(counter.last_value::text, counter.pad_width, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_invoice_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated, service_role;

-- A manually entered invoice number becomes the new starting point when it is
-- higher than the current sequence (or intentionally changes the prefix).
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

DROP TRIGGER IF EXISTS register_global_invoice_number ON public.client_invoices;
CREATE TRIGGER register_global_invoice_number
  BEFORE INSERT OR UPDATE OF number ON public.client_invoices
  FOR EACH ROW EXECUTE FUNCTION public.register_global_invoice_number();
