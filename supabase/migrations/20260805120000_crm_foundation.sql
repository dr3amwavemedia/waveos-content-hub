-- WaveCRM foundation. All CRM data is internal to Dream Wave Media staff.
DO $$ BEGIN
  CREATE TYPE public.crm_pipeline_stage AS ENUM (
    'new_lead','contacted','discovery_scheduled','qualified','proposal_sent',
    'negotiating','won','lost','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_task_status AS ENUM ('open','in_progress','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.crm_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL CHECK (char_length(btrim(business_name)) BETWEEN 2 AND 160),
  website text,
  phone text,
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text NOT NULL DEFAULT 'US',
  industry text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(social_links) = 'object'),
  interested_services text[] NOT NULL DEFAULT '{}',
  lead_source text,
  referral_name text,
  stage public.crm_pipeline_stage NOT NULL DEFAULT 'new_lead',
  priority public.crm_priority NOT NULL DEFAULT 'normal',
  estimated_value_cents integer CHECK (estimated_value_cents IS NULL OR estimated_value_cents >= 0),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  preferred_contact_method text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  linked_workspace_id uuid UNIQUE REFERENCES public.workspaces(id) ON DELETE SET NULL,
  converted_at timestamptz,
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 80),
  last_name text,
  job_title text,
  email text,
  phone text,
  preferred_contact_method text,
  is_primary boolean NOT NULL DEFAULT false,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(social_links) = 'object'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_one_primary_per_account
  ON public.crm_contacts(account_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS public.crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  priority public.crm_priority NOT NULL DEFAULT 'normal',
  status public.crm_task_status NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  activity_type text NOT NULL CHECK (char_length(activity_type) BETWEEN 1 AND 60),
  summary text NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 1 AND 500),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_accounts_stage_idx ON public.crm_accounts(stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_accounts_follow_up_idx ON public.crm_accounts(next_follow_up_at) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_accounts_assignee_idx ON public.crm_accounts(assigned_to, stage);
CREATE INDEX IF NOT EXISTS crm_contacts_account_idx ON public.crm_contacts(account_id);
CREATE INDEX IF NOT EXISTS crm_contacts_email_idx ON public.crm_contacts(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_tasks_due_idx ON public.crm_tasks(status, due_at);
CREATE INDEX IF NOT EXISTS crm_tasks_assignee_idx ON public.crm_tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS crm_notes_account_idx ON public.crm_notes(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_activities_account_idx ON public.crm_activities(account_id, occurred_at DESC);

ALTER TABLE public.crm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.crm_accounts, public.crm_contacts, public.crm_notes, public.crm_tasks, public.crm_activities FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_accounts, public.crm_contacts, public.crm_notes, public.crm_tasks, public.crm_activities TO authenticated;
GRANT ALL ON public.crm_accounts, public.crm_contacts, public.crm_notes, public.crm_tasks, public.crm_activities TO service_role;

DROP POLICY IF EXISTS "staff manage crm accounts" ON public.crm_accounts;
CREATE POLICY "staff manage crm accounts" ON public.crm_accounts FOR ALL TO authenticated
  USING ((select public.is_dream_wave_staff((select auth.uid()))))
  WITH CHECK ((select public.is_dream_wave_staff((select auth.uid()))));
DROP POLICY IF EXISTS "staff manage crm contacts" ON public.crm_contacts;
CREATE POLICY "staff manage crm contacts" ON public.crm_contacts FOR ALL TO authenticated
  USING ((select public.is_dream_wave_staff((select auth.uid()))))
  WITH CHECK ((select public.is_dream_wave_staff((select auth.uid()))));
DROP POLICY IF EXISTS "staff manage crm notes" ON public.crm_notes;
CREATE POLICY "staff manage crm notes" ON public.crm_notes FOR ALL TO authenticated
  USING ((select public.is_dream_wave_staff((select auth.uid()))))
  WITH CHECK ((select public.is_dream_wave_staff((select auth.uid()))));
DROP POLICY IF EXISTS "staff manage crm tasks" ON public.crm_tasks;
CREATE POLICY "staff manage crm tasks" ON public.crm_tasks FOR ALL TO authenticated
  USING ((select public.is_dream_wave_staff((select auth.uid()))))
  WITH CHECK ((select public.is_dream_wave_staff((select auth.uid()))));
DROP POLICY IF EXISTS "staff manage crm activities" ON public.crm_activities;
CREATE POLICY "staff manage crm activities" ON public.crm_activities FOR ALL TO authenticated
  USING ((select public.is_dream_wave_staff((select auth.uid()))))
  WITH CHECK ((select public.is_dream_wave_staff((select auth.uid()))));

CREATE OR REPLACE FUNCTION public.crm_set_updated_by()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_TABLE_NAME = 'crm_accounts' THEN NEW.updated_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_set_updated_by() FROM PUBLIC;

DROP TRIGGER IF EXISTS crm_accounts_updated_at ON public.crm_accounts;
CREATE TRIGGER crm_accounts_updated_at BEFORE UPDATE ON public.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_by();
DROP TRIGGER IF EXISTS crm_contacts_updated_at ON public.crm_contacts;
CREATE TRIGGER crm_contacts_updated_at BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS crm_notes_updated_at ON public.crm_notes;
CREATE TRIGGER crm_notes_updated_at BEFORE UPDATE ON public.crm_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS crm_tasks_updated_at ON public.crm_tasks;
CREATE TRIGGER crm_tasks_updated_at BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.crm_log_account_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_activities(account_id, actor_id, activity_type, summary)
    VALUES (NEW.id, auth.uid(), 'account_created', 'Lead added to WaveCRM');
  ELSIF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.crm_activities(account_id, actor_id, activity_type, summary, safe_metadata)
    VALUES (NEW.id, auth.uid(), 'stage_changed', 'Pipeline stage changed',
      jsonb_build_object('from', OLD.stage, 'to', NEW.stage));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_log_account_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS crm_accounts_activity ON public.crm_accounts;
CREATE TRIGGER crm_accounts_activity AFTER INSERT OR UPDATE ON public.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.crm_log_account_change();

CREATE OR REPLACE FUNCTION public.crm_find_duplicates(_email text, _phone text, _business_name text)
RETURNS TABLE(account_id uuid, business_name text, match_reason text)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT DISTINCT a.id, a.business_name,
    CASE
      WHEN _email IS NOT NULL AND lower(coalesce(a.email, c.email)) = lower(_email) THEN 'email'
      WHEN _phone IS NOT NULL AND regexp_replace(coalesce(a.phone, c.phone, ''), '\\D', '', 'g') = regexp_replace(_phone, '\\D', '', 'g') THEN 'phone'
      ELSE 'business_name'
    END
  FROM public.crm_accounts a
  LEFT JOIN public.crm_contacts c ON c.account_id = a.id
  WHERE public.is_dream_wave_staff(auth.uid())
    AND (
      (_email IS NOT NULL AND lower(coalesce(a.email, c.email)) = lower(_email)) OR
      (_phone IS NOT NULL AND length(regexp_replace(_phone, '\\D', '', 'g')) >= 7 AND regexp_replace(coalesce(a.phone, c.phone, ''), '\\D', '', 'g') = regexp_replace(_phone, '\\D', '', 'g')) OR
      (_business_name IS NOT NULL AND lower(a.business_name) = lower(_business_name))
    )
  LIMIT 10;
$$;
REVOKE ALL ON FUNCTION public.crm_find_duplicates(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_find_duplicates(text,text,text) TO authenticated;
