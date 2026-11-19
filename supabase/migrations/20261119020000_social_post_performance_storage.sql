-- Additive storage for per-post social performance, history backfill health and
-- confirmed leads. Creates new tables only; existing tables and data are untouched.

CREATE TABLE IF NOT EXISTS public.social_post_metric_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content_item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  post_variant_id uuid REFERENCES public.post_variants(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 40),
  provider_account_id text NOT NULL CHECK (char_length(provider_account_id) BETWEEN 1 AND 200),
  provider_post_id text NOT NULL CHECK (char_length(provider_post_id) BETWEEN 1 AND 300),
  platform text NOT NULL CHECK (char_length(platform) BETWEEN 1 AND 40),
  content_type text NOT NULL CHECK (content_type IN ('post', 'reel', 'story', 'video', 'carousel', 'short')),
  metric_key text NOT NULL CHECK (metric_key IN (
    'followers', 'impressions', 'reach', 'likes', 'comments', 'shares', 'saves',
    'clicks', 'messages', 'views', 'storyViews'
  )),
  value numeric CHECK (value IS NULL OR value >= 0),
  availability text NOT NULL CHECK (availability IN (
    'available', 'true_zero', 'not_synced', 'permission_missing',
    'connection_expired', 'sync_failed', 'unsupported'
  )),
  granularity text NOT NULL CHECK (granularity IN ('daily', 'lifetime')),
  window_start date NOT NULL,
  window_end date NOT NULL CHECK (window_end >= window_start),
  captured_at timestamptz NOT NULL DEFAULT now(),
  provider_data_as_of timestamptz,
  source_reference text NOT NULL,
  calculation_version text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT social_post_metric_observations_identity UNIQUE (
    workspace_id, provider, platform, provider_account_id, provider_post_id,
    metric_key, granularity, window_start, window_end
  )
);

CREATE INDEX IF NOT EXISTS social_post_metric_observations_workspace_window_idx
  ON public.social_post_metric_observations (workspace_id, window_start DESC);
CREATE INDEX IF NOT EXISTS social_post_metric_observations_content_idx
  ON public.social_post_metric_observations (content_item_id)
  WHERE content_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.social_metric_backfill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  platform text NOT NULL,
  requested_range_start date NOT NULL,
  requested_range_end date NOT NULL,
  covered_range_start date,
  covered_range_end date,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'partial', 'complete', 'failed', 'unsupported'
  )),
  safe_message text CHECK (safe_message IS NULL OR char_length(safe_message) <= 500),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  records_stored integer NOT NULL DEFAULT 0 CHECK (records_stored >= 0),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One current run per account; reruns update this row instead of racing.
  CONSTRAINT social_metric_backfill_runs_current UNIQUE (
    workspace_id, provider, platform, provider_account_id
  )
);

CREATE TABLE IF NOT EXISTS public.social_lead_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) BETWEEN 3 AND 320),
  source text NOT NULL CHECK (source IN ('manual', 'crm', 'form')),
  crm_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  crm_account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  provider text,
  platform text,
  provider_account_id text,
  provider_post_id text,
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_lead_conversions_dedupe UNIQUE (workspace_id, dedupe_key),
  CONSTRAINT social_lead_conversions_post_identity CHECK (
    provider_post_id IS NULL
    OR (provider IS NOT NULL AND platform IS NOT NULL AND provider_account_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS social_lead_conversions_workspace_confirmed_idx
  ON public.social_lead_conversions (workspace_id, confirmed_at DESC);

REVOKE ALL ON public.social_post_metric_observations FROM PUBLIC, anon;
REVOKE ALL ON public.social_metric_backfill_runs FROM PUBLIC, anon;
REVOKE ALL ON public.social_lead_conversions FROM PUBLIC, anon;

GRANT SELECT ON public.social_post_metric_observations TO authenticated;
GRANT SELECT ON public.social_metric_backfill_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_lead_conversions TO authenticated;
GRANT ALL ON public.social_post_metric_observations TO service_role;
GRANT ALL ON public.social_metric_backfill_runs TO service_role;
GRANT ALL ON public.social_lead_conversions TO service_role;

ALTER TABLE public.social_post_metric_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_metric_backfill_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_lead_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members read post metrics" ON public.social_post_metric_observations;
CREATE POLICY "Workspace members read post metrics"
  ON public.social_post_metric_observations FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
  );

DROP POLICY IF EXISTS "Workspace members read backfill health" ON public.social_metric_backfill_runs;
CREATE POLICY "Workspace members read backfill health"
  ON public.social_metric_backfill_runs FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
  );

DROP POLICY IF EXISTS "Workspace members read confirmed leads" ON public.social_lead_conversions;
CREATE POLICY "Workspace members read confirmed leads"
  ON public.social_lead_conversions FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
  );

DROP POLICY IF EXISTS "Managers add confirmed leads" ON public.social_lead_conversions;
CREATE POLICY "Managers add confirmed leads"
  ON public.social_lead_conversions FOR INSERT TO authenticated
  WITH CHECK (
    confirmed_by = (SELECT auth.uid())
    AND (
      public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
      OR EXISTS (
        SELECT 1 FROM public.workspace_members AS m
        WHERE m.workspace_id = social_lead_conversions.workspace_id
          AND m.user_id = (SELECT auth.uid())
          AND m.role IN ('owner', 'admin')
      )
    )
  );

DROP POLICY IF EXISTS "Managers update confirmed leads" ON public.social_lead_conversions;
CREATE POLICY "Managers update confirmed leads"
  ON public.social_lead_conversions FOR UPDATE TO authenticated
  USING (
    public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members AS m
      WHERE m.workspace_id = social_lead_conversions.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members AS m
      WHERE m.workspace_id = social_lead_conversions.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Managers delete confirmed leads" ON public.social_lead_conversions;
CREATE POLICY "Managers delete confirmed leads"
  ON public.social_lead_conversions FOR DELETE TO authenticated
  USING (
    public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    OR EXISTS (
      SELECT 1 FROM public.workspace_members AS m
      WHERE m.workspace_id = social_lead_conversions.workspace_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
  );
