import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("OS Data has organized and color-coded promo management", async () => {
  const clients = await read("src/routes/_authenticated/clients.tsx");
  assert.match(clients, /Public accounts/);
  assert.match(clients, /Promo codes/);
  assert.match(clients, /OS data only/);
  assert.match(clients, /promoThemeStyles/);
  assert.match(clients, /Create promo code/);
  assert.match(clients, /Redemption limit/);
  assert.match(clients, /account\.promoBonusTrialDays/);
});

test("promo codes are owner-managed OS data with bounded redemptions", async () => {
  const migration = await read("supabase/migrations/20261003140000_os_promo_codes.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.os_promo_codes/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.os_promo_redemptions/);
  assert.match(migration, /redemption_count < promo\.max_redemptions/);
  assert.match(migration, /validate_os_promo_code/);
  assert.match(migration, /REVOKE ALL ON public\.os_promo_codes FROM PUBLIC, anon, authenticated/);
});

test("a valid signup promo grants the owner-configured OS trial", async () => {
  const auth = await read("src/routes/auth.tsx");
  const callback = await read("src/routes/auth-callback.tsx");
  const subscriptions = await read("src/lib/social-subscriptions.functions.ts");
  const webhook = await read("src/lib/social-subscription-webhook.server.ts");
  const social = await read("src/routes/_authenticated/social.tsx");
  const onboarding = await read("src/routes/_authenticated/onboarding.tsx");
  const migration = await read("supabase/migrations/20261003140000_os_promo_codes.sql");
  const restore = await read("supabase/migrations/20261007193442_restore_promo_code_access.sql");
  const guardrails = await read("supabase/migrations/20261007194700_promo_trial_guardrails.sql");
  const automations = await read("supabase/functions/email-automations/index.ts");
  const accounts = await read("src/lib/os-accounts.functions.ts");
  assert.match(auth, /promo_code: normalizedPromo/);
  assert.match(auth, /invalid, paused, expired, or fully redeemed/);
  assert.match(auth, /Promo code/);
  assert.doesNotMatch(callback, /promoTrialActive/);
  assert.match(callback, /createCheckout/);
  assert.match(onboarding, /_promo_code: user\.promoCode/);
  assert.match(migration, /make_interval\(days => 30 \+ _bonus_days\)/);
  assert.match(migration, /promo_applied/);
  assert.match(restore, /os_promo_codes/);
  assert.match(restore, /os_promo_redemptions/);
  assert.match(accounts, /requireOwner/);
  assert.match(accounts, /between 1 and 30 days/);
  assert.match(guardrails, /CHECK \(bonus_trial_days BETWEEN 1 AND 30\)/);
  assert.match(guardrails, /account_limit = 3/);
  assert.match(guardrails, /NEW\.stripe_subscription_id IS NULL/);
  assert.match(guardrails, /public\.expire_os_promo_trials/);
  assert.match(
    guardrails,
    /subscription\.trial_ends_at <= subscription\.trial_started_at \+ interval '30 days'/,
  );
  assert.match(automations, /\[7, 3, 1, 0\]/);
  assert.match(automations, /entity_type", "promo_trial"/);
  assert.match(automations, /promoTrialsExpired/);
  assert.match(subscriptions, /payment_method_collection: "always"/);
  assert.match(subscriptions, /trial_period_days: promoTrialDays/);
  assert.match(subscriptions, /plan: promoTrialDays \? "standard" : data\.plan/);
  assert.match(webhook, /effectivePlan = promoTrialing \? "standard" : plan/);
  assert.match(social, /automaticProfileAttempted/);
  assert.match(social, /Dream Wave client setup remains manual/);
});
