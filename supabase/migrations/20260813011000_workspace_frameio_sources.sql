-- A Frame.io source is assigned by Dream Wave staff. Clients may view the
-- assigned source, but cannot connect an account or change its URL/IDs.
CREATE TABLE public.workspace_frameio_sources (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  share_url text NOT NULL,
  label text NOT NULL DEFAULT 'Frame.io media',
  frameio_account_id text,
  frameio_project_id text,
  frameio_share_id text,
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'ready', 'error')),
  sync_error text,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_frameio_source_url_https
    CHECK (
      share_url ~ '^https://(www\.)?(f\.io|frame\.io|next\.frame\.io)/'
      AND char_length(share_url) <= 2048
    ),
  CONSTRAINT workspace_frameio_source_label_len
    CHECK (char_length(label) BETWEEN 1 AND 120)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_frameio_sources TO authenticated;
GRANT ALL ON public.workspace_frameio_sources TO service_role;
ALTER TABLE public.workspace_frameio_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view assigned Frame.io source"
  ON public.workspace_frameio_sources FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
  );

CREATE POLICY "Dream Wave staff assign Frame.io source"
  ON public.workspace_frameio_sources FOR ALL TO authenticated
  USING (public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id))
  WITH CHECK (public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id));

CREATE TRIGGER update_workspace_frameio_sources_updated_at
  BEFORE UPDATE ON public.workspace_frameio_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
