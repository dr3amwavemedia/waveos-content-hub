-- Public WaveOS accounts should land in an isolated, usable workspace without
-- asking the new user to create one. Keep the provisioning operation
-- idempotent so Auth retries and callback retries cannot create duplicates.
CREATE OR REPLACE FUNCTION public.provision_os_trial_workspace(
  _user_id uuid,
  _workspace_name text DEFAULT NULL,
  _promo_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_id uuid;
  _first_name text;
  _last_name text;
  _email text;
  _clean_name text;
  _business_name text;
  _base_slug text;
  _slug text;
  _promo public.os_promo_codes%ROWTYPE;
  _bonus_days integer := 0;
  _redemption_inserted integer := 0;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(_user_id::text, 0));

  SELECT workspaces.id INTO _workspace_id
  FROM public.workspace_members
  JOIN public.workspaces ON workspaces.id = workspace_members.workspace_id
  WHERE workspace_members.user_id = _user_id
    AND workspaces.data_source = 'os_data'
    AND NOT workspaces.is_archived
  ORDER BY workspace_members.created_at
  LIMIT 1;
  IF _workspace_id IS NOT NULL THEN RETURN _workspace_id; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = _user_id AND profiles.account_source = 'os_data'
  ) THEN
    RAISE EXCEPTION 'os_account_required';
  END IF;

  SELECT
    nullif(btrim(profiles.first_name), ''),
    nullif(btrim(profiles.last_name), ''),
    auth_users.email
  INTO _first_name, _last_name, _email
  FROM public.profiles
  JOIN auth.users AS auth_users ON auth_users.id = profiles.id
  WHERE profiles.id = _user_id;

  _business_name := nullif(btrim(concat_ws(' ', _first_name, _last_name)), '');
  _clean_name := nullif(btrim(coalesce(_workspace_name, '')), '');
  IF _clean_name IS NULL THEN
    _clean_name := CASE
      WHEN _business_name IS NOT NULL THEN _business_name || '''s Workspace'
      WHEN nullif(split_part(coalesce(_email, ''), '@', 1), '') IS NOT NULL
        THEN initcap(replace(split_part(_email, '@', 1), '.', ' ')) || '''s Workspace'
      ELSE 'My WaveOS Workspace'
    END;
  END IF;
  _clean_name := left(_clean_name, 80);

  _base_slug := btrim(regexp_replace(lower(_clean_name), '[^a-z0-9]+', '-', 'g'), '-');
  IF _base_slug = '' THEN _base_slug := 'waveos'; END IF;
  _slug := left(_base_slug, 31) || '-' || left(replace(_user_id::text, '-', ''), 8);

  IF nullif(btrim(coalesce(_promo_code, '')), '') IS NOT NULL THEN
    SELECT promo.* INTO _promo
    FROM public.os_promo_codes AS promo
    WHERE lower(promo.code) = lower(btrim(_promo_code))
      AND promo.is_active
      AND promo.starts_at <= now()
      AND (promo.expires_at IS NULL OR promo.expires_at > now())
      AND promo.redemption_count < promo.max_redemptions
    FOR UPDATE;
    IF FOUND THEN _bonus_days := _promo.bonus_trial_days; END IF;
  END IF;

  INSERT INTO public.workspaces (
    name, slug, timezone, created_by, is_demo, is_archived, data_source,
    access_tier, account_status, activated_at
  ) VALUES (
    _clean_name, _slug, 'America/New_York', _user_id, false, false, 'os_data',
    'retainer_full', 'active', now()
  )
  RETURNING id INTO _workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_workspace_id, _user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';

  INSERT INTO public.brand_profiles (
    workspace_id, business_name, primary_language, timezone, onboarding_status
  ) VALUES (
    _workspace_id, coalesce(_business_name, _clean_name), 'en',
    'America/New_York', 'not_started'
  )
  ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO public.media_folders (workspace_id, name, created_by)
  SELECT _workspace_id, folder.name, _user_id
  FROM (VALUES
    ('Photos'), ('Videos'), ('Reels'), ('Brand Assets'),
    ('Logos'), ('Uploads'), ('Campaigns'), ('Archived')
  ) AS folder(name);

  INSERT INTO public.workspace_social_subscriptions (
    workspace_id, plan, status, account_limit, trial_started_at, trial_ends_at
  ) VALUES (
    _workspace_id, 'trial', 'trialing', 2, now(),
    now() + make_interval(days => 30 + _bonus_days)
  )
  ON CONFLICT (workspace_id) DO NOTHING;

  IF _promo.id IS NOT NULL THEN
    INSERT INTO public.os_promo_redemptions (
      promo_code_id, user_id, workspace_id, bonus_trial_days
    ) VALUES (
      _promo.id, _user_id, _workspace_id, _bonus_days
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS _redemption_inserted = ROW_COUNT;
    IF _redemption_inserted = 1 THEN
      UPDATE public.os_promo_codes
      SET redemption_count = redemption_count + 1
      WHERE id = _promo.id;
    END IF;
  END IF;

  INSERT INTO public.activity_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _workspace_id, _user_id, 'os_trial_started', 'workspace', _workspace_id,
    jsonb_build_object(
      'account_limit', 2,
      'trial_days', 30 + _bonus_days,
      'promo_applied', _redemption_inserted = 1,
      'automatic_provisioning', true
    )
  );

  RETURN _workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_os_trial_workspace(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

-- Email/password public signups carry trusted route metadata. Provision their
-- profile and workspace in the same transaction as the Auth user record.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _account_source text := CASE
    WHEN NEW.raw_user_meta_data ->> 'account_source' = 'os_data' THEN 'os_data'
    ELSE 'client_data'
  END;
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, avatar_url, account_source)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'avatar_url',
    _account_source
  )
  ON CONFLICT (id) DO NOTHING;

  IF _account_source = 'os_data'
     AND NEW.raw_user_meta_data ->> 'signup_source' = 'public_trial' THEN
    PERFORM public.provision_os_trial_workspace(
      NEW.id,
      NEW.raw_user_meta_data ->> 'workspace_name',
      NEW.raw_user_meta_data ->> 'promo_code'
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Lovable-brokered Google signup cannot attach WaveOS metadata before Auth
-- creates the user. This narrowly scoped RPC may convert only a brand-new,
-- otherwise-unassigned account; existing staff, clients and invitees are
-- explicitly protected from reclassification.
CREATE OR REPLACE FUNCTION public.activate_public_os_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _created_at timestamptz;
  _account_source text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT auth_users.email, auth_users.created_at, profiles.account_source
  INTO _email, _created_at, _account_source
  FROM auth.users AS auth_users
  JOIN public.profiles ON profiles.id = auth_users.id
  WHERE auth_users.id = _uid;

  IF _account_source <> 'os_data' THEN
    IF _created_at < now() - interval '15 minutes' THEN
      RAISE EXCEPTION 'public_signup_window_closed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid)
       OR EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = _uid)
       OR EXISTS (
         SELECT 1 FROM public.invites
         WHERE lower(email) = lower(_email)
           AND status IN ('pending', 'accepted')
       ) THEN
      RAISE EXCEPTION 'account_already_assigned';
    END IF;
    UPDATE public.profiles SET account_source = 'os_data' WHERE id = _uid;
  END IF;

  RETURN public.provision_os_trial_workspace(_uid, NULL, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_public_os_account()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_public_os_account()
  TO authenticated;

-- Repair existing public-app accounts that were created under the old
-- two-step flow but never completed the workspace form.
DO $$
DECLARE
  _account record;
BEGIN
  FOR _account IN
    SELECT
      profiles.id,
      nullif(btrim(concat_ws(' ', profiles.first_name, profiles.last_name)), '') AS workspace_name,
      auth_users.raw_user_meta_data ->> 'promo_code' AS promo_code
    FROM public.profiles
    JOIN auth.users AS auth_users ON auth_users.id = profiles.id
    WHERE profiles.account_source = 'os_data'
      AND NOT EXISTS (
        SELECT 1
        FROM public.workspace_members
        JOIN public.workspaces ON workspaces.id = workspace_members.workspace_id
        WHERE workspace_members.user_id = profiles.id
          AND workspaces.data_source = 'os_data'
          AND NOT workspaces.is_archived
      )
  LOOP
    PERFORM public.provision_os_trial_workspace(
      _account.id, _account.workspace_name, _account.promo_code
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
