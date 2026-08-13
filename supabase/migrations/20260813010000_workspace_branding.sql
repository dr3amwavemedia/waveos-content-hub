-- Client-specific visual identity for the WaveOS workspace.
CREATE TABLE public.workspace_branding (
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

CREATE POLICY "Workspace members view branding"
  ON public.workspace_branding FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
  );

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

CREATE TRIGGER update_workspace_branding_updated_at
  BEFORE UPDATE ON public.workspace_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-branding',
  'workspace-branding',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Workspace admins upload branding"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-branding'
    AND (
      public.can_staff_manage_workspace(
        (SELECT auth.uid()),
        ((storage.foldername(name))[1])::uuid
      )
      OR public.workspace_role(
        (SELECT auth.uid()),
        ((storage.foldername(name))[1])::uuid
      )::text IN ('owner', 'admin')
    )
  );

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

CREATE POLICY "Workspace admins delete branding"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'workspace-branding'
    AND (
      public.can_staff_manage_workspace((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)
      OR public.workspace_role((SELECT auth.uid()), ((storage.foldername(name))[1])::uuid)::text IN ('owner', 'admin')
    )
  );
