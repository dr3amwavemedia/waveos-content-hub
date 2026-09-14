import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.error("Fixture browser error:", error.message));
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(await page.locator("body").innerText());
});

for (const method of ["link", "programmatic"] as const) {
  test(`${method}: cancel preserves draft; confirm leaves`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Story", { exact: true }).fill("Unsaved project draft");
    const leave =
      method === "link"
        ? page.getByRole("link", { name: "Leave using a link" })
        : page.getByRole("button", { name: "Leave programmatically" });
    await leave.click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
    await expect(page.getByLabel("Story", { exact: true })).toHaveValue("Unsaved project draft");
    await leave.click();
    await page.getByRole("button", { name: "Discard and leave" }).click();
    await expect(page.getByRole("heading", { name: "Other page" })).toBeVisible();
  });
}

test("failed save keeps navigation protection; successful save removes it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Story", { exact: true }).fill("Keep on failure");
  await page.getByRole("button", { name: "Fail save", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("link", { name: "Leave using a link" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await expect(page.getByLabel("Story", { exact: true })).toHaveValue("Keep on failure");
  await page.getByRole("button", { name: "Save successfully" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.getByRole("link", { name: "Leave using a link" }).click();
  await expect(page.getByRole("heading", { name: "Other page" })).toBeVisible();
});

for (const direction of ["Back", "Forward"] as const) {
  test(`${direction} preserves a cancelled draft and resumes confirmed navigation`, async ({
    page,
  }) => {
    await page.goto(direction === "Back" ? "/other" : "/");
    if (direction === "Forward") {
      await page.getByRole("link", { name: "Leave using a link" }).click();
      await expect(page.getByRole("heading", { name: "Other page" })).toBeVisible();
      await page.goBack();
    } else {
      await page.getByRole("link", { name: "Open project" }).click();
    }
    await expect(page.getByRole("heading", { name: "Project notes" })).toBeVisible();
    await page.getByLabel("Story", { exact: true }).fill("History draft");
    await page.getByRole("button", { name: direction, exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByLabel("Story", { exact: true })).toHaveValue("History draft");
    await page.getByRole("button", { name: direction, exact: true }).click();
    await page.getByRole("button", { name: "Discard and leave" }).click();
    await expect(page.getByRole("heading", { name: "Other page" })).toBeVisible();
  });
}

test("unchanged and reverted notes leave without a warning", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Story", { exact: true }).fill("Temporary draft");
  await page.getByLabel("Story", { exact: true }).fill("");
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.getByRole("link", { name: "Leave using a link" }).click();
  await expect(page.getByRole("heading", { name: "Other page" })).toBeVisible();
  await page.getByRole("link", { name: "Open project" }).click();
  await page.getByRole("link", { name: "Leave using a link" }).click();
  await expect(page.getByRole("heading", { name: "Other page" })).toBeVisible();
});
