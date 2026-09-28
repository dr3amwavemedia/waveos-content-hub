import { test, expect } from "@playwright/test";
import { startSmokeSession, skipWithoutSession, visit, expectAnyVisible } from "./helpers/smoke";

/**
 * Content approvals smoke: the queue renders and approval controls are
 * present. No approval decision is submitted.
 */
test.describe("smoke: content approvals", () => {
  test("the approvals queue renders", async ({ context, page, baseURL }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/approvals");
    await expectAnyVisible(
      page,
      [/approvals/i, /nothing waiting/i, /awaiting approval/i],
      "approvals queue",
    );
  });

  test("approval actions render only alongside pending work", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/approvals");
    const approve = page.getByRole("button", { name: /approve/i });
    const requestChanges = page.getByRole("button", { name: /request changes/i });
    const approveCount = await approve.count();
    const changesCount = await requestChanges.count();

    // Either there is pending work with both controls, or an empty queue
    // with neither — never an approve button with no way to push back.
    if (approveCount > 0) {
      expect(changesCount, "approve is offered without a changes-requested path").toBeGreaterThan(0);
    } else {
      expect(changesCount).toBe(0);
    }
  });
});
