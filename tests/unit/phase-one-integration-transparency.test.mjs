import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assistant = readFileSync("src/lib/wave-assist.functions.ts", "utf8");
const zernio = readFileSync("src/lib/zernio.functions.ts", "utf8");
const analyticsRoute = readFileSync("src/routes/_authenticated/analytics.tsx", "utf8");
const analyticsUi = readFileSync("src/components/social/analytics-checkup.tsx", "utf8");
const clients = readFileSync("src/routes/_authenticated/clients.tsx", "utf8");
const publishResults = readFileSync("src/components/social/publish-results.tsx", "utf8");

test("AI assist requires validated workspace-scoped entitlement on every request", () => {
  assert.match(assistant, /workspaceId: z\.string\(\)\.uuid\(\)/);
  assert.match(assistant, /input: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(6_000\)/);
  assert.match(assistant, /_feature: "can_use_ai_tools"/);
  assert.match(assistant, /if \(!member && !staff\) throw new Error\("forbidden"\)/);
  assert.match(assistant, /max_tokens: 1_500/);
  assert.match(assistant, /controller\.abort\(\)/);
});

test("analytics checkup is independently entitled and transparent", () => {
  assert.match(zernio, /"can_view_analytics_checkup"/);
  assert.match(analyticsRoute, /feature="can_view_analytics_checkup"/);
  assert.doesNotMatch(analyticsRoute, /redirect/);
  assert.match(analyticsUi, /WaveOS\s+does not replace them with zero/);
  assert.match(analyticsUi, /Calculation/);
  assert.match(analyticsUi, /Records used/);
  assert.match(analyticsUi, /Available range/);
});

test("billing and publishing copy distinguish true system state", () => {
  assert.match(clients, /Admin payment flag:/);
  assert.match(clients, /does not change Stripe/);
  assert.match(publishResults, /attempt\.provider_post_id \?\? attempt\.ayrshare_post_id/);
});
