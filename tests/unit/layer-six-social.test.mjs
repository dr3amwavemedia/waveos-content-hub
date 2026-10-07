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
const separationMigration = readFileSync(
  "supabase/migrations/20261006040214_separate_public_subscriptions_from_clients.sql",
  "utf8",
);
const zernio = readFileSync("src/lib/zernio.functions.ts", "utf8");
const publisher = readFileSync("src/lib/zernio-publish.server.ts", "utf8");
const createRoute = readFileSync("src/routes/_authenticated/create.tsx", "utf8");
const assistant = readFileSync("src/lib/wave-assist.functions.ts", "utf8");
const subscriptionFunctions = readFileSync("src/lib/social-subscriptions.functions.ts", "utf8");
const subscriptionWebhook = readFileSync("src/lib/social-subscription-webhook.server.ts", "utf8");
const tierMigration = readFileSync(
  "supabase/migrations/20261007210000_three_waveos_subscription_tiers.sql",
  "utf8",
);
const settingsRoute = readFileSync("src/routes/_authenticated/settings.tsx", "utf8");
const userContext = readFileSync("src/hooks/use-waveos.ts", "utf8");
const pickerConfig = readFileSync("src/lib/google-picker-config.server.ts", "utf8");
const pickerApi = readFileSync("src/routes/api/external-media/$provider.files.ts", "utf8");
const adminRoute = readFileSync("src/routes/_authenticated/admin.tsx", "utf8");
const mediaHooks = readFileSync("src/hooks/use-media.ts", "utf8");
const contentRoute = readFileSync("src/routes/_authenticated/content.tsx", "utf8");
const mediaCleanup = readFileSync("src/lib/temporary-media-cleanup.server.ts", "utf8");
const zernioWebhook = readFileSync("src/routes/api/public/hooks/zernio.ts", "utf8");
const mediaQuotaMigration = readFileSync(
  "supabase/migrations/20261007215734_temporary_media_storage_limits.sql",
  "utf8",
);
const duplicateAccountMigration = readFileSync(
  "supabase/migrations/20261007235500_tidal_duplicate_platform_accounts.sql",
  "utf8",
);

test("promo trial and three paid tiers enforce account caps, prices, and annual discounts", () => {
  assert.equal(planExports.SOCIAL_PLANS.trial.accountLimit, 3);
  assert.equal(planExports.SOCIAL_PLANS.standard.accountLimit, 3);
  assert.equal(planExports.SOCIAL_PLANS.standard.monthlyCents, 3999);
  assert.equal(planExports.SOCIAL_PLANS.standard.annualCents, 47988);
  assert.equal(planExports.SOCIAL_PLANS.full.accountLimit, 4);
  assert.equal(planExports.SOCIAL_PLANS.full.monthlyCents, 6999);
  assert.equal(planExports.SOCIAL_PLANS.full.annualCents, 79789);
  assert.equal(planExports.SOCIAL_PLANS.expanded.accountLimit, 8);
  assert.equal(planExports.SOCIAL_PLANS.expanded.monthlyCents, 11999);
  assert.equal(planExports.SOCIAL_PLANS.expanded.annualCents, 129589);
  assert.equal(planExports.socialPlanAllowsBillingInterval("standard", "monthly"), true);
  assert.equal(planExports.socialPlanAllowsBillingInterval("standard", "annual"), true);
  assert.equal(planExports.socialPlanAllowsBillingInterval("expanded", "monthly"), true);
  assert.equal(planExports.socialPlanAllowsBillingInterval("expanded", "annual"), true);
});

