-- Promo codes for the public WaveOS app live with OS data, never agency client
-- data. Codes add bonus days to the initial card-free trial and may be limited,
-- paused, scheduled, or expired by the Dream Wave owner.
CREATE TABLE IF NOT EXISTS public.os_promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  bonus_trial_days smallint NOT NULL CHECK (bonus_trial_days BETWEEN 1 AND 90),
  max_redemptions integer NOT NULL CHECK (max_redemptions BETWEEN 1 AND 100000),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  color_theme text NOT NULL DEFAULT 'ocean'
    CHECK (color_theme IN ('ocean', 'violet', 'emerald', 'sunset')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{2,23}$'),
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS os_promo_codes_lower_code_unique
  ON public.os_promo_codes(lower(code));
CREATE INDEX IF NOT EXISTS os_promo_codes_status_idx
  ON public.os_promo_codes(is_active, starts_at, expires_at);

CREATE TABLE IF NOT EXISTS public.os_promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.os_promo_codes(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bonus_trial_days smallint NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(workspace_id)
);

ALTER TABLE public.os_promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_promo_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.os_promo_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.os_promo_redemptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.os_promo_codes, public.os_promo_redemptions TO service_role;

DROP TRIGGER IF EXISTS os_promo_codes_updated_at ON public.os_promo_codes;
CREATE TRIGGER os_promo_codes_updated_at
  BEFORE UPDATE ON public.os_promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_os_promo_code(_code text)
RETURNS TABLE(name text, bonus_trial_days integer, color_theme text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT promo.name, promo.bonus_trial_days::integer, promo.color_theme
  FROM public.os_promo_codes AS promo
  WHERE lower(promo.code) = lower(btrim(_code))
    AND promo.is_active
    AND promo.starts_at <= now()
    AND (promo.expires_at IS NULL OR promo.expires_at > now())
    AND promo.redemption_count < promo.max_redemptions
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.validate_os_promo_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_os_promo_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_os_trial_workspace(
  _name text,
  _business_name text DEFAULT NULL,
  _industry text DEFAULT NULL,
  _website text DEFAULT NULL,
  _timezone text DEFAULT 'America/New_York',
  _primary_language text DEFAULT 'en',
  _service_area text DEFAULT NULL,
  _target_audience text DEFAULT NULL,
  _promo_code text DEFAULT NULL
)
RETURNS TABLE(id uuid, slug text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _created record;
  _promo public.os_promo_codes%ROWTYPE;
  _bonus_days integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = _uid AND profiles.account_source = 'os_data'
  ) THEN
    RAISE EXCEPTION 'os_account_required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.workspace_members
    JOIN public.workspaces ON workspaces.id = workspace_members.workspace_id
    WHERE workspace_members.user_id = _uid
      AND workspaces.data_source = 'os_data'
  ) THEN
    RAISE EXCEPTION 'os_workspace_already_exists';
  END IF;

  IF nullif(btrim(coalesce(_promo_code, '')), '') IS NOT NULL THEN
    SELECT * INTO _promo
    FROM public.os_promo_codes AS promo
    WHERE lower(promo.code) = lower(btrim(_promo_code))
    FOR UPDATE;
    IF NOT FOUND OR NOT _promo.is_active OR _promo.starts_at > now()
       OR (_promo.expires_at IS NOT NULL AND _promo.expires_at <= now())
       OR _promo.redemption_count >= _promo.max_redemptions THEN
      RAISE EXCEPTION 'promo_code_invalid_or_unavailable';
    END IF;
    _bonus_days := _promo.bonus_trial_days;
  END IF;

  SELECT created.id, created.slug, created.name INTO _created
  FROM public.create_brand_workspace(
    _name, _business_name, _industry, _website, _timezone,
    _primary_language, _service_area, _target_audience
  ) AS created;

  UPDATE public.workspaces
  SET data_source = 'os_data'
  WHERE workspaces.id = _created.id AND workspaces.created_by = _uid;

  INSERT INTO public.workspace_social_subscriptions (
    workspace_id, plan, status, account_limit, trial_started_at, trial_ends_at
  ) VALUES (
    _created.id, 'trial', 'trialing', 2, now(),
    now() + make_interval(days => 30 + _bonus_days)
  ) ON CONFLICT (workspace_id) DO NOTHING;

  IF _promo.id IS NOT NULL THEN
    INSERT INTO public.os_promo_redemptions (
      promo_code_id, user_id, workspace_id, bonus_trial_days
    ) VALUES (_promo.id, _uid, _created.id, _bonus_days);
    UPDATE public.os_promo_codes
    SET redemption_count = redemption_count + 1
    WHERE os_promo_codes.id = _promo.id;
  END IF;

  INSERT INTO public.activity_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _created.id, _uid, 'os_trial_started', 'workspace', _created.id,
    jsonb_build_object(
      'account_limit', 2,
      'trial_days', 30 + _bonus_days,
      'promo_applied', _promo.id IS NOT NULL
    )
  );

  RETURN QUERY SELECT _created.id, _created.slug, _created.name;
END;
$$;

REVOKE ALL ON FUNCTION public.create_os_trial_workspace(
  text,text,text,text,text,text,text,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_os_trial_workspace(
  text,text,text,text,text,text,text,text,text
) TO authenticated;
