-- WaveOS Phase 1 backend security foundation.
--
-- This migration is deliberately additive. It preserves all existing read
-- policies and the public-WaveOS/Dream-Wave-client split, while making tenant
-- relationships and browser-authenticated mutations enforceable in Postgres.

-- ---------------------------------------------------------------------------
-- Fail closed if historical rows already violate same-workspace invariants.
-- No data is rewritten or deleted by this audit.
-- ---------------------------------------------------------------------------

DO $audit$
DECLARE
  _mismatches bigint;
BEGIN
  SELECT count(*) INTO _mismatches
  FROM public.post_variants AS child
  JOIN public.content_items AS parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % post_variants rows reference another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.approvals AS child
  JOIN public.content_items AS parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % approvals rows reference another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.comments AS child
  JOIN public.content_items AS parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % comments rows reference another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.publish_attempts AS child
  JOIN public.content_items AS parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % publish_attempts rows reference another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.social_strategy_items AS child
  JOIN public.content_items AS parent ON parent.id = child.related_content_item_id
  WHERE child.related_content_item_id IS NOT NULL
    AND child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % social strategy rows reference content in another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.media_assets AS asset
  JOIN public.media_folders AS folder ON folder.id = asset.folder_id
  WHERE asset.folder_id IS NOT NULL
    AND asset.workspace_id <> folder.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % media assets reference folders in another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.media_folders AS child
  JOIN public.media_folders AS parent ON parent.id = child.parent_folder_id
  WHERE child.parent_folder_id IS NOT NULL
    AND child.workspace_id <> parent.workspace_id;
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % media folders reference parents in another workspace', _mismatches;
  END IF;

  SELECT count(*) INTO _mismatches
  FROM public.content_items AS item
  WHERE EXISTS (
    SELECT 1
    FROM unnest(item.media_asset_ids) AS selected(asset_id)
    WHERE selected.asset_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.media_assets AS asset
         WHERE asset.id = selected.asset_id
           AND asset.workspace_id = item.workspace_id
       )
  );
  IF _mismatches <> 0 THEN
    RAISE EXCEPTION 'phase1 tenant audit failed: % content items contain missing or cross-workspace media references', _mismatches;
  END IF;
END;
$audit$;

-- ---------------------------------------------------------------------------
-- Composite tenant keys. Keeping workspace_id in each foreign key makes a
-- caller-supplied workspace identifier part of referential integrity rather
-- than merely an RLS input.
-- ---------------------------------------------------------------------------

ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_id_workspace_key UNIQUE (id, workspace_id);

ALTER TABLE public.media_folders
  ADD CONSTRAINT media_folders_id_workspace_key UNIQUE (id, workspace_id);

ALTER TABLE public.media_folders
  DROP CONSTRAINT IF EXISTS media_folders_parent_folder_id_fkey,
  ADD CONSTRAINT media_folders_parent_workspace_fkey
    FOREIGN KEY (parent_folder_id, workspace_id)
    REFERENCES public.media_folders(id, workspace_id)
    ON DELETE CASCADE;

ALTER TABLE public.post_variants
  DROP CONSTRAINT IF EXISTS post_variants_content_item_id_fkey,
  ADD CONSTRAINT post_variants_content_workspace_fkey
    FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES public.content_items(id, workspace_id)
    ON DELETE CASCADE;

ALTER TABLE public.approvals
  DROP CONSTRAINT IF EXISTS approvals_content_item_id_fkey,
  ADD CONSTRAINT approvals_content_workspace_fkey
    FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES public.content_items(id, workspace_id)
    ON DELETE CASCADE;

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_content_item_id_fkey,
  ADD CONSTRAINT comments_content_workspace_fkey
    FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES public.content_items(id, workspace_id)
    ON DELETE CASCADE;

