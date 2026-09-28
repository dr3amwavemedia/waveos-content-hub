import { test, expect } from "@playwright/test";
import { startSmokeSession, skipWithoutSession, visit, expectAnyVisible } from "./helpers/smoke";

/**
 * Media library smoke: the library renders and the upload control is wired
 * to a real file input. Nothing is uploaded to storage.
 */
test.describe("smoke: media library", () => {
  test("the content library renders", async ({ context, page, baseURL }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/content");
    await expectAnyVisible(page, [/content library/i, /overview/i], "content library");
  });

  test("the upload control is present and accepts files", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/content");
    const uploadButton = page.getByRole("button", { name: /^upload$/i }).first();
    if (!(await uploadButton.isVisible().catch(() => false))) {
      testInfo.skip(true, "upload is not available for this session's tier");
    }
    await expect(uploadButton).toBeEnabled();
    // The hidden multi-file input backing the button must exist.
    await expect(page.locator('input[type="file"]').first()).toHaveCount(1);
  });

  test("deliveries render for client-facing media", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/deliveries");
    await expectAnyVisible(
      page,
      [/your content/i, /project links and deliverables/i, /deliver/i],
      "deliveries",
    );
  });
});
