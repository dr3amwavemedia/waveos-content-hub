import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("complimentary codes are separate from trials, internal tests, and Stripe", async () => {
  const migration = await read("supabase/migrations/20261109120000_complimentary_access_codes.sql");
  assert.match(migration, /CREATE TABLE public\.waveos_complimentary_codes/);
  assert.match(migration, /CREATE TABLE public\.waveos_complimentary_grants/);
  assert.match(
    migration,
    /entitlement_source IN \('stripe', 'internal_test', 'complimentary_code'\)/,
  );
  assert.match(migration, /subscription\.entitlement_source = 'complimentary_code'/);
  assert.match(migration, /subscription\.stripe_subscription_id IS NOT NULL/);
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.redeem_waveos_complimentary_code"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.revoke_waveos_complimentary_grant"),
    ),
    /stripe_customer_id\s*=|stripe_subscription_id\s*=|stripe_checkout_session_id\s*=/,
  );
});

test("redemption is atomic, bounded, rate limited, and protects billed workspaces", async () => {
  const migration = await read("supabase/migrations/20261109120000_complimentary_access_codes.sql");
  const redemption = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.redeem_waveos_complimentary_code"),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.revoke_waveos_complimentary_grant"),
  );
  assert.match(redemption, /FOR UPDATE/);
  assert.match(redemption, /redemption_count >= _code_row\.max_redemptions/);
  assert.match(redemption, /interval '15 minutes'/);
  assert.match(redemption, /_subscription\.stripe_customer_id IS NOT NULL/);
  assert.match(redemption, /_subscription\.stripe_subscription_id IS NOT NULL/);
  assert.match(redemption, /_subscription\.stripe_checkout_session_id IS NOT NULL/);
  assert.match(redemption, /member\.role IN \('owner', 'admin'\)/);
  assert.match(redemption, /redemption_count = redemption_count \+ 1/);
  assert.match(redemption, /complimentary_access_redeemed/);
});

test("code secrets are hashed and only the server owner workflow can manage them", async () => {
  const [migration, accounts, settings, osData] = await Promise.all([
    read("supabase/migrations/20261109120000_complimentary_access_codes.sql"),
    read("src/lib/os-accounts.functions.ts"),
    read("src/routes/_authenticated/settings.tsx"),
    read("src/routes/_authenticated/os-data.tsx"),
  ]);
  assert.match(
    migration,
    /REVOKE ALL ON public\.waveos_complimentary_codes FROM PUBLIC, anon, authenticated/,
  );
  assert.match(migration, /extensions\.digest\(upper\(btrim/);
  assert.match(accounts, /await requireOwner\(context\.userId\)/);
  assert.match(accounts, /createHash\("sha256"\)/);
  assert.match(accounts, /randomBytes\(18\)/);
  assert.match(osData, /shown once/i);
  assert.match(settings, /skips checkout entirely/i);
  assert.match(settings, /redeemComplimentaryAccessCode/);
});

test("complimentary access has an honest user-facing lifecycle state", async () => {
  const [display, permissions, settings] = await Promise.all([
    read("src/lib/subscription-display.ts"),
    read("src/hooks/use-permissions.ts"),
    read("src/routes/_authenticated/settings.tsx"),
  ]);
  assert.match(display, /key: "complimentary"/);
  assert.match(display, /No payment is due/);
  assert.match(permissions, /subscription\.entitlement_source === "complimentary_code"/);
  assert.match(permissions, /complimentary_access_ends_at/);
  assert.match(settings, /No Stripe subscription, payment method, or trial is attached/i);
});
