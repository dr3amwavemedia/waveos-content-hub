
-- Dream Wave Vision Studio (owner-only administration)
CREATE TYPE public.vision_deck_status AS ENUM ('draft', 'ready', 'archived');

CREATE TABLE public.vision_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  company_name TEXT NOT NULL CHECK (char_length(company_name) BETWEEN 1 AND 160),
  prospect_name TEXT,
  prospect_email TEXT,
  status public.vision_deck_status NOT NULL DEFAULT 'draft',
  content JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(content) = 'object'),
  accent_color TEXT NOT NULL DEFAULT '#4db8ff'
    CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  share_token TEXT NOT NULL UNIQUE DEFAULT (
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', '')
  ),
  share_enabled BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vision_decks_status_updated_idx
  ON public.vision_decks (status, updated_at DESC);

CREATE TRIGGER update_vision_decks_updated_at
  BEFORE UPDATE ON public.vision_decks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_decks TO authenticated;
GRANT ALL ON public.vision_decks TO service_role;

ALTER TABLE public.vision_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dream Wave owners can view vision decks"
  ON public.vision_decks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'));

CREATE POLICY "Dream Wave owners can create vision decks"
  ON public.vision_decks FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'dream_wave_owner')
    AND created_by = auth.uid()
    AND updated_by = auth.uid()
  );

CREATE POLICY "Dream Wave owners can update vision decks"
  ON public.vision_decks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'dream_wave_owner'));

CREATE POLICY "Dream Wave owners can delete vision decks"
  ON public.vision_decks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'));

CREATE TABLE public.vision_deck_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES public.vision_decks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('opened', 'slide_viewed')),
  slide_key TEXT,
  session_id TEXT NOT NULL CHECK (char_length(session_id) BETWEEN 1 AND 100),
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(safe_metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vision_deck_events_deck_created_idx
  ON public.vision_deck_events (deck_id, created_at DESC);

GRANT SELECT, DELETE ON public.vision_deck_events TO authenticated;
GRANT ALL ON public.vision_deck_events TO service_role;

ALTER TABLE public.vision_deck_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dream Wave owners can view vision engagement"
  ON public.vision_deck_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'));

CREATE POLICY "Dream Wave owners can delete vision engagement"
  ON public.vision_deck_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'));

-- Public token-gated read
CREATE OR REPLACE FUNCTION public.get_public_vision_deck(_share_token TEXT)
RETURNS TABLE (
  id UUID,
  title TEXT,
  company_name TEXT,
  prospect_name TEXT,
  accent_color TEXT,
  content JSONB,
  published_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    deck.id, deck.title, deck.company_name, deck.prospect_name,
    deck.accent_color, deck.content, deck.published_at
  FROM public.vision_decks AS deck
  WHERE deck.share_token = _share_token
    AND deck.share_enabled = true
    AND deck.status = 'ready'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_vision_deck(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_vision_deck(TEXT)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_vision_deck_event(
  _share_token TEXT,
  _event_type TEXT,
  _session_id TEXT,
  _slide_key TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _deck_id UUID;
BEGIN
  IF _event_type NOT IN ('opened', 'slide_viewed') THEN RETURN false; END IF;
  IF char_length(coalesce(_session_id, '')) < 1 OR char_length(_session_id) > 100 THEN
    RETURN false;
  END IF;

  SELECT deck.id INTO _deck_id
  FROM public.vision_decks AS deck
  WHERE deck.share_token = _share_token
    AND deck.share_enabled = true
    AND deck.status = 'ready'
  LIMIT 1;

  IF _deck_id IS NULL THEN RETURN false; END IF;

  INSERT INTO public.vision_deck_events (deck_id, event_type, slide_key, session_id)
  VALUES (_deck_id, _event_type, left(nullif(_slide_key, ''), 80), _session_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_vision_deck_event(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_vision_deck_event(TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- Storage policies for vision-deck-assets (bucket created separately)
CREATE POLICY "Vision assets readable by anyone"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'vision-deck-assets');

CREATE POLICY "Vision assets writable by owners"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vision-deck-assets'
    AND public.has_role(auth.uid(), 'dream_wave_owner')
  );

CREATE POLICY "Vision assets updatable by owners"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vision-deck-assets'
    AND public.has_role(auth.uid(), 'dream_wave_owner')
  )
  WITH CHECK (
    bucket_id = 'vision-deck-assets'
    AND public.has_role(auth.uid(), 'dream_wave_owner')
  );

CREATE POLICY "Vision assets deletable by owners"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vision-deck-assets'
    AND public.has_role(auth.uid(), 'dream_wave_owner')
  );
