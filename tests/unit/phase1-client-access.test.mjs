import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const permissions = read("src/hooks/use-permissions.ts");
assert.match(permissions, /PUBLIC_OS_CURRENT_FEATURES/);
assert.match(
  permissions,
  /subscription\?\.plan === "full" \|\| subscription\?\.plan === "expanded"/,
);
assert.match(permissions, /can_view_analytics_checkup/);

const clientPermissions = read("src/lib/permissions.ts");
assert.match(clientPermissions, /feature === "can_view_analytics_checkup"/);
assert.match(clientPermissions, /access\.status === "active"/);

const appShell = read("src/components/app/app-shell.tsx");
assert.match(appShell, /const LAYER1_NAV[\s\S]*to: "\/analytics"/);
assert.match(appShell, /const WEDDING_ALLOWED_PATHS[\s\S]*"\/analytics"/);
assert.match(appShell, /const WEDDING_NAV[\s\S]*to: "\/analytics"/);

const campaign = read("src/routes/_authenticated/campaigns.tsx");
assert.match(campaign, /can_use_campaign_manager/);
assert.match(campaign, /Nothing here schedules/);
assert.doesNotMatch(campaign, /waveAssist|publishContentItem|stripe/i);

const competitive = read("src/routes/_authenticated/competitive-intelligence.tsx");
assert.match(competitive, /does not scrape competitor accounts/);
assert.match(competitive, /WaveOS-defined manual comparison/);
assert.doesNotMatch(competitive, /fetch\(/);

const creative = read("src/routes/_authenticated/creative-studio.tsx");
assert.match(creative, /Static images only/);
assert.match(creative, /Send to post/);
assert.match(creative, /Apply my brand/);
assert.doesNotMatch(creative, /video\/|FileVideo/);

const createPost = read("src/routes/_authenticated/create.tsx");
assert.match(createPost, /search\.media/);
assert.match(createPost, /Creative Studio image added/);

console.log("Phase 1 client access and safety boundaries passed");
