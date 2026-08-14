-- Production projects connect videographer work to the existing WaveCRM client record.
-- The linked CRM/workspace ids remain authoritative; client_snapshot preserves what
-- the crew was given when the production was assigned and can be refreshed in-app.

CREATE TABLE IF NOT EXISTS public.production_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 180),
  crm_account_id uuid NOT NULL REFERENCES public.crm_accounts(id) ON DELETE RESTRICT,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  location text,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'pre_production', 'shooting', 'uploading', 'editing', 'complete')),
  client_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(client_snapshot) = 'object'),
  client_synced_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_projects_schedule_idx
  ON public.production_projects(scheduled_at, status);
CREATE INDEX IF NOT EXISTS production_projects_client_idx
  ON public.production_projects(crm_account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS production_projects_assignee_idx
  ON public.production_projects(assigned_to, status);

ALTER TABLE public.production_projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_projects FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_projects TO authenticated;
GRANT ALL ON public.production_projects TO service_role;

DROP POLICY IF EXISTS "staff manage production projects" ON public.production_projects;
CREATE POLICY "staff manage production projects"
  ON public.production_projects FOR ALL TO authenticated
  USING ((SELECT public.is_dream_wave_staff((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_dream_wave_staff((SELECT auth.uid()))));

DROP TRIGGER IF EXISTS production_projects_updated_at ON public.production_projects;
CREATE TRIGGER production_projects_updated_at
  BEFORE UPDATE ON public.production_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
