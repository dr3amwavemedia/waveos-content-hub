CREATE TABLE public.email_automation_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  client_notifications_enabled boolean NOT NULL DEFAULT false,
  staff_notifications_enabled boolean NOT NULL DEFAULT false,
  project_reminders_enabled boolean NOT NULL DEFAULT true,
  invoice_reminders_enabled boolean NOT NULL DEFAULT true,
  upload_notifications_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.email_automation_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.email_automation_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('project', 'invoice')),
  entity_id uuid NOT NULL,
  reminder_day integer NOT NULL,
  recipient_email text NOT NULL,
  provider_message_id text,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, reminder_day, recipient_email)
);

CREATE INDEX email_automation_deliveries_workspace_created_idx
  ON public.email_automation_deliveries(workspace_id, created_at DESC);

ALTER TABLE public.email_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_automation_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_automation_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.email_automation_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.email_automation_settings TO authenticated;
GRANT ALL ON public.email_automation_settings, public.email_automation_deliveries TO service_role;

CREATE POLICY "owners view email automation settings"
  ON public.email_automation_settings FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));
CREATE POLICY "owners update email automation settings"
  ON public.email_automation_settings FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

CREATE TRIGGER email_automation_settings_updated_at
  BEFORE UPDATE ON public.email_automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