ALTER TABLE public.publish_attempts
  DROP CONSTRAINT IF EXISTS publish_attempts_content_item_id_fkey,
  ADD CONSTRAINT publish_attempts_content_workspace_fkey
    FOREIGN KEY (content_item_id, workspace_id)
    REFERENCES public.content_items(id, workspace_id)
    ON DELETE CASCADE;

ALTER TABLE public.social_strategy_items
  DROP CONSTRAINT IF EXISTS social_strategy_items_related_content_item_id_fkey,
  ADD CONSTRAINT social_strategy_related_content_workspace_fkey
    FOREIGN KEY (related_content_item_id, workspace_id)
    REFERENCES public.content_items(id, workspace_id)
    ON DELETE SET NULL (related_content_item_id);

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_folder_id_fkey,
  ADD CONSTRAINT media_assets_folder_workspace_fkey
    FOREIGN KEY (folder_id, workspace_id)
    REFERENCES public.media_folders(id, workspace_id)
    ON DELETE SET NULL (folder_id);

CREATE INDEX IF NOT EXISTS post_variants_workspace_content_idx
  ON public.post_variants(workspace_id, content_item_id);
CREATE INDEX IF NOT EXISTS approvals_workspace_content_idx
  ON public.approvals(workspace_id, content_item_id);
CREATE INDEX IF NOT EXISTS comments_workspace_content_idx
  ON public.comments(workspace_id, content_item_id);
CREATE INDEX IF NOT EXISTS publish_attempts_workspace_content_idx
  ON public.publish_attempts(workspace_id, content_item_id);
CREATE INDEX IF NOT EXISTS social_strategy_related_content_workspace_idx
  ON public.social_strategy_items(workspace_id, related_content_item_id)
  WHERE related_content_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_assets_workspace_folder_idx
  ON public.media_assets(workspace_id, folder_id)
  WHERE folder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_folders_workspace_parent_idx
  ON public.media_folders(workspace_id, parent_folder_id)
  WHERE parent_folder_id IS NOT NULL;

-- UUID arrays cannot use a native foreign key. Validate every content write,
-- remove references transactionally when an asset is deleted, and prevent a
-- referenced asset from being moved to another tenant.
CREATE OR REPLACE FUNCTION public.validate_content_media_asset_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(NEW.media_asset_ids, '{}'::uuid[])) AS selected(asset_id)
    WHERE selected.asset_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.media_assets AS asset
         WHERE asset.id = selected.asset_id
           AND asset.workspace_id = NEW.workspace_id
       )
  ) THEN
    RAISE EXCEPTION 'content_media_asset_workspace_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_media_asset_tenant_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     AND EXISTS (
       SELECT 1
       FROM public.content_items AS item
       WHERE item.media_asset_ids @> ARRAY[OLD.id]::uuid[]
     ) THEN
    RAISE EXCEPTION 'referenced_media_asset_workspace_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_deleted_media_asset_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.content_items
  SET media_asset_ids = array_remove(media_asset_ids, OLD.id)
  WHERE workspace_id = OLD.workspace_id
    AND media_asset_ids @> ARRAY[OLD.id]::uuid[];
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_content_media_asset_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_media_asset_tenant_references() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_deleted_media_asset_references() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS content_items_validate_media_assets ON public.content_items;
CREATE TRIGGER content_items_validate_media_assets
  BEFORE INSERT OR UPDATE OF workspace_id, media_asset_ids ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_content_media_asset_ids();

DROP TRIGGER IF EXISTS media_assets_guard_tenant_move ON public.media_assets;
CREATE TRIGGER media_assets_guard_tenant_move
  BEFORE UPDATE OF workspace_id ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.guard_media_asset_tenant_references();

DROP TRIGGER IF EXISTS media_assets_remove_content_references ON public.media_assets;
CREATE TRIGGER media_assets_remove_content_references
  AFTER DELETE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_media_asset_references();

