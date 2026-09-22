import { test, expect } from "@playwright/test";
import { startSmokeSession, skipWithoutSession, visit, expectAnyVisible } from "./helpers/smoke";

/**
 * Publishing smoke: the posts/scheduling surfaces load and connection state
 * is readable. Nothing is scheduled, published, or sent to a provider.
 */
test.describe("smoke: publishing", () => {
  test("the posts surface renders", async ({ context, page, baseURL }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/posts");
    await expectAnyVisible(page, [/posts/i, /no posts/i], "posts");
  });

  test("the calendar renders scheduled work", async ({ context, page, baseURL }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/calendar");
    await expectAnyVisible(page, [/calendar/i, /schedule/i, /upcoming/i], "calendar");
  });

  test("social connections report their state without starting OAuth", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/social-accounts");
    await expectAnyVisible(
      page,
      [/connect/i, /connected/i, /accounts/i, /social/i],
      "social accounts",
    );
    // Loading the page must not navigate off to a provider.
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  });
});
