import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const planSource = readFileSync("src/lib/social-plans.ts", "utf8");
const compiled = ts.transpileModule(planSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const planExports = {};
new Function("exports", compiled)(planExports);
const migration = readFileSync(
  "supabase/migrations/20261003120000_layer_six_social_subscriptions.sql",
  "utf8",
);
const zernio = readFileSync("src/lib/zernio.functions.ts", "utf8");
const publisher = readFileSync("src/lib/zernio-publish.server.ts", "utf8");
const createRoute = readFileSync("src/routes/_authenticated/create.tsx", "utf8");
const assistant = readFileSync("src/lib/wave-assist.functions.ts", "utf8");

test("trial, Standard and Expanded enforce the requested account caps and prices", () => {
  assert.equal(planExports.SOCIAL_PLANS.trial.accountLimit, 2);
  assert.equal(planExports.SOCIAL_PLANS.standard.accountLimit, 3);
  assert.equal(planExports.SOCIAL_PLANS.standard.monthlyCents, 3999);
  assert.equal(planExports.SOCIAL_PLANS.expanded.accountLimit, 6);
  assert.equal(planExports.SOCIAL_PLANS.expanded.monthlyCents, null);
  assert.equal(planExports.socialPlanAllowsBillingInterval("standard", "monthly"), true);
  assert.equal(planExports.socialPlanAllowsBillingInterval("standard", "annual"), true);
  assert.equal(planExports.socialPlanAllowsBillingInterval("expanded", "monthly"), false);
  assert.equal(planExports.socialPlanAllowsBillingInterval("expanded", "annual"), true);
});

test("existing agency clients stay unchanged except grandfathered social-management clients", () => {
  assert.match(migration, /Existing Social Management clients keep full access/);
  assert.match(migration, /ON CONFLICT \(workspace_id\) DO NOTHING/);
  assert.doesNotMatch(migration, /UPDATE public\.workspaces SET/);
});

test("connection limits are enforced server-side and Snapchat remains closed beta", () => {
  assert.match(zernio, /connectedAccounts.*>= Number\(limit/);
  assert.match(zernio, /Snapchat connections are still a closed Zernio beta/);
  assert.match(publisher, /Disconnect the extra accounts or upgrade before publishing/);
});

test("caption suite uses Brand Voice and Story selection is explicit", () => {
  assert.match(assistant, /Saved Brand Voice/);
  assert.match(assistant, /caption_suite/);
  assert.match(assistant, /google\/gemini-3\.1-flash-lite/);
  assert.match(createRoute, /Draft with Brand Voice/);
  assert.match(createRoute, /value="story"/);
  assert.match(createRoute, /from\("post_variants"\)/);
  assert.match(createRoute, /content_item_id", id/);
});

test("analytics has its own discoverable workspace and exposes engagement signals", () => {
  const social = readFileSync("src/routes/_authenticated/social.tsx", "utf8");
  const analyticsRoute = readFileSync("src/routes/_authenticated/analytics.tsx", "utf8");
  assert.match(social, /"overview" \| "posts" \| "analytics" \| "accounts"/);
  assert.match(social, /label="Likes"/);
  assert.match(social, /label="Reach"/);
  assert.match(social, /label="Impressions"/);
  assert.match(analyticsRoute, /view: "analytics"/);
});

test("Google Picker includes My Drive, Shared with me and Shared drives and remains responsive", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  assert.match(createRoute, /setEnableDrives\(true\)/);
  assert.match(createRoute, /Feature\.SUPPORT_DRIVES/);
  assert.match(createRoute, /setOwnedByMe\(false\)/);
  assert.match(createRoute, /addView\(sharedWithMeView\)/);
  assert.match(createRoute, /addView\(sharedDrivesView\)/);
  assert.match(styles, /\.picker-dialog/);
  assert.match(styles, /100dvh/);
});
