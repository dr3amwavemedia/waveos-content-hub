CREATE TABLE IF NOT EXISTS public.publishing_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  paused boolean NOT NULL DEFAULT false,
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publishing_controls_scope_unique UNIQUE NULLS NOT DISTINCT (workspace_id)
);

CREATE TABLE IF NOT EXISTS public.social_subscription_lifecycle (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','grace','disconnected','retention','archived','error')),
  reason text,
  inactive_since timestamptz,
  disconnect_at timestamptz,
  disconnected_at timestamptz,
  archive_at timestamptz,
  archived_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.publishing_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_subscription_lifecycle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publishing_controls, public.social_subscription_lifecycle FROM anon, authenticated;
GRANT ALL ON public.publishing_controls, public.social_subscription_lifecycle TO service_role;

CREATE INDEX IF NOT EXISTS publish_attempts_stale_sending_idx
  ON public.publish_attempts (attempted_at)
  WHERE status = 'sending';
CREATE INDEX IF NOT EXISTS social_lifecycle_due_idx
  ON public.social_subscription_lifecycle (state, disconnect_at, archive_at);

COMMENT ON TABLE public.social_subscription_lifecycle IS
  'Service-only lifecycle queue. Access locks immediately; Zernio disconnects after seven days; inactive workspaces archive after six months.';