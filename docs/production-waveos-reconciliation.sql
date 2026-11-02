-- WaveOS production reconciliation runbook
-- Target only: Supabase project tbucuohokbklgauxlpia (WaveOS / main / PRODUCTION).
-- VisionStudios is out of scope.
--
-- Run SECTION A before applying:
--   supabase/migrations/20261102233529_reconcile_waveos_production_baseline.sql
-- Save the result grids. Run SECTION B only after that migration commits.
-- Every statement is read-only.

-- ============================================================================
-- SECTION A — PRE-APPLY SNAPSHOT
-- ============================================================================

SELECT version, name, created_by, idempotency_key,
       cardinality(statements) AS statement_count,
       cardinality(rollback) AS rollback_count
FROM supabase_migrations.schema_migrations
WHERE version > '20260814013731'
ORDER BY version;

WITH target(schema_name, object_name) AS (
  VALUES
    ('public','social_strategy_items'),
    ('public','calendar_categories'),
    ('public','calendar_color_preferences'),
    ('public','workspace_social_subscriptions'),
    ('public','workspace_social_subscription_invoices'),
    ('public','os_promo_codes'),
    ('public','os_promo_redemptions'),
    ('public','publishing_controls'),
    ('public','social_subscription_lifecycle'),
    ('public','os_account_support_requests'),
    ('public','invoice_autopay_schedules'),
    ('public','invoice_delivery_locks'),
    ('public','delivery_payment_holds'),
    ('public','payment_ledger'),
    ('public','global_invoice_number_counter'),
    ('public','campaign_plans'),
    ('public','ai_usage_events')
)
SELECT target.schema_name, target.object_name,
       CASE WHEN relation.oid IS NULL THEN 'absent' ELSE 'present' END AS state,
       relation.relkind,
       relation.relrowsecurity
FROM target
LEFT JOIN pg_namespace namespace
  ON namespace.nspname = target.schema_name
LEFT JOIN pg_class relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = target.object_name
ORDER BY target.schema_name, target.object_name;

SELECT 'workspaces' AS entity,
       count(*) AS row_count,
       count(*) FILTER (WHERE is_archived) AS archived_count,
       min(created_at) AS first_created_at,
       max(created_at) AS last_created_at
FROM public.workspaces
UNION ALL
SELECT 'profiles', count(*), 0, min(created_at), max(created_at)
FROM public.profiles
UNION ALL
SELECT 'client_invoices', count(*),
       count(*) FILTER (WHERE status::text IN ('paid','void')),
       min(created_at), max(created_at)
FROM public.client_invoices
UNION ALL
SELECT 'webhook_events', count(*),
       count(*) FILTER (WHERE processed_at IS NOT NULL),
       min(created_at), max(created_at)
FROM public.webhook_events;

SELECT currency,
       status::text AS status,
       count(*) AS invoice_count,
       coalesce(sum(amount_cents), 0) AS amount_cents_sum,
       min(created_at) AS first_created_at,
       max(created_at) AS last_created_at
FROM public.client_invoices
GROUP BY currency, status::text
ORDER BY currency, status::text;

SELECT source, count(*) AS webhook_count,
       count(*) FILTER (WHERE external_id IS NOT NULL) AS external_id_count,
       count(*) FILTER (WHERE processed_at IS NOT NULL) AS processed_count
FROM public.webhook_events
GROUP BY source
ORDER BY source;

SELECT check_name, mismatch_count
FROM (
  SELECT 'post_variants_workspace' AS check_name, count(*) AS mismatch_count
  FROM public.post_variants child
  JOIN public.content_items parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id

  UNION ALL
  SELECT 'approvals_workspace', count(*)
  FROM public.approvals child
  JOIN public.content_items parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id

  UNION ALL
  SELECT 'comments_workspace', count(*)
  FROM public.comments child
  JOIN public.content_items parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id

  UNION ALL
  SELECT 'publish_attempts_workspace', count(*)
  FROM public.publish_attempts child
  JOIN public.content_items parent ON parent.id = child.content_item_id
  WHERE child.workspace_id <> parent.workspace_id

  UNION ALL
  SELECT 'media_assets_folder_workspace', count(*)
  FROM public.media_assets child
  JOIN public.media_folders parent ON parent.id = child.folder_id
  WHERE child.folder_id IS NOT NULL
    AND child.workspace_id <> parent.workspace_id

  UNION ALL
  SELECT 'media_folders_parent_workspace', count(*)
  FROM public.media_folders child
  JOIN public.media_folders parent ON parent.id = child.parent_folder_id
  WHERE child.parent_folder_id IS NOT NULL
    AND child.workspace_id <> parent.workspace_id

  UNION ALL
  SELECT 'content_media_asset_ids', count(*)
  FROM public.content_items item
  WHERE EXISTS (
    SELECT 1
    FROM unnest(item.media_asset_ids) selected(asset_id)
    WHERE selected.asset_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.media_assets asset
         WHERE asset.id = selected.asset_id
           AND asset.workspace_id = item.workspace_id
       )
  )
) audit
ORDER BY check_name;

-- Stop if any mismatch_count is non-zero or if the migration history is no
-- longer the verified empty-after-baseline state.

-- ============================================================================
-- SECTION B — POST-APPLY VERIFICATION
-- ============================================================================

