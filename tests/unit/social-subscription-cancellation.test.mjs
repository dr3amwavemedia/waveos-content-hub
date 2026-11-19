import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const functions = readFileSync(
  new URL("../../src/lib/social-subscriptions.functions.ts", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../../src/routes/_authenticated/settings.tsx", import.meta.url),
  "utf8",
);
const webhook = readFileSync(
  new URL("../../src/lib/social-subscription-webhook.server.ts", import.meta.url),
  "utf8",
);

test("WaveOS cancellation changes Stripe before reconciling local subscription state", () => {
  assert.match(functions, /export const updateSocialSubscriptionCancellation/);
  assert.match(functions, /requireWorkspaceAdmin/);
  assert.match(functions, /requirePublicOsWorkspace/);
  assert.match(functions, /stripe_subscription_id,stripe_customer_id/);
  assert.match(functions, /cancel_at_period_end: data\.cancelAtPeriodEnd/);
  assert.match(functions, /stripeModeMatches\(current\.livemode\)/);
  assert.match(functions, /customer\.subscription\.updated/);
  assert.match(functions, /applySocialSubscriptionEvent/);
  assert.doesNotMatch(functions, /method:\s*"DELETE"/);
});

test("settings clearly schedules and reverses period-end cancellation", () => {
  assert.match(settings, /Manage payment method in Stripe/);
  assert.match(settings, /Cancel at period end/);
  assert.match(settings, /Keep subscription active/);
  assert.match(settings, /Schedule cancellation/);
  assert.match(settings, /does not issue a refund or delete workspace data/);
});

test("Stripe webhook reconciliation remains authoritative for provider-side cancellations", () => {
  assert.match(webhook, /eventType\.startsWith\("customer\.subscription\."\)/);
  assert.match(webhook, /cancel_at_period_end: subscription\.cancel_at_period_end/);
  assert.match(webhook, /"canceled", "unpaid", "incomplete_expired"/);
});
