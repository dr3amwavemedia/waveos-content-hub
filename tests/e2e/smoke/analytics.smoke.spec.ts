import { test, expect } from "@playwright/test";
import { startSmokeSession, skipWithoutSession, visit, expectAnyVisible } from "./helpers/smoke";

/**
 * Analytics smoke: the reporting surfaces render with real numbers or an
 * honest empty state — never a crash or a stuck spinner.
 */
test.describe("smoke: analytics", () => {
  test("the analytics dashboard renders", async ({ context, page, baseURL }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/analytics");
    await expectAnyVisible(page, [/analytics/i, /no data/i, /performance/i], "analytics");
  });

  test("analytics does not hang on a loading state", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/analytics");
    await page.waitForTimeout(2_000);
    const body = await page.locator("body").innerText();
    expect(/^\s*(loading|loading…|loading\.\.\.)\s*$/i.test(body.trim())).toBe(false);
  });

  test("the price list and projects reporting surfaces render", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/catalog");
    await expectAnyVisible(page, [/price list/i, /catalog/i], "price list");

    await visit(page, "/projects");
    await expectAnyVisible(page, [/projects/i, /no projects/i], "projects");
  });
});
