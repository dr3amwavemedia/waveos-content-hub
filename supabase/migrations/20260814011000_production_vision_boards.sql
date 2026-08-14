-- Shareable storyboard vision boards for the Production workspace.

CREATE TABLE IF NOT EXISTS public.production_vision_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL DEFAULT 'Untitled production',
  pages jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pages) = 'array'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_vision_boards_owner_idx
  ON public.production_vision_boards(created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS production_vision_boards_public_idx
  ON public.production_vision_boards(public_token)
  WHERE status = 'published';

ALTER TABLE public.production_vision_boards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_vision_boards FROM PUBLIC;
GRANT SELECT ON public.production_vision_boards TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_vision_boards TO authenticated;
GRANT ALL ON public.production_vision_boards TO service_role;

DROP POLICY IF EXISTS "staff manage their vision boards" ON public.production_vision_boards;
CREATE POLICY "staff manage their vision boards"
  ON public.production_vision_boards FOR ALL TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND (SELECT public.is_dream_wave_staff((SELECT auth.uid())))
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (SELECT public.is_dream_wave_staff((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "anyone can view published vision boards" ON public.production_vision_boards;
CREATE POLICY "anyone can view published vision boards"
  ON public.production_vision_boards FOR SELECT TO anon, authenticated
  USING (status = 'published');

DROP TRIGGER IF EXISTS production_vision_boards_updated_at ON public.production_vision_boards;
CREATE TRIGGER production_vision_boards_updated_at
  BEFORE UPDATE ON public.production_vision_boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
