import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("public WaveOS uses a social-only dashboard and navigation", async () => {
  const [home, shell] = await Promise.all([
    read("src/routes/_authenticated/home.tsx"),
    read("src/components/app/app-shell.tsx"),
  ]);
  assert.match(home, /activeWorkspace\?\.data_source === "os_data"/);
  assert.match(home, /return <HomeDashboard \/>/);
  const publicNav = shell.match(/const PUBLIC_OS_NAV[\s\S]*?\n\];/)?.[0] ?? "";
  assert.match(publicNav, /Create Post/);
  assert.match(publicNav, /Social Media/);
  assert.match(publicNav, /Media Library/);
  assert.doesNotMatch(publicNav, /Deliveries|Invoices|Approvals|Request Something/);
});

test("the second failed collection attempt locks social service and payment restores it", async () => {
  const [migration, webhook] = await Promise.all([
    read("supabase/migrations/20261006203000_add_subscription_payment_lock.sql"),
    read("src/lib/social-subscription-webhook.server.ts"),
  ]);
  assert.match(migration, /payment_failure_count < 2/);
  assert.match(migration, /subscription\.service_locked_at IS NULL/);
  assert.match(migration, /IF _data_source = 'os_data'/);
  assert.match(migration, /AND public\.social_subscription_is_active\(_workspace_id\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.social_subscription_is_active/);
  assert.match(webhook, /object\.attempt_count/);
  assert.match(webhook, /attemptCount >= 2/);
  assert.match(webhook, /payment_failure_count: 0/);
  assert.match(webhook, /service_locked_at: null/);
});

test("subscription webhooks send branded success and failure emails", async () => {
  const [webhook, email] = await Promise.all([
    read("src/lib/social-subscription-webhook.server.ts"),
    read("src/lib/social-subscription-email.server.ts"),
  ]);
  assert.match(webhook, /sendSocialSubscriptionEmail/);
  assert.match(email, /social_subscription_payment_succeeded/);
  assert.match(email, /social_subscription_payment_failed/);
  assert.match(email, /social_subscription_payment_failed_locked/);
  assert.match(email, /RESEND_API_KEY/);
});

test("locked subscribers can open Stripe billing without exposing credentials", async () => {
  const [functions, settings] = await Promise.all([
    read("src/lib/social-subscriptions.functions.ts"),
    read("src/routes/_authenticated/settings.tsx"),
  ]);
  assert.match(functions, /createSocialBillingPortal/);
  assert.match(functions, /\/billing_portal\/sessions/);
  assert.match(functions, /requireWorkspaceAdmin/);
  assert.match(settings, /Manage payment method/);
});

test("promo checkout still requires a card and limits access until the selected plan starts", async () => {
  const [functions, webhook, permissions] = await Promise.all([
    read("src/lib/social-subscriptions.functions.ts"),
    read("src/lib/social-subscription-webhook.server.ts"),
    read("src/hooks/use-permissions.ts"),
  ]);
  assert.match(functions, /payment_method_collection: "always"/);
  assert.match(functions, /trial_period_days: promoTrialDays/);
  assert.match(functions, /today's total \$0/);
  assert.match(functions, /plan: promoTrialDays \? "standard" : data\.plan/);
  assert.match(webhook, /promoTrialing \? 3 : SOCIAL_PLANS\[plan\]\.accountLimit/);
  assert.match(webhook, /promoInitialPaymentFailed/);
  assert.match(permissions, /subscription\.stripe_subscription_id &&/);
});
