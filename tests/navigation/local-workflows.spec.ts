import { test, expect } from "@playwright/test";

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
  expect((await download).suggestedFilename()).toBe("waveos-document-draft.json");
  await page.getByRole("link", { name: "Leave tools" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Recipient / vendor", { exact: true })).toHaveValue("Test vendor");
});
