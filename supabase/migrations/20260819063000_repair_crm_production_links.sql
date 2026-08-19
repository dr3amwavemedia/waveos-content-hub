-- Allow multiple opportunities for the same client to share one WaveOS workspace,
-- and provide atomic, permission-checked operations for CRM linking and production.

ALTER TABLE public.crm_accounts
  DROP CONSTRAINT IF EXISTS crm_accounts_linked_workspace_id_key;

CREATE INDEX IF NOT EXISTS crm_accounts_linked_workspace_idx
  ON public.crm_accounts(linked_workspace_id)
  WHERE linked_workspace_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_link_lead_to_workspace(
  _account_id uuid,
  _workspace_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _account public.crm_accounts%ROWTYPE;
  _workspace public.workspaces%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role(_uid, 'dream_wave_owner') THEN RAISE EXCEPTION 'owner_required'; END IF;

  SELECT * INTO _account
  FROM public.crm_accounts
  WHERE id = _account_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;
  IF _account.stage = 'archived' THEN RAISE EXCEPTION 'restore_lead_before_linking'; END IF;
  IF _account.linked_workspace_id IS NOT NULL
     AND _account.linked_workspace_id <> _workspace_id THEN
    RAISE EXCEPTION 'lead_already_linked';
  END IF;

  SELECT * INTO _workspace
  FROM public.workspaces
  WHERE id = _workspace_id
    AND NOT coalesce(is_archived, false);

  IF NOT FOUND THEN RAISE EXCEPTION 'workspace_not_found_or_archived'; END IF;

  UPDATE public.crm_accounts
  SET linked_workspace_id = _workspace_id,
      stage = 'won',
      converted_at = coalesce(converted_at, now()),
      updated_at = now(),
      updated_by = _uid
  WHERE id = _account_id;

  INSERT INTO public.crm_activities (
    account_id, actor_id, activity_type, summary, safe_metadata
  ) VALUES (
    _account_id,
    _uid,
    'status_change',
    'Lead linked to existing client workspace',
    jsonb_build_object('workspace_id', _workspace_id, 'workspace_name', _workspace.name)
  );

  RETURN _workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_link_lead_to_workspace(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_link_lead_to_workspace(uuid, uuid) TO authenticated;

-- Repair production environments where the UI shipped before its table migration.
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
  USING (public.is_dream_wave_staff((SELECT auth.uid())))
  WITH CHECK (public.is_dream_wave_staff((SELECT auth.uid())));

DROP TRIGGER IF EXISTS production_projects_updated_at ON public.production_projects;
CREATE TRIGGER production_projects_updated_at
  BEFORE UPDATE ON public.production_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.assign_production_project(
  _title text,
  _crm_account_id uuid,
  _assigned_to uuid DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL,
  _location text DEFAULT NULL,
  _client_snapshot jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _account public.crm_accounts%ROWTYPE;
  _assignee uuid := coalesce(_assigned_to, auth.uid());
  _project_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'staff_required'; END IF;
  IF nullif(btrim(coalesce(_title, '')), '') IS NULL THEN RAISE EXCEPTION 'title_required'; END IF;
  IF jsonb_typeof(coalesce(_client_snapshot, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'invalid_client_snapshot';
  END IF;
  IF NOT public.is_dream_wave_staff(_assignee) THEN RAISE EXCEPTION 'invalid_staff_assignee'; END IF;

  SELECT * INTO _account
  FROM public.crm_accounts
  WHERE id = _crm_account_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'crm_client_not_found'; END IF;

  INSERT INTO public.production_projects (
    title, crm_account_id, workspace_id, assigned_to, scheduled_at, location,
    client_snapshot, client_synced_at, created_by
  ) VALUES (
    btrim(_title), _account.id, _account.linked_workspace_id, _assignee,
    _scheduled_at, nullif(btrim(coalesce(_location, '')), ''),
    coalesce(_client_snapshot, '{}'::jsonb), now(), _uid
  )
  RETURNING id INTO _project_id;

  RETURN _project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_production_project(text, uuid, uuid, timestamptz, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_production_project(text, uuid, uuid, timestamptz, text, jsonb)
  TO authenticated;

-- Ensure PostgREST sees both RPCs immediately after the migration is applied.
NOTIFY pgrst, 'reload schema';