-- ---------------------------------------------------------------------------
-- Entitlements. Public subscriptions remain OS-only. DWM feature overrides
-- still win, and inactive/expired workspace behavior remains unchanged.
-- ---------------------------------------------------------------------------

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
      RETURN _social_plan IN ('full', 'expanded');
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

REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_workspace_feature(
  _workspace_id uuid,
  _feature text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.can_staff_manage_workspace(auth.uid(), _workspace_id)
      OR (
        public.is_workspace_member(auth.uid(), _workspace_id)
        AND public.has_feature(_workspace_id, _feature)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace_feature(
  _workspace_id uuid,
  _feature text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.can_staff_manage_workspace(auth.uid(), _workspace_id)
      OR (
        public.has_feature(_workspace_id, _feature)
        AND coalesce(public.workspace_role(auth.uid(), _workspace_id)::text, '')
          IN ('owner', 'admin', 'editor')
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.can_access_workspace_feature(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_workspace_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_workspace_feature(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace_feature(uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Authenticated content/media writes. Existing SELECT policies are retained.
-- Service-role integrations continue to bypass RLS.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "members write content" ON public.content_items;
DROP POLICY IF EXISTS "members update content" ON public.content_items;
DROP POLICY IF EXISTS "members delete content" ON public.content_items;

CREATE POLICY "authorized authors create content"
  ON public.content_items FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_workspace_feature(workspace_id, 'can_create_content')
    AND created_by = (SELECT auth.uid())
    AND status = 'draft'
  );

CREATE POLICY "authorized authors update content"
  ON public.content_items FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_create_content'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_create_content'));

CREATE POLICY "authorized authors delete content"
  ON public.content_items FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_create_content'));

DROP POLICY IF EXISTS "members access variants" ON public.post_variants;

CREATE POLICY "members read variants"
  ON public.post_variants FOR SELECT TO authenticated
  USING (
    public.is_workspace_member((SELECT auth.uid()), workspace_id)
    OR public.is_dream_wave_staff((SELECT auth.uid()))
  );

CREATE POLICY "authorized authors create variants"
  ON public.post_variants FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_create_content'));

CREATE POLICY "authorized authors update variants"
  ON public.post_variants FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_create_content'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_create_content'));

CREATE POLICY "authorized authors delete variants"
  ON public.post_variants FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_create_content'));

DROP POLICY IF EXISTS "workspace members insert folders" ON public.media_folders;
DROP POLICY IF EXISTS "workspace members update folders" ON public.media_folders;
DROP POLICY IF EXISTS "workspace members delete folders" ON public.media_folders;

CREATE POLICY "authorized media editors create folders"
  ON public.media_folders FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

CREATE POLICY "authorized media editors update folders"
  ON public.media_folders FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

CREATE POLICY "authorized media editors delete folders"
  ON public.media_folders FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

DROP POLICY IF EXISTS "workspace members insert assets" ON public.media_assets;
DROP POLICY IF EXISTS "workspace members update assets" ON public.media_assets;
DROP POLICY IF EXISTS "workspace members delete assets" ON public.media_assets;

CREATE POLICY "authorized media editors create assets"
  ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

CREATE POLICY "authorized media editors update assets"
  ON public.media_assets FOR UPDATE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'))
  WITH CHECK (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

CREATE POLICY "authorized media editors delete assets"
  ON public.media_assets FOR DELETE TO authenticated
  USING (public.can_manage_workspace_feature(workspace_id, 'can_upload_media'));

-- Storage writes must match the database-table authorization. A CASE protects
-- the UUID cast from malformed object keys.
DROP POLICY IF EXISTS "media: workspace members upload" ON storage.objects;
DROP POLICY IF EXISTS "media: workspace members update" ON storage.objects;
DROP POLICY IF EXISTS "media: workspace members delete" ON storage.objects;

CREATE POLICY "media: authorized editors upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND public.can_manage_workspace_feature(
      CASE
        WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN split_part(name, '/', 1)::uuid
        ELSE NULL
      END,
      'can_upload_media'
    )
  );

CREATE POLICY "media: authorized editors update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'media'
    AND public.can_manage_workspace_feature(
      CASE
        WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN split_part(name, '/', 1)::uuid
        ELSE NULL
      END,
      'can_upload_media'
    )
  )
  WITH CHECK (
    bucket_id = 'media'
    AND public.can_manage_workspace_feature(
      CASE
        WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN split_part(name, '/', 1)::uuid
        ELSE NULL
      END,
      'can_upload_media'
    )
  );

