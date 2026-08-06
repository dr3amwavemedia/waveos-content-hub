CREATE TABLE IF NOT EXISTS public.content_item_internal_notes (
  content_item_id uuid PRIMARY KEY REFERENCES public.content_items(id) ON DELETE CASCADE,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_item_internal_notes TO authenticated;
GRANT ALL ON public.content_item_internal_notes TO service_role;

ALTER TABLE public.content_item_internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read content internal notes"
ON public.content_item_internal_notes FOR SELECT TO authenticated
USING (public.is_dream_wave_staff(auth.uid()));

CREATE POLICY "Staff write content internal notes"
ON public.content_item_internal_notes FOR ALL TO authenticated
USING (public.is_dream_wave_staff(auth.uid()))
WITH CHECK (public.is_dream_wave_staff(auth.uid()));

INSERT INTO public.content_item_internal_notes (content_item_id, notes)
SELECT id, internal_notes FROM public.content_items WHERE internal_notes IS NOT NULL
ON CONFLICT (content_item_id) DO NOTHING;

ALTER TABLE public.content_items DROP COLUMN IF EXISTS internal_notes;