-- Additive: per-asset speech-to-text transcripts. Writes happen only through
-- authenticated server functions (service role) so status can never be marked
-- completed without a real speech-to-text result.
CREATE TABLE public.media_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'no_speech', 'failed')),
  audio_source text
    CHECK (audio_source IS NULL OR audio_source IN ('device_extracted_audio', 'original_file')),
  provider text,
  model text,
  language text,
  transcript_text text,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_timestamps boolean NOT NULL DEFAULT false,
  key_moments jsonb NOT NULL DEFAULT '[]'::jsonb,
  audio_seconds numeric,
  edited_text text,
  edited_segments jsonb,
  edited_by uuid,
  edited_at timestamptz,
  error_code text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  requested_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_asset_id)
);

CREATE INDEX media_transcripts_workspace_idx ON public.media_transcripts (workspace_id, updated_at DESC);

GRANT SELECT ON public.media_transcripts TO authenticated;
GRANT ALL ON public.media_transcripts TO service_role;

ALTER TABLE public.media_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members view media transcripts"
  ON public.media_transcripts
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));