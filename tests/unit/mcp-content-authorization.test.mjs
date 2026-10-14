import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createDraft = readFileSync("src/lib/mcp/tools/create-content-draft.ts", "utf8");
const schedule = readFileSync("src/lib/mcp/tools/schedule-content.ts", "utf8");
const publisher = readFileSync("src/lib/zernio-publish.server.ts", "utf8");
const createRoute = readFileSync("src/routes/_authenticated/create.tsx", "utf8");
const publishFunctions = readFileSync("src/lib/publish.functions.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261014120000_phase1_security_and_entitlements.sql",
  "utf8",
);

test("MCP draft creation maps body input to the real primary_caption column", () => {
  assert.match(createDraft, /primary_caption: body/);
  assert.doesNotMatch(createDraft, /\n\s*body,\n/);
  assert.match(createDraft, /_feature: "can_create_content"/);
  assert.match(createDraft, /rpc\("workspace_role"/);
  assert.match(createDraft, /rpc\("can_staff_manage_workspace"/);
  assert.match(createDraft, /\["owner", "admin", "editor"\]/);
  assert.match(createDraft, /created_by: actorUserId/);
});

test("MCP scheduling goes through the database approval and entitlement boundary", () => {
  assert.match(schedule, /_feature: "can_schedule_content"/);
  assert.match(schedule, /rpc\("can_staff_manage_workspace"/);
  assert.match(schedule, /rpc\("submit_content_for_approval"/);
  assert.match(schedule, /_requested_action: "schedule"/);
  assert.match(schedule, /idempotentHint: false/);
  assert.doesNotMatch(schedule, /\.update\(\{ status: "scheduled"/);
  assert.match(migration, /FUNCTION public\.submit_content_for_approval/);
  assert.match(migration, /public\.has_feature\(_item\.workspace_id, 'can_schedule_content'\)/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.submit_content_for_approval[\s\S]*FROM PUBLIC, anon/,
  );
});

test("the service-role publisher filters variants by the parent workspace", () => {
  assert.match(
    publisher,
    /\.eq\("content_item_id", contentId\)[\s\S]*?\.eq\("workspace_id", item\.workspace_id\)[\s\S]*?\.eq\("enabled", true\)/,
  );
});

test("service-role publishing rechecks plans and completes preflight before its atomic claim", () => {
  assert.match(publisher, /key: "can_publish_content"/);
  assert.match(publisher, /key: "can_schedule_content"/);
  assert.ok(
    publisher.indexOf('rpc("has_feature"') < publisher.indexOf("`/accounts?${accountParams}`"),
    "entitlements must be checked before provider account calls",
  );
  assert.ok(
    publisher.indexOf("const preparedVariants") <
      publisher.indexOf('.update({ status: "publishing" })'),
    "variant, media, and account preflight must finish before the publishing claim",
  );
  assert.match(publisher, /\.eq\("connection_state", "connected"\)/);
  assert.match(
    publisher,
    /\.eq\("workspace_id", item\.workspace_id\)[\s\S]*?\.eq\("status", item\.status\)[\s\S]*?\.select\("id"\)/,
  );
  assert.match(
    publisher,
    /\.update\(\{ status: "failed" \}\)[\s\S]*?Failed to recover content publishing state/,
  );
});

test("the create workflow uses the approval RPC rather than direct privileged status writes", () => {
  assert.match(createRoute, /useSubmitForApproval\(\)/);
  assert.match(createRoute, /requestedAction: "schedule"/);
  assert.match(createRoute, /requestedAction: "publish_now"/);
  assert.doesNotMatch(createRoute, /patch: \{ status: "scheduled"/);
  assert.doesNotMatch(createRoute, /patch: \{ status: "approved"/);
});

test("interactive publishing requires workspace writer authorization", () => {
  assert.match(publishFunctions, /requireSocialWorkspaceWriter/);
  assert.doesNotMatch(publishFunctions, /requireSocialWorkspaceAccess/);
  assert.match(
    publishFunctions,
    /requireSocialWorkspaceWriter\(context\.supabase, context\.userId, item\.workspace_id\)/,
  );
});
