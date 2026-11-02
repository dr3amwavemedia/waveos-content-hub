-- Additive Mac handoff foundations. Existing campaign rows retain the
-- conservative approval-required behavior and no billing/auth tables change.

ALTER TABLE public.campaign_plans
  ADD COLUMN IF NOT EXISTS optimization_mode text NOT NULL DEFAULT 'approval_required';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_plans_optimization_mode_check'
      AND conrelid = 'public.campaign_plans'::regclass
  ) THEN
    ALTER TABLE public.campaign_plans
      ADD CONSTRAINT campaign_plans_optimization_mode_check
      CHECK (optimization_mode IN ('automatic', 'approval_required'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text NOT NULL CHECK (feature ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_.-]{1,39}$'),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count = 1),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  estimated_cost_micros bigint CHECK (estimated_cost_micros IS NULL OR estimated_cost_micros >= 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status text NOT NULL CHECK (status IN ('succeeded', 'provider_error', 'invalid_response')),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_.-]{1,80}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_workspace_created_idx
  ON public.ai_usage_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_status_created_idx
  ON public.ai_usage_events(status, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_usage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ai_usage_events TO service_role;

COMMENT ON TABLE public.ai_usage_events IS
  'Server-only AI request telemetry. Contains usage totals and safe failure codes, never prompts, generated content, credentials, or provider payloads.';

NOTIFY pgrst, 'reload schema';
