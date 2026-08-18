CREATE TABLE public.transactional_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  invite_id uuid REFERENCES public.invites(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  recipient_email text NOT NULL,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transactional_email_log_workspace_created_idx
  ON public.transactional_email_log(workspace_id, created_at DESC);

ALTER TABLE public.transactional_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transactional_email_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.transactional_email_log TO service_role;