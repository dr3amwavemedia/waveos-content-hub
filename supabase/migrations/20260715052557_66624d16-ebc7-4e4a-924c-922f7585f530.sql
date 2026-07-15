
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 8. ACTIVITY LOGS (create early so bootstrap trigger can reference)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view activity logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (
    (workspace_id IS NULL AND public.is_dream_wave_staff(auth.uid()))
    OR (workspace_id IS NOT NULL AND (
      public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid())
    ))
  );

CREATE INDEX IF NOT EXISTS activity_logs_workspace_created_idx
  ON public.activity_logs(workspace_id, created_at DESC);

-- ============================================================
-- 1. SECURE FIRST-OWNER BOOTSTRAP + PROTECT LAST OWNER
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _has_owner BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, avatar_url)
  VALUES (NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_advisory_xact_lock(918273645);

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'dream_wave_owner')
    INTO _has_owner;

  IF NOT _has_owner THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'dream_wave_owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES ('11111111-1111-1111-1111-111111111111', NEW.id, 'owner')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
    VALUES ('11111111-1111-1111-1111-111111111111', NEW.id, 'owner_bootstrapped',
            'user_role', NEW.id, jsonb_build_object('role','dream_wave_owner'));
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE _c INT;
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'dream_wave_owner' THEN
    SELECT COUNT(*) INTO _c FROM public.user_roles WHERE role='dream_wave_owner';
    IF _c <= 1 THEN RAISE EXCEPTION 'cannot_remove_last_owner'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.role = 'dream_wave_owner' AND NEW.role <> 'dream_wave_owner' THEN
    SELECT COUNT(*) INTO _c FROM public.user_roles WHERE role='dream_wave_owner';
    IF _c <= 1 THEN RAISE EXCEPTION 'cannot_remove_last_owner'; END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS protect_last_owner_trg ON public.user_roles;
CREATE TRIGGER protect_last_owner_trg
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

CREATE OR REPLACE FUNCTION public.grant_staff_role(_target_user UUID, _role public.app_role)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role(auth.uid(), 'dream_wave_owner') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _role = 'dream_wave_owner' THEN RAISE EXCEPTION 'cannot_grant_owner'; END IF;
  IF _role NOT IN ('dream_wave_team') THEN RAISE EXCEPTION 'role_not_grantable_by_this_function'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user, _role) ON CONFLICT DO NOTHING;
  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES ('11111111-1111-1111-1111-111111111111', auth.uid(), 'role_granted', 'user_role', _target_user,
          jsonb_build_object('role', _role::text));
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_staff_role(_target_user UUID, _role public.app_role)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role(auth.uid(), 'dream_wave_owner') THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _target_user AND role = _role;
  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES ('11111111-1111-1111-1111-111111111111', auth.uid(), 'role_revoked', 'user_role', _target_user,
          jsonb_build_object('role', _role::text));
END; $$;