CREATE POLICY "media: authorized editors delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'media'
    AND public.can_manage_workspace_feature(
      CASE
        WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN split_part(name, '/', 1)::uuid
        ELSE NULL
      END,
      'can_upload_media'
    )
  );

-- Status transitions are enforced even when a caller attempts to bypass the
-- application and update content_items through PostgREST directly.
CREATE OR REPLACE FUNCTION public.enforce_content_item_write_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _approval_required boolean;
  _data_source text;
  _role public.workspace_member_role;
BEGIN
  -- Webhooks and vetted server integrations use service_role and have no JWT
  -- subject. Their existing operational paths are not changed here.
  IF _uid IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'content_must_begin_as_draft' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'content_workspace_is_immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('publishing', 'published', 'archived')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal_content_status_is_immutable' USING ERRCODE = '42501';
  END IF;

  -- Only the service-role publisher may claim work or record a provider
  -- success. Browser-authenticated callers must use the approval/scheduling
  -- RPCs and can never manufacture terminal publishing state directly.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('publishing', 'published') THEN
    RAISE EXCEPTION 'publisher_service_role_required' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'scheduled'
     AND (NEW.scheduled_at IS NULL OR NEW.scheduled_at <= now()) THEN
    RAISE EXCEPTION 'schedule_time_must_be_future' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'approved' AND NEW.scheduled_at IS NOT NULL THEN
    RAISE EXCEPTION 'approved_content_cannot_have_schedule_time' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('approved', 'scheduled')
     AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION 'content_approval_attribution_required' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved', 'scheduled') THEN
    IF NEW.approved_by IS DISTINCT FROM _uid THEN
      RAISE EXCEPTION 'content_approval_actor_mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT approval_required, data_source
      INTO _approval_required, _data_source
      FROM public.workspaces
      WHERE id = NEW.workspace_id;
    _role := public.workspace_role(_uid, NEW.workspace_id);
    IF _data_source <> 'os_data'
       AND _approval_required
       AND NOT public.can_staff_manage_workspace(_uid, NEW.workspace_id)
       AND coalesce(_role::text, '') NOT IN ('owner', 'admin', 'approver') THEN
      RAISE EXCEPTION 'content_approval_required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'scheduled'
     AND NOT (
       public.has_feature(NEW.workspace_id, 'can_publish_content')
       AND public.has_feature(NEW.workspace_id, 'can_schedule_content')
       OR public.can_staff_manage_workspace(_uid, NEW.workspace_id)
     ) THEN
    RAISE EXCEPTION 'scheduling_not_included' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = 'approved'
     AND NOT (
       public.has_feature(NEW.workspace_id, 'can_publish_content')
       OR public.can_staff_manage_workspace(_uid, NEW.workspace_id)
     ) THEN
    RAISE EXCEPTION 'publishing_not_included' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_content_item_write_rules() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS content_items_enforce_authenticated_writes ON public.content_items;
CREATE TRIGGER content_items_enforce_authenticated_writes
  BEFORE INSERT OR UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_content_item_write_rules();

