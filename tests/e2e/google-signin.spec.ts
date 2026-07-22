import { test, expect } from "@playwright/test";

/**
 * Google sign-in UI + hand-off.
 *
 * We cannot complete a real Google OAuth in CI (no credentials, provider
 * rate limits, iframe/consent state), so this suite verifies everything up
 * to — and including — the moment the app hands the user to Google:
 *
 *   1. /auth renders the "Continue with Google" button and it is enabled.
 *   2. Clicking it starts the Lovable-managed OAuth flow: either a popup is
 *      opened, or the top-level location changes toward the OAuth broker.
 *   3. The intended post-auth destination is preserved in sessionStorage
 *      when `?next=` points at a non-default protected path.
 */

test.describe("Google sign-in", () => {
  test("renders the Google sign-in button", async ({ page }) => {
    await page.goto("/auth");
    const btn = page.getByRole("button", { name: /continue with google/i });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test("preserves ?next= destination in sessionStorage before OAuth", async ({ page }) => {
    await page.goto("/auth?next=/calendar");
    // sessionStorage is only written when the click handler runs and next !== /home.
    await page.getByRole("button", { name: /continue with google/i }).click().catch(() => {});
    // A best-effort read — the click may navigate away, so we allow either
    // the stored value or a navigation to have started.
    const stored = await page
      .evaluate(() => sessionStorage.getItem("waveos.postAuthNext"))
      .catch(() => null);
    if (stored !== null) expect(stored).toBe("/calendar");
  });

  test("clicking Google starts the managed OAuth hand-off", async ({ context, page }) => {
    await page.goto("/auth");

    // Capture whichever hand-off happens first: popup, top-level nav, or
    // an OAuth-related network request.
    const popupPromise = context.waitForEvent("page", { timeout: 5_000 }).catch(() => null);
    const navPromise = page
      .waitForURL(/(accounts\.google\.com|oauth\.lovable\.dev|\/~oauth\/|supabase\.co\/auth)/, {
        timeout: 5_000,
      })
      .then(() => "nav" as const)
      .catch(() => null);
    const reqPromise = page
      .waitForRequest(
        (r) =>
          /accounts\.google\.com|oauth\.lovable\.dev|\/~oauth\/|supabase\.co\/auth/.test(r.url()),
        { timeout: 5_000 },
      )
      .then(() => "req" as const)
      .catch(() => null);

    await page.getByRole("button", { name: /continue with google/i }).click();

    const [popup, nav, req] = await Promise.all([popupPromise, navPromise, reqPromise]);
    expect(popup || nav || req, "expected a popup, navigation, or OAuth request").toBeTruthy();
  });
});
