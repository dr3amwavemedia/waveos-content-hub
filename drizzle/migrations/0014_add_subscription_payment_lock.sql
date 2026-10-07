-- Give public WaveOS subscribers one failed collection attempt of grace. The
-- second failed attempt pauses social tools without deleting connections or
-- content; a later paid invoice clears the lock automatically.

ALTER TABLE public.workspace_social_subscriptions
  ADD COLUMN IF NOT EXISTS payment_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_locked_at timestamptz;

ALTER TABLE public.workspace_social_subscriptions
  DROP CONSTRAINT IF EXISTS workspace_social_subscriptions_payment_failure_count_check;
ALTER TABLE public.workspace_social_subscriptions
  ADD CONSTRAINT workspace_social_subscriptions_payment_failure_count_check
  CHECK (payment_failure_count >= 0);

CREATE OR REPLACE FUNCTION public.social_subscription_is_active(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_social_subscriptions AS subscription
    JOIN public.workspaces AS workspace ON workspace.id = subscription.workspace_id
    WHERE subscription.workspace_id = _workspace_id
      AND workspace.data_source = 'os_data'
      AND subscription.service_locked_at IS NULL
      AND (
        subscription.status = 'active'
        OR (
          subscription.status = 'trialing'
          AND subscription.trial_ends_at > now()
        )
        OR (
          subscription.status = 'past_due'
          AND subscription.payment_failure_count < 2
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.social_subscription_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_subscription_is_active(uuid)
  TO authenticated, service_role;

-- Public app workspaces are subscription-driven, even though their legacy
-- access_tier is retainer_full. Handle them before tier and override logic so
-- neither can bypass a billing pause. Dream Wave client behavior is preserved.
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
BEGIN
  SELECT access_tier, account_status, access_expires_at, feature_overrides, data_source
    INTO _tier, _status, _expires, _overrides, _data_source
    FROM public.workspaces WHERE id = _workspace_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF _data_source = 'os_data' THEN
    RETURN _feature IN (
      'can_view_profile', 'can_edit_profile', 'can_manage_brand_voice',
      'can_view_calendar_preview', 'can_view_media_library', 'can_upload_media',
      'can_create_content', 'can_use_ai_tools', 'can_connect_socials',
      'can_schedule_content', 'can_publish_content', 'can_view_analytics',
      'can_view_activity_log', 'can_invite_members', 'can_manage_workspace'
    ) AND public.social_subscription_is_active(_workspace_id);
  END IF;

  _override_val := _overrides -> _feature;
  IF _override_val IS NOT NULL AND pg_catalog.jsonb_typeof(_override_val) = 'boolean' THEN
    RETURN (_override_val)::text::boolean;
  END IF;

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

REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;

COMMENT ON COLUMN public.workspace_social_subscriptions.payment_failure_count IS
  'Stripe invoice collection attempt_count. Social service pauses at two.';
COMMENT ON COLUMN public.workspace_social_subscriptions.service_locked_at IS
  'Set after a second failed collection attempt or terminal subscription state.';

NOTIFY pgrst, 'reload schema';