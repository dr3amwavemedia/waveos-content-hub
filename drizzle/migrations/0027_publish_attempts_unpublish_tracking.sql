ALTER TABLE public.publish_attempts
  ADD COLUMN IF NOT EXISTS unpublished_at timestamptz,
  ADD COLUMN IF NOT EXISTS unpublish_error text,
  ADD COLUMN IF NOT EXISTS unpublish_response jsonb,
  ADD COLUMN IF NOT EXISTS unpublished_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.publish_attempts.unpublished_at IS 'When a workspace manager removed the live platform post through Zernio; the attempt row is kept as history.';
COMMENT ON COLUMN public.publish_attempts.unpublish_error IS 'Last safe, user-readable reason a platform removal failed.';

CREATE INDEX IF NOT EXISTS publish_attempts_duplicate_guard_idx
  ON public.publish_attempts (workspace_id, platform, ((request_snapshot ->> 'waveosFingerprint')), attempted_at)
  WHERE status = 'success' AND unpublished_at IS NULL;