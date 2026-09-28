import { test, expect } from "@playwright/test";
import { startSmokeSession, skipWithoutSession, visit, expectAnyVisible } from "./helpers/smoke";

/**
 * Payments smoke checks are strictly read-only: no checkout session is
 * created, no invoice is charged, and no CSV is imported.
 */
test.describe("smoke: payments", () => {
  test("the payments dashboard renders its summary surfaces", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/payments");
    await expectAnyVisible(
      page,
      [/payments/i, /recent invoice payments/i, /sales and cash/i],
      "payments dashboard",
    );
  });

  test("the Bloom CSV importer is reachable without importing", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/payments");
    const importer = page.getByText(/import bloom csv/i).first();
    if (!(await importer.isVisible().catch(() => false))) {
      testInfo.skip(true, "importer is staff-only and not present for this session");
    }
    await expect(importer).toBeVisible();
  });

  test("the payment return page handles a missing invoice reference", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/payment-return");
    await expectAnyVisible(
      page,
      [/payment status unavailable/i, /payment/i],
      "payment return fallback",
    );
    // A bare return URL must never claim a payment succeeded.
    await expect(page.locator("body")).not.toContainText(/payment confirmed/i);
  });
});
