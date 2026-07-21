
-- Phase 1: Access Foundation
-- Add tiered client access model, feature overrides, expiration, and CRM sync fields.

-- === Enums ===
DO $$ BEGIN
  CREATE TYPE public.client_access_tier AS ENUM ('project_client', 'growth_90', 'retainer_full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agreement_term AS ENUM ('one_time', '90_day', '6_month', '12_month');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('pending', 'active', 'suspended', 'expired', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_sync_status AS ENUM ('not_connected', 'pending', 'synced', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- === Workspace access columns ===
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS access_tier public.client_access_tier NOT NULL DEFAULT 'retainer_full',
  ADD COLUMN IF NOT EXISTS agreement_term public.agreement_term,
  ADD COLUMN IF NOT EXISTS access_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_status public.account_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS crm_sync_status public.crm_sync_status NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS crm_external_id text,
  ADD COLUMN IF NOT EXISTS crm_last_sync_at timestamptz;

CREATE INDEX IF NOT EXISTS workspaces_access_tier_idx ON public.workspaces(access_tier);
CREATE INDEX IF NOT EXISTS workspaces_account_status_idx ON public.workspaces(account_status);
CREATE INDEX IF NOT EXISTS workspaces_access_expires_at_idx ON public.workspaces(access_expires_at);

-- === has_feature: single source of truth for feature enforcement ===
CREATE OR REPLACE FUNCTION public.has_feature(_workspace_id uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier public.client_access_tier;
  _status public.account_status;
  _expires timestamptz;
  _overrides jsonb;
  _override_val jsonb;
  _base boolean;
BEGIN
  SELECT access_tier, account_status, access_expires_at, feature_overrides
    INTO _tier, _status, _expires, _overrides
    FROM public.workspaces WHERE id = _workspace_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Explicit override wins (true or false)
  _override_val := _overrides -> _feature;
  IF _override_val IS NOT NULL AND jsonb_typeof(_override_val) = 'boolean' THEN
    RETURN (_override_val)::text::boolean;
  END IF;

  -- Suspended / archived accounts get nothing beyond read-own
  IF _status IN ('suspended', 'archived') THEN
    RETURN _feature IN ('can_view_deliveries', 'can_view_invoices', 'can_view_profile');
  END IF;

  -- Expired accounts fall back to project_client-level access
  IF _status = 'expired' OR (_expires IS NOT NULL AND _expires < now()) THEN
    RETURN _feature IN (
      'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
      'can_edit_profile', 'can_contact_support'
    );
  END IF;

  -- Tier defaults
  _base := CASE _tier
    WHEN 'project_client' THEN _feature IN (
      'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
      'can_edit_profile', 'can_contact_support'
    )
    WHEN 'growth_90' THEN _feature IN (
      'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
      'can_edit_profile', 'can_contact_support',
      'can_review_content', 'can_request_changes',
      'can_manage_brand_voice', 'can_view_calendar_preview'
    )
    WHEN 'retainer_full' THEN true
    ELSE false
  END;

  RETURN _base;
END;
$$;

REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated;

-- === Restrict create_brand_workspace to Dream Wave staff ===
-- Keep the same signature; add staff check at the top and remove self-service path.
CREATE OR REPLACE FUNCTION public.create_brand_workspace(
  _name text,
  _business_name text DEFAULT NULL,
  _industry text DEFAULT NULL,
  _website text DEFAULT NULL,
  _timezone text DEFAULT 'America/New_York',
  _primary_language text DEFAULT 'en',
  _service_area text DEFAULT NULL,
  _target_audience text DEFAULT NULL
)
RETURNS TABLE(id uuid, slug text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _clean_name text;
  _base_slug text;
  _new_slug text;
  _n int := 0;
  _ws_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_dream_wave_staff(_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  _clean_name := btrim(coalesce(_name, ''));
  IF length(_clean_name) < 2 THEN RAISE EXCEPTION 'workspace_name_too_short'; END IF;
  IF length(_clean_name) > 80 THEN RAISE EXCEPTION 'workspace_name_too_long'; END IF;

  _base_slug := regexp_replace(lower(_clean_name), '[^a-z0-9]+', '-', 'g');
  _base_slug := btrim(_base_slug, '-');
  IF length(_base_slug) = 0 THEN _base_slug := 'workspace'; END IF;
  IF length(_base_slug) > 40 THEN _base_slug := substring(_base_slug from 1 for 40); END IF;
  _new_slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.workspaces w WHERE w.slug = _new_slug) LOOP
    _n := _n + 1;
    _new_slug := _base_slug || '-' || _n::text;
    IF _n > 200 THEN
      _new_slug := _base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.workspaces (
    name, slug, industry, website, timezone, service_area, created_by,
    account_status, access_tier
  )
  VALUES (
    _clean_name, _new_slug,
    nullif(btrim(coalesce(_industry, '')), ''),
    nullif(btrim(coalesce(_website, '')), ''),
    coalesce(nullif(btrim(_timezone), ''), 'America/New_York'),
    nullif(btrim(coalesce(_service_area, '')), ''),
    _uid, 'pending', 'project_client'
  )
  RETURNING workspaces.id INTO _ws_id;

  -- Creator (staff) is added as a workspace 'owner' for management access.
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_ws_id, _uid, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';

  INSERT INTO public.brand_profiles (
    workspace_id, business_name, website, industry, service_area,
    target_audience, primary_language, timezone
  )
  VALUES (
    _ws_id,
    nullif(btrim(coalesce(_business_name, _clean_name)), ''),
    nullif(btrim(coalesce(_website, '')), ''),
    nullif(btrim(coalesce(_industry, '')), ''),
    nullif(btrim(coalesce(_service_area, '')), ''),
    nullif(btrim(coalesce(_target_audience, '')), ''),
    coalesce(nullif(btrim(_primary_language), ''), 'en'),
    coalesce(nullif(btrim(_timezone), ''), 'America/New_York')
  );

  INSERT INTO public.media_folders (workspace_id, name, created_by)
  SELECT _ws_id, f.name, _uid
  FROM (VALUES
    ('Photos'), ('Videos'), ('Reels'), ('Brand Assets'),
    ('Logos'), ('Uploads'), ('Campaigns'), ('Archived')
  ) AS f(name);

  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (_ws_id, _uid, 'workspace_created', 'workspace', _ws_id,
    jsonb_build_object('slug', _new_slug, 'created_by_staff', true));

  RETURN QUERY SELECT _ws_id, _new_slug, _clean_name;
END;
$$;

REVOKE ALL ON FUNCTION public.create_brand_workspace(text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_brand_workspace(text,text,text,text,text,text,text,text) TO authenticated;

-- === Backfill: existing active workspaces keep retainer_full to preserve behavior ===
UPDATE public.workspaces
   SET account_status = 'active'
 WHERE account_status IS NULL OR account_status = 'pending';
