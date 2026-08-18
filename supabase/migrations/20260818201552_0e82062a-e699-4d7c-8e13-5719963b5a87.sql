ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS wedding_display_name text,
  ADD COLUMN IF NOT EXISTS wedding_theme text NOT NULL DEFAULT 'olive';

ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_wedding_display_name_length,
  ADD CONSTRAINT workspaces_wedding_display_name_length
    CHECK (wedding_display_name IS NULL OR char_length(wedding_display_name) <= 120),
  DROP CONSTRAINT IF EXISTS workspaces_wedding_theme_check,
  ADD CONSTRAINT workspaces_wedding_theme_check
    CHECK (wedding_theme IN ('olive', 'gold'));

COMMENT ON COLUMN public.workspaces.wedding_display_name IS
  'Couple or client name displayed prominently in a Layer 5 wedding portal.';
COMMENT ON COLUMN public.workspaces.wedding_theme IS
  'Layer 5 wedding portal palette: olive or gold.';

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
BEGIN
  SELECT access_tier, account_status, access_expires_at, feature_overrides
    INTO _tier, _status, _expires, _overrides
    FROM public.workspaces WHERE id = _workspace_id;
  IF NOT FOUND THEN RETURN false; END IF;

  _override_val := _overrides -> _feature;
  IF _override_val IS NOT NULL AND jsonb_typeof(_override_val) = 'boolean' THEN
    RETURN (_override_val)::text::boolean;
  END IF;

  IF _tier::text = 'wedding_client' THEN
    RETURN _status = 'active' AND _feature IN (
      'can_view_profile', 'can_view_invoices', 'can_contact_support'
    );
  END IF;

  IF _status IN ('suspended', 'archived') THEN
    RETURN _feature IN ('can_view_deliveries', 'can_view_invoices', 'can_view_profile');
  END IF;
  IF _status = 'expired' OR (_expires IS NOT NULL AND _expires < now()) THEN
    RETURN _feature IN (
      'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
      'can_edit_profile', 'can_contact_support'
    );
  END IF;

  CASE _tier::text
    WHEN 'project_client' THEN
      RETURN _feature IN (
        'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
        'can_edit_profile', 'can_contact_support'
      );
    WHEN 'growth_90' THEN
      RETURN _feature IN (
        'can_view_deliveries', 'can_view_invoices', 'can_view_profile',
        'can_edit_profile', 'can_contact_support', 'can_review_content',
        'can_request_changes', 'can_manage_brand_voice',
        'can_view_calendar_preview', 'can_view_media_library',
        'can_upload_media', 'can_create_content', 'can_use_ai_tools',
        'can_view_analytics', 'can_view_activity_log', 'can_invite_members',
        'can_manage_workspace'
      );
    WHEN 'retainer_full' THEN RETURN true;
    WHEN 'social_management' THEN RETURN true;
    ELSE RETURN false;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;