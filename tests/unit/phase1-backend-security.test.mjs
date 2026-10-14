import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const security = readFileSync(
  "supabase/migrations/20261014120000_phase1_security_and_entitlements.sql",
  "utf8",
);
const foundations = readFileSync(
  "supabase/migrations/20261014121000_phase1_foundation_tables.sql",
  "utf8",
);

test("the migration refuses to install over cross-workspace historical rows", () => {
  for (const table of [
    "post_variants",
    "approvals",
    "comments",
    "publish_attempts",
    "social_strategy_items",
    "media_assets",
    "media_folders",
  ]) {
    assert.match(security, new RegExp(`FROM public\\.${table}`));
  }
  assert.match(security, /child\.workspace_id <> parent\.workspace_id/);
  assert.match(security, /asset\.workspace_id <> folder\.workspace_id/);
  assert.match(security, /child\.workspace_id <> parent\.workspace_id/);
  assert.match(security, /unnest\(item\.media_asset_ids\)/);
  assert.match(security, /RAISE EXCEPTION 'phase1 tenant audit failed:/);
});

test("content and folder children use composite tenant foreign keys", () => {
  assert.match(security, /content_items_id_workspace_key UNIQUE \(id, workspace_id\)/);
  assert.match(security, /media_folders_id_workspace_key UNIQUE \(id, workspace_id\)/);
  for (const constraint of [
    "post_variants_content_workspace_fkey",
    "approvals_content_workspace_fkey",
    "comments_content_workspace_fkey",
    "publish_attempts_content_workspace_fkey",
    "social_strategy_related_content_workspace_fkey",
    "media_assets_folder_workspace_fkey",
    "media_folders_parent_workspace_fkey",
  ]) {
    assert.match(security, new RegExp(`CONSTRAINT ${constraint}`));
  }
  assert.match(
    security,
    /FOREIGN KEY \(content_item_id, workspace_id\)[\s\S]*REFERENCES public\.content_items\(id, workspace_id\)/,
  );
  assert.match(security, /ON DELETE SET NULL \(related_content_item_id\)/);
  assert.match(security, /ON DELETE SET NULL \(folder_id\)/);
  assert.match(
    security,
    /FOREIGN KEY \(parent_folder_id, workspace_id\)[\s\S]*REFERENCES public\.media_folders\(id, workspace_id\)[\s\S]*ON DELETE CASCADE/,
  );
});

test("content media arrays are validated and cleaned up transactionally", () => {
  assert.match(security, /FUNCTION public\.validate_content_media_asset_ids/);
  assert.match(security, /asset\.workspace_id = NEW\.workspace_id/);
  assert.match(security, /content_media_asset_workspace_mismatch/);
  assert.match(security, /FUNCTION public\.remove_deleted_media_asset_references/);
  assert.match(security, /array_remove\(media_asset_ids, OLD\.id\)/);
  assert.match(security, /referenced_media_asset_workspace_is_immutable/);
});

test("new entitlements preserve plan boundaries", () => {
  assert.match(security, /_feature = 'can_view_analytics_checkup'[\s\S]*RETURN true/);
  assert.match(
    security,
    /'can_use_creative_studio', 'can_use_campaign_manager',[\s\S]*'can_use_competitive_intelligence'/,
  );
  assert.match(
    security,
    /_feature IN \('can_use_ai_tools', 'can_schedule_content'\)[\s\S]*RETURN _social_status = 'trialing' OR _social_plan IN \('full', 'expanded'\)/,
  );
  assert.match(security, /RETURN _social_plan IN \('full', 'expanded'\)/);
  assert.match(
    security,
    /RETURN _tier::text IN \('retainer_full', 'social_management'\)[\s\S]*social_management_access/,
  );
  assert.match(security, /_status = 'active' AND \(_expires IS NULL OR _expires >= now\(\)\)/);
  assert.ok(
    security.indexOf("_tier::text = 'wedding_client'") <
      security.indexOf("_status IN ('suspended', 'archived')"),
    "the pre-existing wedding-client fallback must remain ahead of general status fallbacks",
  );
});

test("legacy permissive mutation policies are replaced by role and feature checks", () => {
  for (const policy of [
    "members write content",
    "members update content",
    "members delete content",
    "members access variants",
    "workspace members insert folders",
    "workspace members update folders",
    "workspace members delete folders",
    "workspace members insert assets",
    "workspace members update assets",
    "workspace members delete assets",
    "media: workspace members upload",
    "media: workspace members update",
    "media: workspace members delete",
  ]) {
    assert.match(security, new RegExp(`DROP POLICY IF EXISTS "${policy}"`));
  }
  assert.match(security, /FUNCTION public\.can_manage_workspace_feature/);
  assert.match(security, /IN \('owner', 'admin', 'editor'\)/);
  assert.match(security, /'can_create_content'/);
  assert.match(security, /'can_upload_media'/);
  assert.match(security, /NEW\.scheduled_at IS NULL OR NEW\.scheduled_at <= now\(\)/);
  assert.match(security, /content_approval_attribution_required/);
  assert.match(security, /content_approval_actor_mismatch/);
  assert.match(security, /publisher_service_role_required/);
  assert.doesNotMatch(
    security,
    /NEW\.status IN \('approved', 'publishing', 'published'\)[\s\S]*publishing_not_included/,
  );
  assert.match(
    security,
    /\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$/,
  );
  assert.match(security, /_workspace\.data_source = 'os_data'/);
  assert.match(security, /scheduling_not_included/);
  assert.match(security, /publishing_not_included/);
});

test("all Phase 1 foundations are RLS protected and explicitly exposed", () => {
  const tables = [
    "product_releases",
    "release_user_states",
    "release_preferences",
    "workflow_drafts",
    "social_intelligence_profiles",
    "social_intelligence_snapshots",
    "creative_designs",
    "campaign_plans",
    "campaign_plan_items",
    "competitors",
    "competitive_reports",
  ];
  for (const table of tables) {
    assert.match(foundations, new RegExp(`CREATE TABLE public\\.${table}`));
    assert.match(
      foundations,
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`),
    );
  }
  assert.match(foundations, /FROM PUBLIC, anon/);
  assert.match(foundations, /FROM authenticated/);
  assert.match(foundations, /TO service_role/);
  assert.doesNotMatch(foundations, /INSERT INTO public\.product_releases/);
});

test("per-user and feature-scoped ownership is present on new tables", () => {
  assert.match(foundations, /user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(foundations, /users create own workflow drafts/);
  assert.match(foundations, /can_view_analytics_checkup/);
  assert.match(foundations, /can_use_creative_studio/);
  assert.match(foundations, /can_use_campaign_manager/);
  assert.match(foundations, /can_use_competitive_intelligence/);
  assert.match(foundations, /campaign_plan_items_plan_workspace_fkey/);
  assert.match(foundations, /competitive_reports_competitor_workspace_fkey/);
});

test("social intelligence distinguishes unavailable data from an actual zero", () => {
  assert.match(foundations, /availability = 'true_zero' AND value = 0/);
  assert.match(foundations, /availability NOT IN \('available', 'true_zero'\) AND value IS NULL/);
  assert.match(foundations, /record_count integer NOT NULL DEFAULT 0 CHECK \(record_count >= 0\)/);
  assert.match(foundations, /source_reference text/);
  assert.match(foundations, /calculation_version text/);
});