test("Stripe subscription invoices are saved and shown in a collapsed billing history", () => {
  assert.match(tierMigration, /workspace_social_subscription_invoices/);
  assert.match(tierMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(subscriptionWebhook, /eventType\.startsWith\("invoice\."\)/);
  assert.match(subscriptionWebhook, /hosted_invoice_url/);
  assert.match(settingsRoute, /<details[\s\S]*Billing history/);
  assert.match(settingsRoute, /View invoice/);
});

test("public subscriptions and Dream Wave client service tiers stay separate", () => {
  assert.match(separationMigration, /workspace\.data_source = 'os_data'/);
  assert.match(separationMigration, /public_subscription_workspace_required/);
  assert.match(separationMigration, /DROP TRIGGER IF EXISTS ensure_social_management_entitlement/);
  assert.match(
    separationMigration,
    /_workspace\.access_tier IN \('retainer_full', 'social_management'\)/,
  );
  assert.doesNotMatch(separationMigration, /DELETE FROM public\.workspace_social_subscriptions/);

  assert.match(userContext, /data_source: "client_data" \| "os_data"/);
  assert.match(userContext, /select\([\s\S]{0,40}"id,name,slug,data_source,/);
  assert.match(settingsRoute, /activeWorkspace\?\.data_source === "os_data" && canManageBranding/);
  assert.match(
    settingsRoute,
    /activeWorkspace\?\.data_source === "client_data" && canManageApproval/,
  );
  assert.match(
    settingsRoute,
    /activeWorkspace\?\.data_source === "client_data"[\s\S]*canViewFinancials/,
  );

  assert.match(subscriptionFunctions, /requirePublicOsWorkspace/);
  assert.match(subscriptionFunctions, /workspace\?\.data_source !== "os_data"/);
  assert.match(subscriptionWebhook, /workspace\?\.data_source !== "os_data"/);
});

test("connection limits are enforced server-side and Snapchat remains closed beta", () => {
  assert.match(zernio, /connectedAccounts.*>= Number\(limit/);
  assert.match(zernio, /Snapchat connections are still a closed Zernio beta/);
  assert.match(publisher, /Disconnect the extra accounts or upgrade before publishing/);
});

test("Tidal supports duplicate-network accounts without losing the eight-account cap", () => {
  const social = readFileSync("src/routes/_authenticated/social.tsx", "utf8");
  assert.match(
    duplicateAccountMigration,
    /DROP CONSTRAINT IF EXISTS social_connections_workspace_id_platform_key/,
  );
  assert.match(duplicateAccountMigration, /UNIQUE \(workspace_id, provider, provider_account_id\)/);
  assert.match(duplicateAccountMigration, /zernio_workspace_subprofiles/);
  assert.match(zernio, /plan !== "expanded"/);
  assert.match(zernio, /Additional accounts from the same social network are available on Tidal/);
  assert.match(social, /Add another/);
  assert.match(social, /up\s+to eight connected accounts total/);
  assert.match(createRoute, /Choose .* destination/);
  assert.match(createRoute, /accountIds/);
  assert.match(publisher, /Choose at least one .* account in the post editor/);
  assert.match(publisher, /selectedConnections\.map/);
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
  assert.match(pickerConfig, /appIdValid: \/\^\\d\+\$\//);
  assert.match(pickerConfig, /apiKeyValid: \/\^AIza/);
  assert.match(pickerApi, /must be the numeric Google Cloud project number/);
  assert.match(pickerApi, /browser API key beginning with AIza/);
  assert.match(adminRoute, /picker_app_id_valid/);
  assert.match(adminRoute, /picker_api_key_valid/);
});

test("local media quotas preserve storage headroom and are enforced in both UI and database", () => {
  assert.match(mediaQuotaMigration, /file_size_limit = 314572800/);
  assert.match(mediaQuotaMigration, /_workspace_limit constant bigint := 524288000/);
  assert.match(mediaQuotaMigration, /_global_limit constant bigint := 1610612736/);
  assert.match(mediaQuotaMigration, /CREATE TRIGGER enforce_media_storage_quotas/);
  assert.match(mediaHooks, /MEDIA_FILE_LIMIT_BYTES = 300 \* 1024 \* 1024/);
  assert.match(mediaHooks, /WORKSPACE_MEDIA_LIMIT_BYTES = 500 \* 1024 \* 1024/);
  assert.match(mediaHooks, /Not enough local storage/);
  assert.match(mediaHooks, /WaveOS shared storage is temporarily full/);
  assert.match(contentRoute, /Local storage/);
  assert.match(contentRoute, /300 MB each/);
  assert.match(contentRoute, /Local storage is nearly full/);
});

test("camera-roll media is temporary and removed only after every Zernio destination succeeds", () => {
  assert.match(createRoute, /temporary: true/);
  assert.match(mediaHooks, /TEMPORARY_POST_UPLOAD_TAG = "temporary-post-upload"/);
  assert.match(mediaCleanup, /attempts\.some\(\(attempt\) => attempt\.status !== "success"\)/);
  assert.match(mediaCleanup, /source_provider !== "waveos"/);
  assert.match(mediaCleanup, /\.contains\("media_asset_ids", \[asset\.id\]\)/);
  assert.match(mediaCleanup, /\.remove\(\[asset\.storage_path\]\)/);
  assert.match(publisher, /cleanupConfirmedTemporaryMedia/);
  assert.match(zernioWebhook, /cleanupConfirmedTemporaryMedia/);
});

test("WaveOS folders can mix local, Google Drive, and Dropbox references", () => {
  assert.match(contentRoute, /label="Local device"/);
  assert.match(contentRoute, /label="Google Drive"/);
  assert.match(contentRoute, /label="Dropbox"/);
  assert.match(contentRoute, /useMediaAssets\(workspaceId, \{[\s\S]*source:/);
  assert.match(contentRoute, /upload\.mutateAsync\(\{ file, folderId, tags: \[\] \}\)/);
  assert.match(contentRoute, /Google Drive and Dropbox references do not use/);
  assert.doesNotMatch(contentRoute, /label="Frame\.io"/);
});
