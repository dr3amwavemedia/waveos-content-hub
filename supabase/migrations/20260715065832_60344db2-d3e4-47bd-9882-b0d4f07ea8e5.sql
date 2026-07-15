
-- 1. Extend workspace_member_role enum
ALTER TYPE public.workspace_member_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.workspace_member_role ADD VALUE IF NOT EXISTS 'editor';

-- 2. Self-service workspace creation RPC
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
  _slug text;
  _n int := 0;
  _ws_id uuid;
  _owned_count int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  _clean_name := btrim(coalesce(_name, ''));
  IF length(_clean_name) < 2 THEN
    RAISE EXCEPTION 'workspace_name_too_short';
  END IF;
  IF length(_clean_name) > 80 THEN
    RAISE EXCEPTION 'workspace_name_too_long';
  END IF;

  -- Anti-abuse: cap self-owned workspaces at 10 for non-staff.
  IF NOT public.is_dream_wave_staff(_uid) THEN
    SELECT count(*) INTO _owned_count
    FROM public.workspace_members
    WHERE user_id = _uid AND role = 'owner';
    IF _owned_count >= 10 THEN
      RAISE EXCEPTION 'workspace_limit_reached';
    END IF;
  END IF;

  -- Slug generation: lowercase, alphanumerics + dashes, uniqueness suffix.
  _base_slug := regexp_replace(lower(_clean_name), '[^a-z0-9]+', '-', 'g');
  _base_slug := btrim(_base_slug, '-');
  IF length(_base_slug) = 0 THEN
    _base_slug := 'workspace';
  END IF;
  IF length(_base_slug) > 40 THEN
    _base_slug := substring(_base_slug from 1 for 40);
  END IF;
  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.workspaces WHERE slug = _slug) LOOP
    _n := _n + 1;
    _slug := _base_slug || '-' || _n::text;
    IF _n > 200 THEN
      _slug := _base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
      EXIT;
    END IF;
  END LOOP;

  -- Create workspace
  INSERT INTO public.workspaces (
    name, slug, industry, website, timezone, service_area, created_by, is_demo, is_archived
  )
  VALUES (
    _clean_name, _slug,
    nullif(btrim(coalesce(_industry, '')), ''),
    nullif(btrim(coalesce(_website, '')), ''),
    coalesce(nullif(btrim(_timezone), ''), 'America/New_York'),
    nullif(btrim(coalesce(_service_area, '')), ''),
    _uid, false, false
  )
  RETURNING workspaces.id INTO _ws_id;

  -- Owner membership
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_ws_id, _uid, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';

  -- Brand profile
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

  -- Default folders
  INSERT INTO public.media_folders (workspace_id, name, created_by)
  SELECT _ws_id, f.name, _uid
  FROM (VALUES
    ('Photos'), ('Videos'), ('Reels'), ('Brand Assets'),
    ('Logos'), ('Uploads'), ('Campaigns'), ('Archived')
  ) AS f(name);

  -- Activity log (safe fields only)
  INSERT INTO public.activity_logs (workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (
    _ws_id, _uid, 'workspace_created', 'workspace', _ws_id,
    jsonb_build_object('slug', _slug, 'self_service', true)
  );

  RETURN QUERY SELECT _ws_id, _slug, _clean_name;
END;
$$;

REVOKE ALL ON FUNCTION public.create_brand_workspace(text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_brand_workspace(text,text,text,text,text,text,text,text) TO authenticated;
