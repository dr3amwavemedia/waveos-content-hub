-- PostgREST upserts require an ordinary unique constraint that exactly
-- matches the columns named by on_conflict. The previous partial unique
-- index protected external rows, but PostgreSQL could not use it for the
-- media import upsert.

DROP INDEX IF EXISTS public.media_assets_external_source_idx;

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_external_source_key;

ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_external_source_key
  UNIQUE (workspace_id, source_provider, external_file_id);

COMMENT ON CONSTRAINT media_assets_external_source_key ON public.media_assets IS
  'Allows Google Drive and Dropbox file-reference upserts without storing media bytes.';
