-- Active trial subscriptions receive Current-level creative/research tools;
-- Ripple stays restricted and expired trials remain locked.
CREATE OR REPLACE FUNCTION public.has_feature(_workspace_id uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _tier public.client_access_tier;
  _status public.account_status;
  _expires timestamptz;
  _overrides jsonb;
  _override_val jsonb;
  _data_source text;
  _social_plan text;
  _social_status text;
BEGIN
  SELECT access_tier, account_status, access_expires_at, feature_overrides, data_source
    INTO _tier, _status, _expires, _overrides, _data_source
    FROM public.workspaces
    WHERE id = _workspace_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF _data_source = 'os_data' THEN
    SELECT plan, status INTO _social_plan, _social_status
    FROM public.workspace_social_subscriptions
    WHERE workspace_id = _workspace_id;

    IF NOT public.social_subscription_is_active(_workspace_id) THEN RETURN false; END IF;

    IF _feature = 'can_view_analytics_checkup' THEN RETURN true; END IF;
    IF _feature IN ('can_use_ai_tools', 'can_schedule_content') THEN
      RETURN _social_status = 'trialing' OR _social_plan IN ('full', 'expanded');
    END IF;
    IF _feature IN (
      'can_use_creative_studio', 'can_use_campaign_manager',
      'can_use_competitive_intelligence'
    ) THEN
      RETURN _social_status = 'trialing' OR _social_plan IN ('full', 'expanded');
    END IF;
    IF _feature = 'can_invite_members' THEN
      RETURN _social_plan = 'expanded';
    END IF;
    RETURN _feature IN (
      'can_view_profile', 'can_edit_profile', 'can_manage_brand_voice',
      'can_view_calendar_preview', 'can_view_media_library', 'can_upload_media',
      'can_create_content', 'can_connect_socials', 'can_publish_content',
      'can_view_analytics', 'can_view_activity_log', 'can_manage_workspace'
    );
  END IF;

  _override_val := _overrides -> _feature;
  IF _override_val IS NOT NULL
     AND pg_catalog.jsonb_typeof(_override_val) = 'boolean' THEN
    RETURN (_override_val)::text::boolean;
  END IF;

  -- The Phase 1 checkup is additive for every active DWM client workspace,
  -- including project and wedding workspaces, without granting full analytics.
  IF _feature = 'can_view_analytics_checkup' THEN
    RETURN _status = 'active' AND (_expires IS NULL OR _expires >= now());
  END IF;

  -- Preserve the existing locked wedding-client access contract exactly.
  IF _tier::text = 'wedding_client' THEN
    RETURN _feature IN ('can_view_profile', 'can_view_invoices', 'can_contact_support')
      OR (_status = 'active' AND _feature = 'can_view_deliveries');
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

  IF _feature IN (
    'can_use_creative_studio', 'can_use_campaign_manager',
    'can_use_competitive_intelligence'
  ) THEN
    RETURN _tier::text IN ('retainer_full', 'social_management')
      OR coalesce(_overrides -> 'social_management_access' = 'true'::jsonb, false);
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
        'can_upload_media', 'can_use_ai_tools', 'can_view_analytics',
        'can_view_activity_log', 'can_invite_members', 'can_manage_workspace'
      );
    WHEN 'retainer_full' THEN RETURN true;
    WHEN 'social_management' THEN RETURN true;
    ELSE RETURN false;
  END CASE;
END;
$function$;

