import { defineConfig, devices } from "@playwright/test";

/**
 * WaveOS end-to-end tests.
 *
 * Assumes `bun run dev` (or the sandbox dev server) is already serving the
 * app at BASE_URL (default http://localhost:8080). The Google sign-in flow
 * is exercised up to the provider hand-off; authenticated redirect and
 * tier-based landing tests require a Supabase session — supply either:
 *
 *   LOVABLE_BROWSER_SUPABASE_STORAGE_KEY + LOVABLE_BROWSER_SUPABASE_SESSION_JSON
 *
 * (as injected in the Lovable sandbox), or a JSON file at
 * tests/e2e/.auth/state.json produced by `storageState`. Tests that
 * require a session skip themselves cleanly when neither is present.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