-- ============================================================
-- 2. INVITES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.invite_status AS ENUM ('pending','accepted','expired','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS status public.invite_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resend_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.invites
SET token_hash = encode(extensions.digest(token::bytea, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

UPDATE public.invites SET status = 'accepted' WHERE accepted_at IS NOT NULL AND status = 'pending';
UPDATE public.invites SET status = 'expired' WHERE accepted_at IS NULL AND expires_at < now() AND status = 'pending';

CREATE INDEX IF NOT EXISTS invites_token_hash_idx ON public.invites(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS invites_unique_active
  ON public.invites(email, workspace_id, workspace_role)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS update_invites_updated_at ON public.invites;
CREATE TRIGGER update_invites_updated_at
  BEFORE UPDATE ON public.invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_invite(
  _email TEXT, _workspace_id UUID,
  _workspace_role public.workspace_member_role, _app_role public.app_role,
  _expires_days INT DEFAULT 14
) RETURNS TABLE(invite_id UUID, raw_token TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _token TEXT; _hash TEXT; _id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _app_role IN ('dream_wave_owner','dream_wave_team') THEN RAISE EXCEPTION 'staff_roles_not_invitable_here'; END IF;

  _token := replace(replace(replace(encode(extensions.gen_random_bytes(48), 'base64'), '+','-'), '/','_'), '=', '');
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');

  UPDATE public.invites
    SET status='revoked', revoked_at=now(), revoked_by=_uid
    WHERE email=lower(_email) AND workspace_id=_workspace_id
      AND workspace_role=_workspace_role AND status='pending';

  INSERT INTO public.invites (email, workspace_id, workspace_role, app_role, token, token_hash, invited_by, expires_at)
    VALUES (lower(_email), _workspace_id, _workspace_role, _app_role, _token, _hash, _uid,
            now() + make_interval(days => GREATEST(1, LEAST(_expires_days, 30))))
    RETURNING id INTO _id;

  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_workspace_id, _uid, 'invitation_created', 'invite', _id,
          jsonb_build_object('email', lower(_email), 'role', _workspace_role::text));

  RETURN QUERY SELECT _id, _token;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_invite(_invite_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _ws UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.invites SET status='revoked', revoked_at=now(), revoked_by=_uid
    WHERE id=_invite_id AND status='pending' RETURNING workspace_id INTO _ws;
  IF _ws IS NOT NULL THEN
    INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
    VALUES (_ws, _uid, 'invitation_revoked', 'invite', _invite_id, '{}'::jsonb);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.resend_invite(_invite_id UUID, _extend_days INT DEFAULT 14)
RETURNS TABLE(raw_token TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _token TEXT; _hash TEXT; _ws UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  _token := replace(replace(replace(encode(extensions.gen_random_bytes(48), 'base64'), '+','-'), '/','_'), '=', '');
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');

  UPDATE public.invites
    SET token=_token, token_hash=_hash,
        expires_at = now() + make_interval(days => GREATEST(1, LEAST(_extend_days, 30))),
        resend_count = resend_count + 1, last_sent_at = now(),
        status='pending', revoked_at=NULL, revoked_by=NULL, accepted_at=NULL
    WHERE id=_invite_id RETURNING workspace_id INTO _ws;
  IF _ws IS NULL THEN RAISE EXCEPTION 'invite_not_found'; END IF;

  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_ws, _uid, 'invitation_resent', 'invite', _invite_id, '{}'::jsonb);

  RETURN QUERY SELECT _token;
END; $$;

CREATE OR REPLACE FUNCTION public.accept_invite(_token TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _hash TEXT; _invite public.invites%ROWTYPE; _email TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');
  SELECT * INTO _invite FROM public.invites WHERE token_hash = _hash LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF _invite.status = 'accepted' THEN RAISE EXCEPTION 'invite_already_used'; END IF;
  IF _invite.status = 'revoked' THEN RAISE EXCEPTION 'invite_revoked'; END IF;
  IF _invite.expires_at < now() OR _invite.status='expired' THEN
    UPDATE public.invites SET status='expired' WHERE id=_invite.id AND status='pending';
    RAISE EXCEPTION 'invite_expired';
  END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  IF _email IS NULL OR lower(_email) <> lower(_invite.email) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;
  IF _invite.workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES (_invite.workspace_id, _uid, _invite.workspace_role)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;
  IF _invite.app_role IN ('client_owner','client_approver','client_viewer') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _invite.app_role) ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.invites SET accepted_at=now(), status='accepted' WHERE id=_invite.id;
  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_invite.workspace_id, _uid, 'invitation_accepted', 'invite', _invite.id, '{}'::jsonb);
  RETURN _invite.workspace_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_invite_public(_token TEXT)
RETURNS TABLE(email TEXT, workspace_id UUID, workspace_name TEXT,
              workspace_role public.workspace_member_role,
              status public.invite_status, expires_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT i.email, i.workspace_id, w.name,
         i.workspace_role,
         CASE WHEN i.status='pending' AND i.expires_at < now() THEN 'expired'::public.invite_status
              ELSE i.status END,
         i.expires_at
  FROM public.invites i LEFT JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token_hash = encode(extensions.digest(_token::bytea, 'sha256'), 'hex')
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_public(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invite(TEXT, UUID, public.workspace_member_role, public.app_role, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_invite(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_staff_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_staff_role(UUID, public.app_role) TO authenticated;

-- ============================================================
-- 4. MEDIA PUBLISHING FIELDS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.media_publishing_status AS ENUM ('none','preparing','ready','expired','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS private_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS publishing_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS publishing_url TEXT,
  ADD COLUMN IF NOT EXISTS publishing_url_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publishing_url_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publishing_status public.media_publishing_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_accessibility_check TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS width INT,
  ADD COLUMN IF NOT EXISTS height INT,
  ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='media_assets' AND column_name='storage_path') THEN
    UPDATE public.media_assets SET private_storage_path = storage_path WHERE private_storage_path IS NULL;
  END IF;
END $$;

-- ============================================================
-- 6. BRAND PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_name TEXT, website TEXT, industry TEXT,
  primary_services TEXT, service_area TEXT, target_audience TEXT,
  brand_summary TEXT,
  tone_traits TEXT[] NOT NULL DEFAULT '{}',
  preferred_phrases TEXT, words_to_avoid TEXT,
  default_ctas TEXT[] NOT NULL DEFAULT '{}',
  default_hashtags TEXT[] NOT NULL DEFAULT '{}',
  emoji_preference TEXT NOT NULL DEFAULT 'balanced',
  preferred_caption_length TEXT NOT NULL DEFAULT 'medium',
  primary_language TEXT NOT NULL DEFAULT 'en',
  secondary_language TEXT, timezone TEXT,
  onboarding_status TEXT NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_profiles TO authenticated;
GRANT ALL ON public.brand_profiles TO service_role;
ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view brand profile" ON public.brand_profiles FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "owners approvers insert brand profile" ON public.brand_profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_dream_wave_staff(auth.uid())
              OR public.workspace_role(auth.uid(), workspace_id) IN ('owner','approver'));
CREATE POLICY "owners approvers update brand profile" ON public.brand_profiles FOR UPDATE TO authenticated
  USING (public.is_dream_wave_staff(auth.uid())
         OR public.workspace_role(auth.uid(), workspace_id) IN ('owner','approver'))
  WITH CHECK (public.is_dream_wave_staff(auth.uid())
              OR public.workspace_role(auth.uid(), workspace_id) IN ('owner','approver'));
CREATE POLICY "staff delete brand profile" ON public.brand_profiles FOR DELETE TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()));

DROP TRIGGER IF EXISTS update_brand_profiles_updated_at ON public.brand_profiles;
CREATE TRIGGER update_brand_profiles_updated_at
  BEFORE UPDATE ON public.brand_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 7. WORKSPACE ADDITIONS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.workspace_status AS ENUM ('onboarding','active','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS status public.workspace_status NOT NULL DEFAULT 'onboarding',
  ADD COLUMN IF NOT EXISTS account_manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_tier TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

UPDATE public.workspaces SET status='archived' WHERE is_archived = true AND status <> 'archived';
UPDATE public.workspaces SET status='active'
  WHERE id = '11111111-1111-1111-1111-111111111111' AND status = 'onboarding';

-- ============================================================
-- 8. ACTIVITY LOGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_activity(
  _workspace_id UUID, _action TEXT,
  _entity_type TEXT DEFAULT NULL, _entity_id UUID DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _clean JSONB := _metadata;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  IF _workspace_id IS NOT NULL AND NOT (
       public.is_workspace_member(_uid, _workspace_id) OR public.is_dream_wave_staff(_uid)
     ) THEN RETURN; END IF;
  _clean := _clean - 'token' - 'raw_token' - 'password' - 'api_key' - 'secret' - 'signed_url';
  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_workspace_id, _uid, _action, _entity_type, _entity_id, _clean);
END; $$;
GRANT EXECUTE ON FUNCTION public.log_activity(UUID, TEXT, TEXT, UUID, JSONB) TO authenticated;
