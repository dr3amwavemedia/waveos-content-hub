CREATE TABLE IF NOT EXISTS public.workspace_branding (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  logo_path text,
  accent_color text NOT NULL DEFAULT '#4DB8FF',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_branding_accent_hex
    CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT workspace_branding_logo_path
    CHECK (logo_path IS NULL OR logo_path ~ '^[0-9a-f-]{36}/[^/]+$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_branding TO authenticated;
GRANT ALL ON public.workspace_branding TO service_role;
ALTER TABLE public.workspace_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members view branding" ON public.workspace_branding;
CREATE POLICY "Workspace members view branding"
  ON public.workspace_branding FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
  );

DROP POLICY IF EXISTS "Workspace admins manage branding" ON public.workspace_branding;
CREATE POLICY "Workspace admins manage branding"
  ON public.workspace_branding FOR ALL TO authenticated
  USING (
    public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    OR public.workspace_role((SELECT auth.uid()), workspace_id)::text IN ('owner', 'admin')
  )
  WITH CHECK (
    public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    OR public.workspace_role((SELECT auth.uid()), workspace_id)::text IN ('owner', 'admin')
  );

DROP TRIGGER IF EXISTS update_workspace_branding_updated_at ON public.workspace_branding;
CREATE TRIGGER update_workspace_branding_updated_at
  BEFORE UPDATE ON public.workspace_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Workspace members read branding files" ON storage.objects;
CREATE POLICY "Workspace members read branding files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'workspace-branding'
    AND (
      public.is_workspace_member((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)
      OR public.can_staff_manage_workspace((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "Workspace admins upload branding" ON storage.objects;
CREATE POLICY "Workspace admins upload branding"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-branding'
    AND (
      public.can_staff_manage_workspace((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)
      OR public.workspace_role((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)::text IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Workspace admins update branding" ON storage.objects;
CREATE POLICY "Workspace admins update branding"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'workspace-branding'
    AND (
      public.can_staff_manage_workspace((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)
      OR public.workspace_role((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)::text IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'workspace-branding'
    AND (
      public.can_staff_manage_workspace((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)
      OR public.workspace_role((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)::text IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Workspace admins delete branding" ON storage.objects;
CREATE POLICY "Workspace admins delete branding"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'workspace-branding'
    AND (
      public.can_staff_manage_workspace((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)
      OR public.workspace_role((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)::text IN ('owner', 'admin')
    )
  );