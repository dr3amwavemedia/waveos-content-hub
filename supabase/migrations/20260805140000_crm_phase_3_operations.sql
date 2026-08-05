-- WaveCRM Phase 3: team ownership, follow-up accountability, and communication logging.

CREATE INDEX IF NOT EXISTS crm_accounts_active_assignee_follow_up_idx
  ON public.crm_accounts (assigned_to, next_follow_up_at)
  WHERE archived_at IS NULL AND stage NOT IN ('won', 'lost', 'archived');

CREATE INDEX IF NOT EXISTS crm_tasks_active_assignee_due_idx
  ON public.crm_tasks (assigned_to, due_at)
  WHERE status IN ('open', 'in_progress');

CREATE OR REPLACE FUNCTION public.crm_protect_assignment_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
     AND NOT public.has_role((select auth.uid()), 'dream_wave_owner') THEN
    RAISE EXCEPTION 'owner_required_for_reassignment';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_protect_assignment_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS crm_accounts_protect_assignment ON public.crm_accounts;
CREATE TRIGGER crm_accounts_protect_assignment
  BEFORE UPDATE OF assigned_to ON public.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.crm_protect_assignment_changes();

DROP TRIGGER IF EXISTS crm_tasks_protect_assignment ON public.crm_tasks;
CREATE TRIGGER crm_tasks_protect_assignment
  BEFORE UPDATE OF assigned_to ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_protect_assignment_changes();

CREATE OR REPLACE FUNCTION public.crm_log_communication(
  _account_id uuid,
  _activity_type text,
  _summary text,
  _occurred_at timestamptz DEFAULT now(),
  _next_action text DEFAULT NULL,
  _next_due_at timestamptz DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _activity_id uuid;
  _actor uuid := (select auth.uid());
BEGIN
  IF _actor IS NULL OR NOT public.is_dream_wave_staff(_actor) THEN
    RAISE EXCEPTION 'staff_required';
  END IF;
  IF _activity_type NOT IN ('call', 'email', 'meeting', 'proposal', 'client_check_in') THEN
    RAISE EXCEPTION 'invalid_communication_type';
  END IF;
  IF char_length(btrim(_summary)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_summary';
  END IF;
  IF _assigned_to IS NOT NULL AND _assigned_to <> _actor
     AND NOT public.has_role(_actor, 'dream_wave_owner') THEN
    RAISE EXCEPTION 'owner_required_for_reassignment';
  END IF;

  INSERT INTO public.crm_activities (
    account_id, actor_id, activity_type, summary, occurred_at, safe_metadata
  ) VALUES (
    _account_id, _actor, _activity_type, btrim(_summary), coalesce(_occurred_at, now()),
    jsonb_build_object('next_action', nullif(btrim(coalesce(_next_action, '')), ''))
  ) RETURNING id INTO _activity_id;

  UPDATE public.crm_accounts
     SET last_contacted_at = coalesce(_occurred_at, now()),
         next_follow_up_at = CASE
           WHEN nullif(btrim(coalesce(_next_action, '')), '') IS NOT NULL THEN _next_due_at
           ELSE next_follow_up_at
         END
   WHERE id = _account_id;

  IF nullif(btrim(coalesce(_next_action, '')), '') IS NOT NULL THEN
    INSERT INTO public.crm_tasks (
      account_id, title, assigned_to, due_at, priority, created_by
    ) VALUES (
      _account_id, btrim(_next_action), coalesce(_assigned_to, _actor), _next_due_at,
      'normal', _actor
    );
  END IF;

  RETURN _activity_id;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_log_communication(uuid,text,text,timestamptz,text,timestamptz,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_log_communication(uuid,text,text,timestamptz,text,timestamptz,uuid)
  TO authenticated;

-- Data API access is explicit; RLS policies from the CRM foundation remain authoritative.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.crm_accounts, public.crm_contacts, public.crm_notes,
  public.crm_tasks, public.crm_activities TO authenticated;
REVOKE ALL ON
  public.crm_accounts, public.crm_contacts, public.crm_notes,
  public.crm_tasks, public.crm_activities FROM anon;
