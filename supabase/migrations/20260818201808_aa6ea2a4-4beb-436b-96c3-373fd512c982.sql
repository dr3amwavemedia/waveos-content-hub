ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS wedding_scheduling_url text;

ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_wedding_scheduling_url_check,
  ADD CONSTRAINT workspaces_wedding_scheduling_url_check
    CHECK (wedding_scheduling_url IS NULL OR wedding_scheduling_url ~* '^https://[^\s]{3,500}$');

-- Public vision boards: replace the blanket published-row policy with a
-- token-scoped security definer function so a board is only readable by
-- someone holding its unique link.
DROP POLICY IF EXISTS "anyone can view published vision boards" ON public.production_vision_boards;

CREATE OR REPLACE FUNCTION public.get_public_vision_board(_public_token uuid)
RETURNS TABLE(project_name text, pages jsonb, published_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.project_name, b.pages, b.published_at
  FROM public.production_vision_boards AS b
  WHERE b.public_token = _public_token
    AND b.status = 'published'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_vision_board(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_vision_board(uuid) TO anon, authenticated, service_role;