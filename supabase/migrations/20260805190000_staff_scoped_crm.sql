-- CRM isolation: owners manage the full pipeline; team members only access
-- leads and related CRM records assigned to their own auth user.

CREATE OR REPLACE FUNCTION public.crm_assign_new_staff_work()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _uid uuid := (select auth.uid());
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.has_role(_uid, 'dream_wave_owner') THEN RETURN NEW; END IF;
  IF NOT public.has_role(_uid, 'dream_wave_team') THEN RAISE EXCEPTION 'staff_required'; END IF;
  NEW.assigned_to := _uid;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_assign_new_staff_work() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS crm_accounts_assign_new_staff_work ON public.crm_accounts;
CREATE TRIGGER crm_accounts_assign_new_staff_work
  BEFORE INSERT ON public.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.crm_assign_new_staff_work();

DROP TRIGGER IF EXISTS crm_tasks_assign_new_staff_work ON public.crm_tasks;
CREATE TRIGGER crm_tasks_assign_new_staff_work
  BEFORE INSERT ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_assign_new_staff_work();

DROP POLICY IF EXISTS "staff manage crm accounts" ON public.crm_accounts;
DROP POLICY IF EXISTS "staff view crm accounts" ON public.crm_accounts;
DROP POLICY IF EXISTS "staff create crm accounts" ON public.crm_accounts;
DROP POLICY IF EXISTS "staff update crm accounts" ON public.crm_accounts;
DROP POLICY IF EXISTS "owners delete crm accounts" ON public.crm_accounts;
DROP POLICY IF EXISTS "owners manage all crm accounts" ON public.crm_accounts;
DROP POLICY IF EXISTS "staff view assigned crm accounts" ON public.crm_accounts;
DROP POLICY IF EXISTS "staff create assigned crm accounts" ON public.crm_accounts;
DROP POLICY IF EXISTS "staff update assigned crm accounts" ON public.crm_accounts;

CREATE POLICY "owners manage all crm accounts"
  ON public.crm_accounts FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'dream_wave_owner'))
  WITH CHECK (public.has_role((select auth.uid()), 'dream_wave_owner'));

CREATE POLICY "staff view assigned crm accounts"
  ON public.crm_accounts FOR SELECT TO authenticated
  USING (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND assigned_to = (select auth.uid())
  );

CREATE POLICY "staff create assigned crm accounts"
  ON public.crm_accounts FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND assigned_to = (select auth.uid())
  );

CREATE POLICY "staff update assigned crm accounts"
  ON public.crm_accounts FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND assigned_to = (select auth.uid())
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND assigned_to = (select auth.uid())
  );

DROP POLICY IF EXISTS "staff manage crm contacts" ON public.crm_contacts;
DROP POLICY IF EXISTS "owners manage all crm contacts" ON public.crm_contacts;
DROP POLICY IF EXISTS "staff manage contacts for assigned accounts" ON public.crm_contacts;
CREATE POLICY "owners manage all crm contacts"
  ON public.crm_contacts FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'dream_wave_owner'))
  WITH CHECK (public.has_role((select auth.uid()), 'dream_wave_owner'));
CREATE POLICY "staff manage contacts for assigned accounts"
  ON public.crm_contacts FOR ALL TO authenticated
  USING (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND EXISTS (
      SELECT 1 FROM public.crm_accounts AS account
      WHERE account.id = crm_contacts.account_id
        AND account.assigned_to = (select auth.uid())
    )
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND EXISTS (
      SELECT 1 FROM public.crm_accounts AS account
      WHERE account.id = crm_contacts.account_id
        AND account.assigned_to = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "staff manage crm notes" ON public.crm_notes;
DROP POLICY IF EXISTS "owners manage all crm notes" ON public.crm_notes;
DROP POLICY IF EXISTS "staff manage notes for assigned accounts" ON public.crm_notes;
CREATE POLICY "owners manage all crm notes"
  ON public.crm_notes FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'dream_wave_owner'))
  WITH CHECK (public.has_role((select auth.uid()), 'dream_wave_owner'));
CREATE POLICY "staff manage notes for assigned accounts"
  ON public.crm_notes FOR ALL TO authenticated
  USING (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND EXISTS (
      SELECT 1 FROM public.crm_accounts AS account
      WHERE account.id = crm_notes.account_id
        AND account.assigned_to = (select auth.uid())
    )
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND author_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.crm_accounts AS account
      WHERE account.id = crm_notes.account_id
        AND account.assigned_to = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "staff manage crm tasks" ON public.crm_tasks;
DROP POLICY IF EXISTS "owners manage all crm tasks" ON public.crm_tasks;
DROP POLICY IF EXISTS "staff manage assigned crm tasks" ON public.crm_tasks;
CREATE POLICY "owners manage all crm tasks"
  ON public.crm_tasks FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'dream_wave_owner'))
  WITH CHECK (public.has_role((select auth.uid()), 'dream_wave_owner'));
CREATE POLICY "staff manage assigned crm tasks"
  ON public.crm_tasks FOR ALL TO authenticated
  USING (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND assigned_to = (select auth.uid())
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND assigned_to = (select auth.uid())
    AND (
      account_id IS NULL OR EXISTS (
        SELECT 1 FROM public.crm_accounts AS account
        WHERE account.id = crm_tasks.account_id
          AND account.assigned_to = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "staff manage crm activities" ON public.crm_activities;
DROP POLICY IF EXISTS "owners manage all crm activities" ON public.crm_activities;
DROP POLICY IF EXISTS "staff manage activities for assigned accounts" ON public.crm_activities;
CREATE POLICY "owners manage all crm activities"
  ON public.crm_activities FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'dream_wave_owner'))
  WITH CHECK (public.has_role((select auth.uid()), 'dream_wave_owner'));
CREATE POLICY "staff manage activities for assigned accounts"
  ON public.crm_activities FOR ALL TO authenticated
  USING (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND EXISTS (
      SELECT 1 FROM public.crm_accounts AS account
      WHERE account.id = crm_activities.account_id
        AND account.assigned_to = (select auth.uid())
    )
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'dream_wave_team')
    AND actor_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.crm_accounts AS account
      WHERE account.id = crm_activities.account_id
        AND account.assigned_to = (select auth.uid())
    )
  );
