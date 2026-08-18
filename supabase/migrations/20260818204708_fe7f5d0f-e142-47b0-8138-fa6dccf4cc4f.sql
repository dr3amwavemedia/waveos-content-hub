ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS wedding_date date,
  ADD COLUMN IF NOT EXISTS wedding_venue text,
  ADD COLUMN IF NOT EXISTS wedding_city text,
  ADD COLUMN IF NOT EXISTS wedding_state text,
  ADD COLUMN IF NOT EXISTS wedding_location text,
  ADD COLUMN IF NOT EXISTS wedding_meeting_at timestamptz,
  ADD COLUMN IF NOT EXISTS wedding_stage text,
  ADD COLUMN IF NOT EXISTS wedding_welcome_message text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_wedding_stage_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_wedding_stage_check
      CHECK (wedding_stage IS NULL OR wedding_stage IN (
        'invitation_accepted','deposit_received','planning','creative_strategy_meeting',
        'wedding_day_approaching','wedding_captured','editing','films_ready','complete'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_wedding_text_len_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_wedding_text_len_check
      CHECK (
        (wedding_venue IS NULL OR char_length(wedding_venue) <= 160) AND
        (wedding_city IS NULL OR char_length(wedding_city) <= 120) AND
        (wedding_state IS NULL OR char_length(wedding_state) <= 120) AND
        (wedding_location IS NULL OR char_length(wedding_location) <= 400) AND
        (wedding_welcome_message IS NULL OR char_length(wedding_welcome_message) <= 600)
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.has_feature(_workspace_id uuid, _feature text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'can_view_profile', 'can_view_invoices', 'can_contact_support', 'can_view_deliveries'
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
$function$;