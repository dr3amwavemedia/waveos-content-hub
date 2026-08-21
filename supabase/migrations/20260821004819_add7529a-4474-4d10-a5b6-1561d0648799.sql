-- Core projects foundation (additive, no UI exposure yet)
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_name text,
  client_name text,
  project_type text NOT NULL DEFAULT 'one_time',
  description text,
  status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT true,
  client_visible boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  start_date date,
  end_date date,
  event_date date,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  crm_account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position text,
  responsibilities text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.project_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  body text NOT NULL,
  visibility text NOT NULL DEFAULT 'internal',
  author_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'link',
  is_approved boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_staff_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_references TO authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.project_staff_assignments TO service_role;
GRANT ALL ON public.project_notes TO service_role;
GRANT ALL ON public.project_milestones TO service_role;
GRANT ALL ON public.project_references TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_references ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_project_staff(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_staff_assignments a
    WHERE a.project_id = _project_id AND a.user_id = _user_id
  );
$$;
REVOKE ALL ON FUNCTION public.is_project_staff(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_project_staff(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_project_client(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.workspace_members m ON m.workspace_id = p.workspace_id
    WHERE p.id = _project_id
      AND m.user_id = _user_id
      AND p.client_visible
      AND p.is_active
      AND p.published_at IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_project_client(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_project_client(uuid, uuid) TO authenticated, service_role;

-- projects policies
CREATE POLICY "projects_owner_all" ON public.projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'dream_wave_owner'));
CREATE POLICY "projects_staff_read" ON public.projects FOR SELECT TO authenticated
  USING (public.is_project_staff(auth.uid(), id));
CREATE POLICY "projects_client_read" ON public.projects FOR SELECT TO authenticated
  USING (public.is_project_client(auth.uid(), id));

-- staff assignments
CREATE POLICY "project_staff_owner_all" ON public.project_staff_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'dream_wave_owner'));
CREATE POLICY "project_staff_self_read" ON public.project_staff_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- notes
CREATE POLICY "project_notes_owner_all" ON public.project_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'dream_wave_owner'));
CREATE POLICY "project_notes_staff_read" ON public.project_notes FOR SELECT TO authenticated
  USING (public.is_project_staff(auth.uid(), project_id));
CREATE POLICY "project_notes_client_read" ON public.project_notes FOR SELECT TO authenticated
  USING (visibility = 'client' AND public.is_project_client(auth.uid(), project_id));

-- milestones
CREATE POLICY "project_milestones_owner_all" ON public.project_milestones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'dream_wave_owner'));
CREATE POLICY "project_milestones_staff_read" ON public.project_milestones FOR SELECT TO authenticated
  USING (public.is_project_staff(auth.uid(), project_id));
CREATE POLICY "project_milestones_client_read" ON public.project_milestones FOR SELECT TO authenticated
  USING (is_active AND public.is_project_client(auth.uid(), project_id));

-- references
CREATE POLICY "project_refs_owner_all" ON public.project_references FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'dream_wave_owner'));
CREATE POLICY "project_refs_staff_read" ON public.project_references FOR SELECT TO authenticated
  USING (public.is_project_staff(auth.uid(), project_id));
CREATE POLICY "project_refs_client_read" ON public.project_references FOR SELECT TO authenticated
  USING (is_active AND is_approved AND public.is_project_client(auth.uid(), project_id));

CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER project_notes_touch BEFORE UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER project_milestones_touch BEFORE UPDATE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER project_references_touch BEFORE UPDATE ON public.project_references
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS projects_workspace_idx ON public.projects(workspace_id);
CREATE INDEX IF NOT EXISTS project_staff_user_idx ON public.project_staff_assignments(user_id);