-- Owner-managed staff classifications. Both types share the restricted staff navigation.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_type') THEN
    CREATE TYPE public.staff_type AS ENUM ('sales', 'media_manager');
  END IF;
END
$$;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS staff_type public.staff_type;
ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS staff_type public.staff_type;

UPDATE public.user_roles
   SET staff_type = 'sales'
 WHERE role = 'dream_wave_team' AND staff_type IS NULL;

UPDATE public.invites
   SET staff_type = 'sales'
 WHERE app_role = 'dream_wave_team' AND staff_type IS NULL;

CREATE OR REPLACE VIEW public.invites_admin
WITH (security_invoker = true) AS
SELECT id, email, workspace_id, workspace_role, app_role, status,
       expires_at, created_at, accepted_at, revoked_at, revoked_by,
       invited_by, resend_count, last_sent_at, staff_type
FROM public.invites;

REVOKE ALL ON public.invites_admin FROM PUBLIC, anon;
GRANT SELECT ON public.invites_admin TO authenticated;
GRANT ALL ON public.invites_admin TO service_role;

-- The typed version replaces UI access to the legacy two-argument overload.
REVOKE ALL ON FUNCTION public.create_staff_invite(text, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_staff_invite(
  _email text,
  _staff_type public.staff_type,
  _expires_days integer DEFAULT 14
)
RETURNS TABLE(invite_id uuid, raw_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _token text;
  _hash text;
  _id uuid;
  _clean_email text := lower(btrim(_email));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role(_uid, 'dream_wave_owner') THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF _clean_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  _token := replace(replace(replace(encode(extensions.gen_random_bytes(48), 'base64'), '+', '-'), '/', '_'), '=', '');
  _hash := encode(extensions.digest(_token::bytea, 'sha256'), 'hex');

  UPDATE public.invites
     SET status = 'revoked', revoked_at = now(), revoked_by = _uid
   WHERE email = _clean_email
     AND workspace_id IS NULL
     AND app_role = 'dream_wave_team'
     AND status = 'pending';

  INSERT INTO public.invites (
    email, workspace_id, workspace_role, app_role, staff_type, token, token_hash,
    invited_by, expires_at
  ) VALUES (
    _clean_email, NULL, 'viewer', 'dream_wave_team', _staff_type, _token, _hash,
    _uid, now() + make_interval(days => GREATEST(1, LEAST(_expires_days, 30)))
  )
  RETURNING id INTO _id;

  RETURN QUERY SELECT _id, _token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_invite(text, public.staff_type, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_staff_invite(text, public.staff_type, integer)
  TO authenticated;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.apply_accepted_staff_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.app_role = 'dream_wave_team'
     AND NEW.status = 'accepted'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.user_roles AS roles
       SET staff_type = coalesce(NEW.staff_type, 'sales')
      FROM auth.users AS users
     WHERE roles.user_id = users.id
       AND roles.role = 'dream_wave_team'
       AND lower(users.email) = lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_accepted_staff_type()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invites_apply_accepted_staff_type ON public.invites;
CREATE TRIGGER invites_apply_accepted_staff_type
  AFTER UPDATE OF status ON public.invites
  FOR EACH ROW EXECUTE FUNCTION private.apply_accepted_staff_type();

CREATE OR REPLACE FUNCTION public.set_staff_type(
  _target_user uuid,
  _staff_type public.staff_type
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role(_uid, 'dream_wave_owner') THEN RAISE EXCEPTION 'owner_required'; END IF;

  UPDATE public.user_roles
     SET staff_type = _staff_type
   WHERE user_id = _target_user
     AND role = 'dream_wave_team';

  IF NOT FOUND THEN RAISE EXCEPTION 'staff_member_not_found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_staff_type(uuid, public.staff_type)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_type(uuid, public.staff_type)
  TO authenticated;
