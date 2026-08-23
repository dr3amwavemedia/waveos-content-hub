-- Assigned productions are client calendar events once they are linked to a
-- workspace. Clients may only read rows for workspaces they belong to; staff
-- retain their existing management policy.
CREATE INDEX IF NOT EXISTS production_projects_workspace_schedule_idx
  ON public.production_projects(workspace_id, scheduled_at)
  WHERE workspace_id IS NOT NULL AND scheduled_at IS NOT NULL;

DROP POLICY IF EXISTS "workspace members view assigned production projects"
  ON public.production_projects;
CREATE POLICY "workspace members view assigned production projects"
  ON public.production_projects
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member((SELECT auth.uid()), workspace_id)
  );
