import { test, expect } from "@playwright/test";
import { startSmokeSession, skipWithoutSession, visit } from "./helpers/smoke";

test.describe("smoke: authentication", () => {
  test("unauthenticated /home is gated to /auth", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/home");
    await page.waitForURL(/\/auth(\?|$)/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/auth/);
  });

  test("/auth renders the managed Google sign-in", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/auth");
    await expect(page.getByRole("button", { name: /google/i }).first()).toBeVisible();
  });

  test("a signed-in user lands on /home", async ({ context, page, baseURL }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await page.goto("/");
    await page.waitForURL(/\/home$/, { timeout: 15_000 });
    await visit(page, "/home");
  });

  test("the authenticated shell renders its navigation", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/home");
    await expect(page.locator("nav, [role=navigation]").first()).toBeVisible();
  });
});
