
CREATE TABLE IF NOT EXISTS public.workspace_internal_notes (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_internal_notes TO authenticated;
GRANT ALL ON public.workspace_internal_notes TO service_role;

ALTER TABLE public.workspace_internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read internal notes"
  ON public.workspace_internal_notes FOR SELECT
  TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()));

CREATE POLICY "Staff write internal notes"
  ON public.workspace_internal_notes FOR ALL
  TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_dream_wave_staff(auth.uid()));

INSERT INTO public.workspace_internal_notes (workspace_id, notes, updated_at)
SELECT w.id, w.admin_notes, now()
FROM public.workspaces w
WHERE w.admin_notes IS NOT NULL AND trim(w.admin_notes) <> ''
ON CONFLICT (workspace_id) DO NOTHING;

ALTER TABLE public.workspaces DROP COLUMN IF EXISTS admin_notes;

CREATE OR REPLACE FUNCTION public.tg_workspace_internal_notes_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_internal_notes_touch ON public.workspace_internal_notes;
CREATE TRIGGER workspace_internal_notes_touch
  BEFORE UPDATE ON public.workspace_internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_workspace_internal_notes_touch();

UPDATE public.client_invoices
   SET hosted_url = NULL
 WHERE hosted_url IS NOT NULL
   AND hosted_url !~* '^https://[^\s]+$';

UPDATE public.client_deliveries
   SET url = NULL
 WHERE url IS NOT NULL
   AND url !~* '^https://[^\s]+$';

ALTER TABLE public.client_invoices
  DROP CONSTRAINT IF EXISTS client_invoices_hosted_url_https;
ALTER TABLE public.client_invoices
  ADD CONSTRAINT client_invoices_hosted_url_https
  CHECK (hosted_url IS NULL OR hosted_url ~* '^https://[^\s]+$');

ALTER TABLE public.client_deliveries
  DROP CONSTRAINT IF EXISTS client_deliveries_url_https;
ALTER TABLE public.client_deliveries
  ADD CONSTRAINT client_deliveries_url_https
  CHECK (url IS NULL OR url ~* '^https://[^\s]+$');
