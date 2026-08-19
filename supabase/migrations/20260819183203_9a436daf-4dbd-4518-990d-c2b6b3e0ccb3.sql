CREATE TABLE public.promo_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  google_review_url text NOT NULL,
  destination_url text NOT NULL,
  destination_label text NOT NULL DEFAULT 'View your content',
  is_active boolean NOT NULL DEFAULT true,
  public_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  scan_count integer NOT NULL DEFAULT 0,
  review_click_count integer NOT NULL DEFAULT 0,
  destination_click_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_campaigns_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT promo_campaigns_label_len CHECK (char_length(btrim(destination_label)) BETWEEN 1 AND 60),
  CONSTRAINT promo_campaigns_review_https CHECK (google_review_url ~* '^https://[^\s]+$'),
  CONSTRAINT promo_campaigns_dest_https CHECK (destination_url ~* '^https://[^\s]+$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_campaigns TO authenticated;
GRANT ALL ON public.promo_campaigns TO service_role;

ALTER TABLE public.promo_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage promo campaigns"
  ON public.promo_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'dream_wave_owner'));

CREATE TRIGGER promo_campaigns_set_updated_at
  BEFORE UPDATE ON public.promo_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_by();

CREATE OR REPLACE FUNCTION public.get_public_promo_campaign(_token text)
RETURNS TABLE(name text, google_review_url text, destination_url text, destination_label text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT c.name, c.google_review_url, c.destination_url, c.destination_label
  FROM public.promo_campaigns c
  WHERE c.public_token = _token AND c.is_active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.record_promo_event(_token text, _event text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF _event NOT IN ('scan', 'review_click', 'destination_click') THEN
    RAISE EXCEPTION 'invalid_promo_event';
  END IF;

  UPDATE public.promo_campaigns
  SET scan_count = scan_count + CASE WHEN _event = 'scan' THEN 1 ELSE 0 END,
      review_click_count = review_click_count + CASE WHEN _event = 'review_click' THEN 1 ELSE 0 END,
      destination_click_count = destination_click_count + CASE WHEN _event = 'destination_click' THEN 1 ELSE 0 END
  WHERE public_token = _token AND is_active;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_promo_campaign(text) FROM public;
REVOKE ALL ON FUNCTION public.record_promo_event(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_promo_campaign(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_promo_event(text, text) TO anon, authenticated;