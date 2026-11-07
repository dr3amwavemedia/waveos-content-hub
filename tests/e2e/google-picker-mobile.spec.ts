import { test, expect } from "@playwright/test";
import { restoreSupabaseSession } from "./helpers/auth";

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 1280, height: 1800 }]) {
  test(`Picker exit and media scroll remain usable at ${viewport.width}×${viewport.height}`, async ({ context, page, baseURL }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport.height < 400 ? { width: 390, height: 844 } : viewport);
    const restored = await restoreSupabaseSession(context, page, baseURL ?? "http://localhost:8080");
    test.skip(!restored, "Authenticated session required");
    await page.goto("/create");
    await page.getByRole("button", { name: "Add Media", exact: true }).click();
    await page.getByRole("button", { name: "Google Drive", exact: true }).click();
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Browse Google Drive", exact: true }).click();
    const picker = page.locator(".picker-dialog");
    await expect(picker).toBeVisible();
    const bounds = await picker.boundingBox();
    const exit = await page.getByRole("button", { name: "Exit Google Drive", exact: true }).boundingBox();
    expect(bounds).not.toBeNull();
    expect(exit).not.toBeNull();
    if (!bounds || !exit) throw new Error("Picker and exit bounds required");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width < 640) expect(exit.y + exit.height).toBeLessThanOrEqual(bounds.y);
    await page.getByRole("button", { name: "Exit Google Drive", exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(page.getByText("Google Drive closed. No files were added.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Use 0 items", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue in Safari", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save draft for Safari", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close media library", exact: true }).click();
    expect(await page.evaluate(() => document.body.hasAttribute("data-waveos-drive-picker"))).toBe(false);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });
}