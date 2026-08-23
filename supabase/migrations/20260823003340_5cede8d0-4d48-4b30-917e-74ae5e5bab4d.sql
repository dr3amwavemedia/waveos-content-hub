-- Phone-first production workflow: shared shoot progress, check-in/out, and notes.

ALTER TABLE public.production_projects
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_out_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_notes text
    CHECK (production_notes IS NULL OR char_length(production_notes) <= 6000);

CREATE TABLE IF NOT EXISTS public.production_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.production_projects(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 180),
  sort_order integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, item_key)
);

CREATE INDEX IF NOT EXISTS production_checklist_project_idx
  ON public.production_checklist_items(project_id, sort_order);

ALTER TABLE public.production_checklist_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_checklist_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_checklist_items TO authenticated;
GRANT ALL ON public.production_checklist_items TO service_role;

DROP POLICY IF EXISTS "staff manage production checklist" ON public.production_checklist_items;
CREATE POLICY "staff manage production checklist"
  ON public.production_checklist_items FOR ALL TO authenticated
  USING ((SELECT public.is_dream_wave_staff((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_dream_wave_staff((SELECT auth.uid()))));

DROP TRIGGER IF EXISTS production_checklist_items_updated_at ON public.production_checklist_items;
CREATE TRIGGER production_checklist_items_updated_at
  BEFORE UPDATE ON public.production_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.ensure_production_checklist(_project_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _count integer;
BEGIN
  INSERT INTO public.production_checklist_items(project_id,item_key,label,sort_order)
  SELECT _project_id,v.item_key,v.label,v.sort_order
  FROM (VALUES
    ('brief','Review creative brief and shot list',10),
    ('gear','Confirm cameras, lenses, audio, lights, and media',20),
    ('batteries','Check batteries and format cards',30),
    ('location','Confirm location, access, parking, and contact',40),
    ('releases','Confirm releases and client approval',50),
    ('backup','Back up footage before leaving the shoot',60),
    ('upload','Confirm footage upload has started',70)
  ) AS v(item_key,label,sort_order)
  WHERE EXISTS (SELECT 1 FROM public.production_projects p WHERE p.id = _project_id)
  ON CONFLICT (project_id,item_key) DO NOTHING;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END; $$;

REVOKE ALL ON FUNCTION public.ensure_production_checklist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_production_checklist(uuid) TO authenticated;