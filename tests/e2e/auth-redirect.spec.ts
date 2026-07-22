import { test, expect } from "@playwright/test";
import { restoreSupabaseSession } from "./helpers/auth";

/**
 * Signed-in users landing on `/` or `/auth` must be redirected to `/home`.
 * Requires a Supabase session in the environment (see helpers/auth.ts);
 * skips cleanly otherwise so the suite stays green in bare CI.
 */
test.describe("authenticated redirect to /home", () => {
  test("/ redirects a signed-in user to /home", async ({ context, page, baseURL }) => {
    const restored = await restoreSupabaseSession(context, page, baseURL!);
    test.skip(!restored, "no Supabase session injected — set LOVABLE_BROWSER_SUPABASE_* to run");

    await page.goto("/");
    await page.waitForURL(/\/home$/, { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toBe("/home");
  });

  test("/auth redirects a signed-in user to /home", async ({ context, page, baseURL }) => {
    const restored = await restoreSupabaseSession(context, page, baseURL!);
    test.skip(!restored, "no Supabase session injected — set LOVABLE_BROWSER_SUPABASE_* to run");

    await page.goto("/auth");
    await page.waitForURL(/\/home$/, { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toBe("/home");
  });

  test("unauthenticated /home is gated to /auth", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/home");
    await page.waitForURL(/\/auth(\?|$)/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/auth/);
  });
});
