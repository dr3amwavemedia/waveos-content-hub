-- SignWell webhook requests only record authoritative state. Slow PDF, Storage,
-- and email work is claimed from this service-role queue by the five-minute
-- maintenance route, with a lease so overlapping cron runs cannot duplicate it.
CREATE TABLE IF NOT EXISTS public.signwell_completion_jobs (
  contract_id uuid PRIMARY KEY REFERENCES public.client_contracts(id) ON DELETE CASCADE,
  provider_document_id text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'processing', 'complete', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  archive_completed_at timestamptz,
  email_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS provider_status_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS signwell_completion_jobs_due_idx
  ON public.signwell_completion_jobs(next_attempt_at, created_at)
  WHERE state IN ('pending', 'processing');

CREATE UNIQUE INDEX IF NOT EXISTS client_contracts_signwell_document_uidx
  ON public.client_contracts(provider_document_id)
  WHERE provider = 'signwell' AND provider_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_contracts_signwell_status_idx
  ON public.client_contracts(status, signed_at)
  WHERE provider = 'signwell' AND provider_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_contracts_signwell_check_idx
  ON public.client_contracts(provider_status_checked_at, created_at)
  WHERE provider = 'signwell'
    AND provider_document_id IS NOT NULL
    AND status IN ('draft', 'sent', 'viewed');

CREATE INDEX IF NOT EXISTS webhook_events_source_external_idx
  ON public.webhook_events(source, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.signwell_completion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signwell_completion_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.signwell_completion_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_signwell_completion_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.provider IS NOT DISTINCT FROM OLD.provider
     AND NEW.provider_document_id IS NOT DISTINCT FROM OLD.provider_document_id THEN
    RETURN NEW;
  END IF;

  IF NEW.provider = 'signwell'
     AND NEW.status = 'signed'
     AND NEW.provider_document_id IS NOT NULL THEN
    INSERT INTO public.signwell_completion_jobs(contract_id, provider_document_id)
    VALUES (NEW.id, NEW.provider_document_id)
    ON CONFLICT (contract_id) DO UPDATE SET
      provider_document_id = EXCLUDED.provider_document_id,
      attempts = CASE
        WHEN public.signwell_completion_jobs.provider_document_id = EXCLUDED.provider_document_id
          AND public.signwell_completion_jobs.state <> 'dead'
        THEN public.signwell_completion_jobs.attempts
        ELSE 0
      END,
      state = CASE
        WHEN public.signwell_completion_jobs.provider_document_id = EXCLUDED.provider_document_id
          AND public.signwell_completion_jobs.state = 'complete'
        THEN 'complete'
        ELSE 'pending'
      END,
      next_attempt_at = CASE
        WHEN public.signwell_completion_jobs.provider_document_id = EXCLUDED.provider_document_id
          AND public.signwell_completion_jobs.state = 'complete'
        THEN public.signwell_completion_jobs.next_attempt_at
        ELSE now()
      END,
      locked_at = NULL,
      last_error = NULL,
      archive_completed_at = CASE
        WHEN public.signwell_completion_jobs.provider_document_id = EXCLUDED.provider_document_id
        THEN public.signwell_completion_jobs.archive_completed_at
        ELSE NULL
      END,
      email_completed_at = CASE
        WHEN public.signwell_completion_jobs.provider_document_id = EXCLUDED.provider_document_id
        THEN public.signwell_completion_jobs.email_completed_at
        ELSE NULL
      END,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_signwell_completion_job()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enqueue_signwell_completion_job ON public.client_contracts;
CREATE TRIGGER enqueue_signwell_completion_job
  AFTER INSERT OR UPDATE OF status, provider, provider_document_id
  ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_signwell_completion_job();

-- Existing signed records predate this queue. Preserve their prior email state
-- to avoid re-notifying clients; only a missing certified archive is backfilled.
INSERT INTO public.signwell_completion_jobs (
  contract_id,
  provider_document_id,
  state,
  archive_completed_at,
  email_completed_at
)
SELECT
  contract.id,
  contract.provider_document_id,
  CASE WHEN archive.id IS NULL THEN 'pending' ELSE 'complete' END,
  archive.created_at,
  now()
FROM public.client_contracts AS contract
LEFT JOIN public.contract_signature_archive AS archive
  ON archive.provider_document_id = contract.provider_document_id
WHERE contract.provider = 'signwell'
  AND contract.status = 'signed'
  AND contract.provider_document_id IS NOT NULL
ON CONFLICT (contract_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_signwell_completion_jobs(_limit integer DEFAULT 3)
RETURNS SETOF public.signwell_completion_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT job.contract_id
    FROM public.signwell_completion_jobs AS job
    WHERE (
      job.state = 'pending'
      AND job.next_attempt_at <= now()
    ) OR (
      job.state = 'processing'
      AND job.locked_at < now() - interval '10 minutes'
    )
    ORDER BY job.next_attempt_at, job.created_at
    LIMIT least(greatest(coalesce(_limit, 3), 1), 10)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.signwell_completion_jobs AS job
  SET state = 'processing',
      attempts = job.attempts + 1,
      locked_at = now(),
      last_error = NULL,
      updated_at = now()
  FROM due
  WHERE job.contract_id = due.contract_id
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_signwell_completion_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_signwell_completion_jobs(integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