WITH expected(object_name) AS (
  VALUES
    ('social_strategy_items'),
    ('calendar_categories'),
    ('calendar_color_preferences'),
    ('workspace_social_subscriptions'),
    ('workspace_social_subscription_invoices'),
    ('os_promo_codes'),
    ('os_promo_redemptions'),
    ('publishing_controls'),
    ('social_subscription_lifecycle'),
    ('os_account_support_requests'),
    ('invoice_autopay_schedules'),
    ('invoice_delivery_locks'),
    ('delivery_payment_holds'),
    ('payment_ledger'),
    ('global_invoice_number_counter'),
    ('product_releases'),
    ('release_user_states'),
    ('release_preferences'),
    ('workflow_drafts'),
    ('social_intelligence_profiles'),
    ('social_intelligence_snapshots'),
    ('creative_designs'),
    ('campaign_plans'),
    ('campaign_plan_items'),
    ('competitors'),
    ('competitive_reports'),
    ('ai_usage_events')
)
SELECT expected.object_name,
       to_regclass('public.' || expected.object_name) IS NOT NULL AS present
FROM expected
ORDER BY expected.object_name;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'workspaces' AND column_name = 'data_source')
    OR (table_name = 'profiles' AND column_name IN ('account_source','payments_enabled'))
    OR (table_name = 'client_invoices' AND column_name IN (
      'amount_paid_cents','billing_month','payment_plan','checkout_payment_type',
      'checkout_payment_cents','line_items','published_at','subtotal_cents',
      'discount_type','discount_value','service_fee_percent','service_fee_cents',
      'processing_fee_at_checkout','delivery_lock_enabled','payment_provider',
      'provider_payment_id','provider_session_id','last_reminder_at','refund_flagged_at'
    ))
    OR table_name IN ('workspace_social_subscriptions','campaign_plans','ai_usage_events')
  )
ORDER BY table_name, ordinal_position;

SELECT namespace.nspname AS schema_name,
       procedure.proname,
       pg_get_function_identity_arguments(procedure.oid) AS arguments,
       procedure.prosecdef AS security_definer,
       procedure.proconfig AS configuration,
       procedure.proacl AS acl
FROM pg_proc procedure
JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname IN ('public','private')
  AND procedure.proname IN (
    'social_subscription_is_active','social_account_limit',
    'start_workspace_social_trial','validate_os_promo_code',
    'provision_os_trial_workspace','activate_public_os_account',
    'expire_os_promo_trials','has_feature',
    'can_access_workspace_feature','can_manage_workspace_feature',
    'claim_webhook_event','record_autopay_payment',
    'next_invoice_number','next_service_invoice_number',
    'submit_content_for_approval'
  )
ORDER BY schema_name, procedure.proname, arguments;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public','storage')
  AND tablename IN (
    'social_strategy_items','calendar_categories','calendar_color_preferences',
    'workspace_social_subscriptions','workspace_social_subscription_invoices',
    'payment_ledger','invoice_autopay_schedules','content_items','post_variants',
    'media_assets','media_folders','objects','campaign_plans','ai_usage_events'
  )
ORDER BY schemaname, tablename, policyname;

SELECT event_object_schema, event_object_table, trigger_name,
       action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema IN ('public','storage')
ORDER BY event_object_schema, event_object_table, trigger_name;

SELECT table_name, row_security_active
FROM (
  SELECT relation.relname AS table_name,
         relation.relrowsecurity AS row_security_active
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'social_strategy_items','calendar_categories','calendar_color_preferences',
      'workspace_social_subscriptions','workspace_social_subscription_invoices',
      'os_promo_codes','os_promo_redemptions','publishing_controls',
      'social_subscription_lifecycle','os_account_support_requests',
      'invoice_autopay_schedules',
      'invoice_delivery_locks','payment_ledger','product_releases',
      'release_user_states','release_preferences','workflow_drafts',
      'social_intelligence_profiles','social_intelligence_snapshots',
      'creative_designs','campaign_plans','campaign_plan_items',
      'competitors','competitive_reports','ai_usage_events'
    )
) rls
ORDER BY table_name;

-- Payment and isolation invariants must all return zero.
SELECT invariant, violation_count
FROM (
  SELECT 'client_data_subscription_rows' AS invariant, count(*) AS violation_count
  FROM public.workspace_social_subscriptions subscription
  JOIN public.workspaces workspace ON workspace.id = subscription.workspace_id
  WHERE workspace.data_source = 'client_data'

  UNION ALL
  SELECT 'duplicate_stripe_subscription_ids', count(*)
  FROM (
    SELECT stripe_subscription_id
    FROM public.workspace_social_subscriptions
    WHERE stripe_subscription_id IS NOT NULL
    GROUP BY stripe_subscription_id HAVING count(*) > 1
  ) duplicates

  UNION ALL
  SELECT 'duplicate_stripe_checkout_ids', count(*)
  FROM (
    SELECT stripe_checkout_session_id
    FROM public.workspace_social_subscriptions
    WHERE stripe_checkout_session_id IS NOT NULL
    GROUP BY stripe_checkout_session_id HAVING count(*) > 1
  ) duplicates

  UNION ALL
  SELECT 'invoice_negative_amount_paid', count(*)
  FROM public.client_invoices
  WHERE amount_paid_cents < 0
     OR (amount_cents IS NOT NULL AND amount_paid_cents > amount_cents)

  UNION ALL
  SELECT 'invoice_total_changed_shape', count(*)
  FROM public.client_invoices
  WHERE subtotal_cents IS DISTINCT FROM amount_cents
    AND jsonb_array_length(line_items) = 0
    AND discount_type IS NULL
    AND service_fee_cents = 0

  UNION ALL
  SELECT 'cross_workspace_social_strategy', count(*)
  FROM public.social_strategy_items strategy
  JOIN public.content_items content ON content.id = strategy.related_content_item_id
  WHERE strategy.related_content_item_id IS NOT NULL
    AND strategy.workspace_id <> content.workspace_id
) checks
ORDER BY invariant;

-- Re-run the SECTION A invoice and webhook aggregate queries and compare them
-- with the saved pre-apply grids. Counts, amount_cents sums, invoice numbers,
-- webhook counts, and webhook processed counts must be unchanged.

