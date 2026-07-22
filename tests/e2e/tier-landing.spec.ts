import { test, expect } from "@playwright/test";
import { restoreSupabaseSession } from "./helpers/auth";

/**
 * Tier-based landing on /home:
 *   - Layer 1 `project_client` users see the client-facing overview
 *     (Invoices / Deliveries / Contact — never the growth dashboard).
 *   - Staff and higher tiers see the growth dashboard heading
 *     ("Growth overview" / "greeting, <name>").
 *
 * The injected session determines which branch is asserted; set
 * E2E_EXPECTED_TIER to `project_client` | `staff` | `growth` to make
 * the expectation explicit. Otherwise the test auto-detects and asserts
 * that exactly one of the two variants rendered.
 */
test.describe("tier-based landing on /home", () => {
  test("renders the correct view for the invited client's tier", async ({
    context,
    page,
    baseURL,
  }) => {
    const restored = await restoreSupabaseSession(context, page, baseURL!);
    test.skip(!restored, "no Supabase session injected — set LOVABLE_BROWSER_SUPABASE_* to run");

    await page.goto("/home");
    await page.waitForURL(/\/home$/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    const clientLocator = page.getByRole("heading", { name: /invoices|deliveries|your account/i });
    const staffLocator = page.getByText(/growth overview|home dashboard/i);
    const emptyLocator = page.getByRole("heading", {
      name: /haven't been invited to a workspace yet/i,
    });

    const expected = process.env.E2E_EXPECTED_TIER;
    if (expected === "project_client") {
      await expect(clientLocator.first()).toBeVisible();
      await expect(staffLocator.first()).toBeHidden();
    } else if (expected === "staff" || expected === "growth") {
      await expect(staffLocator.first()).toBeVisible();
    } else {
      // Auto-detect: exactly one landing variant must be visible.
      const [client, staff, empty] = await Promise.all([
        clientLocator.first().isVisible().catch(() => false),
        staffLocator.first().isVisible().catch(() => false),
        emptyLocator.first().isVisible().catch(() => false),
      ]);
      expect(
        [client, staff, empty].filter(Boolean).length,
        "exactly one of Layer1 / growth / empty-workspace should render",
      ).toBe(1);
    }
  });
});
