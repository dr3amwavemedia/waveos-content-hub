import { test, expect, type Dialog } from "@playwright/test";

test("first visit guide supports topics, skip, reload and restart on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await dialog.getByLabel("Jump to a topic").selectOption("1");
  await expect(dialog.getByRole("heading", { name: "Contracts" })).toBeVisible();
  await dialog.getByRole("button", { name: "Skip guide" }).click();
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Restart guide" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Invoices" })).toBeVisible();
});

test("document drafts validate input, download editable data and protect navigation", async ({
  page,
}) => {
  await page.goto("/tools");
  await page.getByRole("dialog").getByRole("button", { name: "Skip guide" }).click();
  await page.getByRole("button", { name: "Prepare vendor or white-label documents" }).click();
  const print = page.getByRole("button", { name: "Print draft / Save PDF" });
  await expect(print).toBeDisabled();
  await page.getByLabel("Recipient / vendor", { exact: true }).fill("Test vendor");
  await page.getByLabel("Services, line items and notes").fill("Camera operator services");
  await page.getByLabel("Amount (optional)").fill("-5");
  await expect(print).toBeDisabled();
  await page.getByLabel("Amount (optional)").fill("250");
  await expect(print).toBeEnabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save editable draft" }).click();
  expect((await download).suggestedFilename()).toBe("quote-test-vendor-draft.json");
  await expect(page.getByText("No unsaved draft changes", { exact: true })).toBeVisible();
  await page.getByLabel("Reference number").fill("Changed after download");
  await page.getByRole("link", { name: "Leave tools" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Recipient / vendor", { exact: true })).toHaveValue("Test vendor");
});

test("guide completion remains complete after reload", async ({ page }) => {
  await page.goto("/tools");
  await page.getByRole("dialog").getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restart guide" })).toBeVisible();
});

for (const width of [320, 375, 430])
  test(`draft preview, services and focused form fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/tools");
    await page.getByRole("dialog").getByRole("button", { name: "Skip guide" }).click();
    await page.getByRole("button", { name: "Prepare vendor or white-label documents" }).click();
    await page.getByLabel("Recipient / vendor", { exact: true }).fill("LongClientName".repeat(18));
    await page.getByRole("button", { name: "Add service", exact: true }).click();
    await page.getByLabel("description 1", { exact: true }).fill("Camera operation");
    await page.getByLabel("quantity 1", { exact: true }).fill("2.5");
    await page.getByLabel("rate 1", { exact: true }).fill("100.10");
    await expect(page.getByText("Calculated total: $250.25", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Preview document" }).click();
    const preview = page.frameLocator('iframe[title="Document preview"]');
    await expect(preview.getByText("Camera operation", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width, height: 480 });
    await page.getByLabel("Services, line items and notes").focus();
    await page.getByRole("button", { name: "Print draft / Save PDF" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Print draft / Save PDF" })).toBeInViewport();
    if (width === 320)
      await page.screenshot({ path: "/tmp/waveos-tools-mobile320.png", fullPage: true });
  });

test("saved import preserves fields, replacement confirms all changes and reset works", async ({
  page,
}) => {
  await page.goto("/tools");
  await page.getByRole("dialog").getByRole("button", { name: "Skip guide" }).click();
  await page.getByRole("button", { name: "Prepare vendor or white-label documents" }).click();
  await page.getByLabel("Reference number").fill("Unsaved reference only");
  const file = {
    name: "draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        kind: "Quote",
        recipient: "Imported vendor",
        reference: "Q-2",
        project: "Test",
        date: "2026-09-14",
        currency: "USD",
        amount: "10.00",
        content: "Services",
      }),
    ),
  };
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Open saved draft").setInputFiles(file);
  await expect(page.getByLabel("Reference number")).toHaveValue("Unsaved reference only");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Open saved draft").setInputFiles(file);
  await expect(page.getByLabel("Recipient / vendor", { exact: true })).toHaveValue(
    "Imported vendor",
  );
  await expect(page.getByText("No unsaved draft changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start new draft" }).click();
  await expect(page.getByLabel("Recipient / vendor", { exact: true })).toHaveValue("");
  await page.getByRole("link", { name: "Leave tools" }).click();
  await expect(page.getByRole("heading", { name: "Other page" })).toBeVisible();
});

test("checklist and crew edits preserve original notes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/planning");
  page.once("dialog", (dialog) => dialog.accept("Camera body"));
  await page.getByRole("button", { name: "Edit Camera", exact: true }).click();
  await expect(page.getByTestId("checklist-source")).toContainText("Original equipment notes");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Remove Lens", exact: true }).click();
  await expect(page.getByTestId("checklist-source")).toContainText("Lens");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove Lens", exact: true }).click();
  await expect(page.getByTestId("checklist-source")).not.toContainText("Lens");
  const answers = ["Sam", "Camera operator", "Alex", "Capture the interviews"];
  const handler = (dialog: Dialog) => dialog.accept(answers.shift()!);
  page.on("dialog", handler);
  await page.getByRole("button", { name: "Add crew member" }).click();
  page.off("dialog", handler);
  await expect(page.getByText("↓ Reports to Alex", { exact: true })).toBeVisible();
  await expect(page.getByTestId("crew-source")).toContainText("Original crew notes");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("photo swipe changes selection while vertical and video gestures do not", async ({ page }) => {
  await page.goto("/planning");
  const photo = page.getByTestId("swipe-photo");
  async function swipe(
    target: typeof photo,
    from: { clientX: number; clientY: number },
    to: { clientX: number; clientY: number },
  ) {
    await target.evaluate(
      (element, { from, to }) => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            bubbles: true,
            touches: [new Touch({ identifier: 1, target: element, ...from })],
          }),
        );
        element.dispatchEvent(
          new TouchEvent("touchend", {
            bubbles: true,
            touches: [],
            changedTouches: [new Touch({ identifier: 1, target: element, ...to })],
          }),
        );
      },
      { from, to },
    );
  }
  await swipe(photo, { clientX: 200, clientY: 20 }, { clientX: 50, clientY: 30 });
  await expect(photo).toHaveText("Photo 2");
  await swipe(photo, { clientX: 200, clientY: 20 }, { clientX: 180, clientY: 180 });
  await expect(photo).toHaveText("Photo 2");
  await swipe(
    page.getByTestId("swipe-video"),
    { clientX: 200, clientY: 20 },
    { clientX: 50, clientY: 30 },
  );
  await expect(photo).toHaveText("Photo 2");
});

test("gallery preference survives reload and long filenames fit mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/gallery-fixture");
  await page.getByRole("button", { name: "More per row" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "More per row" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: /^View VeryLongClientPhotoFilename/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/waveos-gallery-mobile320.png", fullPage: true });
});

test("print popup uses readable currency report", async ({ page, context }) => {
  await context.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/planning");
  await page.getByText("Download invoice records", { exact: true }).click();
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print / Save PDF" }).click();
  const popup = await opened;
  await expect(popup.getByText("Totals by currency", { exact: true })).toBeVisible();
  await expect(popup.getByText("$75.00", { exact: true }).first()).toBeVisible();
});
