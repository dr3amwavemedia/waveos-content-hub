import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("homepage exposes signup without unverified plan claims", async () => {
  const landing = await read("src/routes/index.tsx");
  assert.match(landing, /Sign up/);
  assert.match(landing, /search=\{\{ mode: "signup" \}\}/);
  assert.doesNotMatch(landing, /No card required/);
  assert.doesNotMatch(landing, /Connect up to 2 social accounts/);
});

test("public signup chooses a paid plan before account creation and opens Stripe after confirmation", async () => {
  const [auth, callback] = await Promise.all([
    read("src/routes/auth.tsx"),
    read("src/routes/auth-callback.tsx"),
  ]);
  assert.match(auth, /account_source: "os_data"/);
  assert.match(auth, /signup_source: "public_trial"/);
  assert.match(auth, /Choose your subscription/);
  assert.match(auth, /Ripple/);
  assert.match(auth, /Current/);
  assert.match(auth, /Tidal/);
  assert.match(auth, /save 5%/);
  assert.match(auth, /save 10%/);
  assert.match(auth, /Create account & continue to payment/);
  assert.match(auth, /waveos\.publicSignupPlan/);
  assert.doesNotMatch(auth, /No card required/);
  assert.doesNotMatch(auth, /30 days, two connected accounts/);
  assert.match(auth, /\{mode !== "signup" && \([\s\S]*Technical problem\?/);
  assert.match(auth, /auth-callback\?public_signup=1/);
  assert.match(callback, /createSocialSubscriptionCheckout/);
  assert.match(callback, /Opening secure Stripe checkout/);
  assert.match(auth, /mode === "signup" \? "\/home"/);
  assert.doesNotMatch(auth, /sessionStorage\.setItem\(POST_AUTH_NEXT_KEY, "\/onboarding"\)/);
});

test("the legacy OS onboarding fallback provisions one isolated two-account trial", async () => {
  const migration = await read("supabase/migrations/20261003130000_public_os_trial_signup.sql");
  assert.match(migration, /create_os_trial_workspace/);
  assert.match(migration, /account_source = 'os_data'/);
  assert.match(migration, /data_source = 'os_data'/);
  assert.match(migration, /'trial', 'trialing', 2/);
  assert.match(migration, /interval '30 days'/);
});

test("public accounts receive an isolated workspace and Overview immediately", async () => {
  const migration = await read(
    "supabase/migrations/20261006034433_auto_provision_os_workspaces.sql",
  );
  const callback = await read("src/routes/auth-callback.tsx");
  const userContext = await read("src/hooks/use-waveos.ts");
  assert.match(migration, /provision_os_trial_workspace/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.handle_new_user/);
  assert.match(migration, /automatic_provisioning/);
  assert.match(migration, /Repair existing public-app accounts/);
  assert.match(migration, /'trial', 'trialing', 2/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.provision_os_trial_workspace[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(migration, /public_signup_window_closed/);
  assert.match(migration, /account_already_assigned/);
  assert.match(callback, /activate_public_os_account/);
  assert.match(callback, /waveos\.publicSignup/);
  assert.match(userContext, /profile\?\.account_source === "os_data"/);
});

test("new and legacy-unpaid public accounts require payment while Dream Wave clients stay exempt", async () => {
  const [migration, promoRestore, permissions, shell, settings] = await Promise.all([
    read("supabase/migrations/20261007191323_require_public_subscription_payment.sql"),
    read("supabase/migrations/20261007193442_restore_promo_code_access.sql"),
    read("src/hooks/use-permissions.ts"),
    read("src/components/app/app-shell.tsx"),
    read("src/routes/_authenticated/settings.tsx"),
  ]);
  assert.match(migration, /workspace\.data_source = 'os_data'/);
  assert.match(migration, /NEW\.status := 'checkout_pending'/);
  assert.match(migration, /subscription\.stripe_subscription_id IS NULL/);
  assert.match(migration, /RAISE EXCEPTION 'payment_required'/);
  assert.match(permissions, /subscription\.status === "trialing"/);
  assert.match(promoRestore, /os_promo_redemptions/);
  assert.match(shell, /publicPaymentRequired/);
  assert.match(shell, /navigate\(\{ to: "\/settings", replace: true \}\)/);
  assert.match(settings, /tools remain unavailable until payment succeeds/);
  assert.doesNotMatch(settings, /Start 30-day trial/);
});
