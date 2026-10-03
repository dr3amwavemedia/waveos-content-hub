-- Public WaveOS signups receive one isolated OS-data workspace and the
-- card-free two-account trial. Existing Dream Wave client creation is not
-- changed and no existing workspace is updated.
CREATE OR REPLACE FUNCTION public.create_os_trial_workspace(
  _name text,
  _business_name text DEFAULT NULL,
  _industry text DEFAULT NULL,
  _website text DEFAULT NULL,
  _timezone text DEFAULT 'America/New_York',
  _primary_language text DEFAULT 'en',
  _service_area text DEFAULT NULL,
  _target_audience text DEFAULT NULL
)
RETURNS TABLE(id uuid, slug text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _created record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = _uid AND profiles.account_source = 'os_data'
  ) THEN
    RAISE EXCEPTION 'os_account_required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.workspace_members
    JOIN public.workspaces ON workspaces.id = workspace_members.workspace_id
    WHERE workspace_members.user_id = _uid
      AND workspaces.data_source = 'os_data'
  ) THEN
    RAISE EXCEPTION 'os_workspace_already_exists';
  END IF;

  SELECT created.id, created.slug, created.name INTO _created
  FROM public.create_brand_workspace(
    _name, _business_name, _industry, _website, _timezone,
    _primary_language, _service_area, _target_audience
  ) AS created;

  UPDATE public.workspaces
  SET data_source = 'os_data'
  WHERE workspaces.id = _created.id AND workspaces.created_by = _uid;

  INSERT INTO public.workspace_social_subscriptions (
    workspace_id, plan, status, account_limit, trial_started_at, trial_ends_at
  ) VALUES (
    _created.id, 'trial', 'trialing', 2, now(), now() + interval '30 days'
  ) ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO public.activity_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _created.id, _uid, 'os_trial_started', 'workspace', _created.id,
    jsonb_build_object('account_limit', 2, 'trial_days', 30)
  );

  RETURN QUERY SELECT _created.id, _created.slug, _created.name;
END;
$$;

REVOKE ALL ON FUNCTION public.create_os_trial_workspace(
  text,text,text,text,text,text,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_os_trial_workspace(
  text,text,text,text,text,text,text,text
) TO authenticated;
