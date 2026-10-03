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

test("a valid signup promo adds bonus days to the OS trial", async () => {
  const auth = await read("src/routes/auth.tsx");
  const onboarding = await read("src/routes/_authenticated/onboarding.tsx");
  const migration = await read("supabase/migrations/20261003140000_os_promo_codes.sql");
  assert.match(auth, /promo_code: normalizedPromo/);
  assert.match(auth, /invalid, paused, expired, or fully redeemed/);
  assert.match(onboarding, /_promo_code: user\.promoCode/);
  assert.match(migration, /make_interval\(days => 30 \+ _bonus_days\)/);
  assert.match(migration, /promo_applied/);
});
