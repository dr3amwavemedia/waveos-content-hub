import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("homepage exposes the card-free trial signup", async () => {
  const landing = await read("src/routes/index.tsx");
  assert.match(landing, /Start your 30-day free trial/);
  assert.match(landing, /search=\{\{ mode: "signup" \}\}/);
  assert.match(landing, /No card required/);
});

test("public signup is marked as OS data and returns to onboarding", async () => {
  const auth = await read("src/routes/auth.tsx");
  assert.match(auth, /account_source: "os_data"/);
  assert.match(auth, /signup_source: "public_trial"/);
  assert.match(auth, /Create account & start trial/);
  assert.match(auth, /\/auth-callback\?next=/);
});

test("OS onboarding provisions one isolated workspace with a two-account trial", async () => {
  const migration = await read("supabase/migrations/20261003130000_public_os_trial_signup.sql");
  assert.match(migration, /create_os_trial_workspace/);
  assert.match(migration, /account_source = 'os_data'/);
  assert.match(migration, /data_source = 'os_data'/);
  assert.match(migration, /'trial', 'trialing', 2/);
  assert.match(migration, /interval '30 days'/);
});
