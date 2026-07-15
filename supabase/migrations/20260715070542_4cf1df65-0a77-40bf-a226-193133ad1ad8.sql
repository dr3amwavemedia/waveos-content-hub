
CREATE OR REPLACE FUNCTION public.create_brand_workspace(
  _name text,
  _business_name text DEFAULT NULL::text,
  _industry text DEFAULT NULL::text,
  _website text DEFAULT NULL::text,
  _timezone text DEFAULT 'America/New_York'::text,
  _primary_language text DEFAULT 'en'::text,
  _service_area text DEFAULT NULL::text,
  _target_audience text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, slug text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _clean_name text;
  _base_slug text;
  _new_slug text;
  _n int := 0;
  _ws_id uuid;
  _owned_count int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  _clean_name := btrim(coalesce(_name, ''));
  IF length(_clean_name) < 2 THEN RAISE EXCEPTION 'workspace_name_too_short'; END IF;
  IF length(_clean_name) > 80 THEN RAISE EXCEPTION 'workspace_name_too_long'; END IF;

  IF NOT public.is_dream_wave_staff(_uid) THEN
    SELECT count(*) INTO _owned_count
    FROM public.workspace_members wm
    WHERE wm.user_id = _uid AND wm.role = 'owner';
    IF _owned_count >= 10 THEN RAISE EXCEPTION 'workspace_limit_reached'; END IF;
  END IF;

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
    name, slug, industry, website, timezone, service_area, created_by, is_demo, is_archived
  )
  VALUES (
    _clean_name, _new_slug,
    nullif(btrim(coalesce(_industry, '')), ''),
    nullif(btrim(coalesce(_website, '')), ''),
    coalesce(nullif(btrim(_timezone), ''), 'America/New_York'),
    nullif(btrim(coalesce(_service_area, '')), ''),
    _uid, false, false
  )
  RETURNING workspaces.id INTO _ws_id;

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
    jsonb_build_object('slug', _new_slug, 'self_service', true));

  RETURN QUERY SELECT _ws_id, _new_slug, _clean_name;
END;
$function$;
