-- Keep the shared Lovable/Supabase media pool below its 2 GB allowance.
-- Local uploads are capped at 300 MB each, 500 MB per workspace, and
-- 1.5 GB globally so publishing and database operations retain headroom.

UPDATE storage.buckets
SET file_size_limit = 314572800,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']
WHERE id = 'media';

CREATE OR REPLACE FUNCTION public.workspace_media_storage_usage(_workspace_id uuid)
RETURNS TABLE(used_bytes bigint, limit_bytes bigint, remaining_bytes bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _used bigint;
  _limit constant bigint := 524288000;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_workspace_member(auth.uid(), _workspace_id)
    OR public.is_dream_wave_staff(auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(SUM(size_bytes), 0)::bigint
  INTO _used
  FROM public.media_assets
  WHERE workspace_id = _workspace_id
    AND source_provider = 'waveos'
    AND storage_path IS NOT NULL
    AND archived_at IS NULL;

  RETURN QUERY SELECT _used, _limit, GREATEST(_limit - _used, 0::bigint);
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_media_storage_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_media_storage_usage(uuid) TO authenticated;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.enforce_media_storage_quotas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_used bigint;
  _global_used bigint;
  _workspace_limit constant bigint := 524288000;
  _global_limit constant bigint := 1610612736;
  _file_limit constant bigint := 314572800;
BEGIN
  IF NEW.source_provider <> 'waveos' OR NEW.storage_path IS NULL OR NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.size_bytes > _file_limit THEN
    RAISE EXCEPTION 'media_file_limit_exceeded';
  END IF;

  SELECT COALESCE(SUM(size_bytes), 0)::bigint INTO _workspace_used
  FROM public.media_assets
  WHERE workspace_id = NEW.workspace_id
    AND source_provider = 'waveos'
    AND storage_path IS NOT NULL
    AND archived_at IS NULL
    AND id <> NEW.id;

  IF _workspace_used + NEW.size_bytes > _workspace_limit THEN
    RAISE EXCEPTION 'workspace_media_quota_exceeded';
  END IF;

  SELECT COALESCE(SUM(size_bytes), 0)::bigint INTO _global_used
  FROM public.media_assets
  WHERE source_provider = 'waveos'
    AND storage_path IS NOT NULL
    AND archived_at IS NULL
    AND id <> NEW.id;

  IF _global_used + NEW.size_bytes > _global_limit THEN
    RAISE EXCEPTION 'global_media_safety_limit_exceeded';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_media_storage_quotas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_media_storage_quotas ON public.media_assets;
CREATE TRIGGER enforce_media_storage_quotas
  BEFORE INSERT OR UPDATE OF size_bytes, storage_path, archived_at ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION private.enforce_media_storage_quotas();
