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

test("public signup is marked as OS data and returns to its ready Overview", async () => {
  const auth = await read("src/routes/auth.tsx");
  assert.match(auth, /account_source: "os_data"/);
  assert.match(auth, /signup_source: "public_trial"/);
  assert.match(auth, /Sign up/);
  assert.doesNotMatch(auth, /No card required/);
  assert.doesNotMatch(auth, /30 days, two connected accounts/);
  assert.match(auth, /\{mode !== "signup" && \([\s\S]*Technical problem\?/);
  assert.match(auth, /\/auth-callback\?next=/);
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