-- Keep the established approval workflow, but add plan checks at its database
-- boundary so MCP or direct RPC callers cannot bypass entitlements.
CREATE OR REPLACE FUNCTION public.submit_content_for_approval(
  _content_id uuid,
  _requested_action text,
  _scheduled_at timestamptz DEFAULT NULL
)
RETURNS public.content_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _item public.content_items%ROWTYPE;
  _workspace public.workspaces%ROWTYPE;
  _role public.workspace_member_role;
  _next public.content_status;
  _staff_can_manage boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _requested_action NOT IN ('publish_now', 'schedule') THEN
    RAISE EXCEPTION 'invalid_requested_action';
  END IF;
  IF _requested_action = 'schedule'
     AND (_scheduled_at IS NULL OR _scheduled_at <= now()) THEN
    RAISE EXCEPTION 'schedule_time_must_be_future';
  END IF;

  SELECT * INTO _item
  FROM public.content_items
  WHERE id = _content_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'content_not_found'; END IF;

  SELECT * INTO _workspace
  FROM public.workspaces
  WHERE id = _item.workspace_id;

  _role := public.workspace_role(_uid, _item.workspace_id);
  _staff_can_manage := public.can_staff_manage_workspace(_uid, _item.workspace_id);
  IF NOT _staff_can_manage
     AND coalesce(_role::text, '') NOT IN ('owner', 'admin', 'editor', 'approver') THEN
    RAISE EXCEPTION 'not_allowed_to_submit';
  END IF;
  IF _item.status IN ('publishing', 'published', 'archived') THEN
    RAISE EXCEPTION 'content_cannot_be_submitted';
  END IF;
  IF NOT _staff_can_manage
     AND NOT public.has_feature(_item.workspace_id, 'can_publish_content') THEN
    RAISE EXCEPTION 'publishing_not_included';
  END IF;
  IF _requested_action = 'schedule'
     AND NOT _staff_can_manage
     AND NOT public.has_feature(_item.workspace_id, 'can_schedule_content') THEN
    RAISE EXCEPTION 'scheduling_not_included';
  END IF;

  -- Public WaveOS workspaces are self-service. Client workspaces retain their
  -- configurable approval workflow, including the staff/direct-release path.
  IF _workspace.data_source = 'os_data'
     OR NOT _workspace.approval_required
     OR _item.workspace_id = '11111111-1111-1111-1111-111111111111'::uuid THEN
    _next := CASE WHEN _requested_action = 'schedule'
      THEN 'scheduled'::public.content_status
      ELSE 'approved'::public.content_status END;
    UPDATE public.content_items
    SET status = _next,
        scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
        approved_by = _uid,
        approved_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'approval_request', jsonb_build_object(
            'action', _requested_action,
            'submitted_by', _uid,
            'submitted_at', now(),
            'automatically_approved', true
          )
        )
    WHERE id = _item.id;
    RETURN _next;
  END IF;

  INSERT INTO public.approvals (content_item_id, workspace_id, decision, note)
  VALUES (
    _item.id,
    _item.workspace_id,
    'pending',
    CASE WHEN _requested_action = 'schedule'
      THEN 'Requested schedule: ' || _scheduled_at::text
      ELSE 'Requested immediate publishing' END
  );

  UPDATE public.content_items
  SET status = 'in_review',
      scheduled_at = CASE WHEN _requested_action = 'schedule' THEN _scheduled_at ELSE NULL END,
      approved_by = NULL,
      approved_at = NULL,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'approval_request', jsonb_build_object(
          'action', _requested_action,
          'submitted_by', _uid,
          'submitted_at', now()
        )
      )
  WHERE id = _item.id;

  INSERT INTO public.notifications (user_id, workspace_id, kind, title, body, link)
  SELECT members.user_id,
         _item.workspace_id,
         'content_submitted',
         'Content ready for approval',
         coalesce(_item.title, 'Untitled post'),
         '/approvals'
  FROM public.workspace_members AS members
  WHERE members.workspace_id = _item.workspace_id
    AND members.role::text IN ('owner', 'admin', 'approver')
    AND members.user_id <> _uid;

  RETURN 'in_review'::public.content_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_content_for_approval(uuid, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_content_for_approval(uuid, text, timestamptz)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
