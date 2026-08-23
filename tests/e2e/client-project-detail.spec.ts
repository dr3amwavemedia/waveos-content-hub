import { test, expect } from "@playwright/test";
import { restoreSupabaseSession } from "./helpers/auth";
import { mockSupabaseRest } from "./helpers/supabase-mock";

/**
 * Client project detail (upcoming-shoot spotlight + /my-projects), the
 * portal-return hint, and the admin-only ProductionHealthBanner.
 *
 * Supabase REST traffic is mocked for determinism; auth uses the real
 * injected session. Specs skip cleanly when no session is available.
 */

const WS_ID = "22222222-2222-2222-2222-222222222222";
const STAFF_WS_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";
const NEW_REQUEST_ID = "44444444-4444-4444-4444-444444444444";

const NOW = new Date().toISOString();
const EVENT_DATE = new Date(Date.now() + 14 * 86_400_000).toISOString();

const baseWorkspace = {
  slug: "fixture",
  industry: "wellness",
  timezone: "America/New_York",
  is_demo: false,
  is_archived: false,
  access_tier: "retainer_full",
  account_status: "active",
  agreement_term: null,
  access_starts_at: null,
  access_expires_at: null,
  activated_at: NOW,
  invited_at: NOW,
  feature_overrides: null,
};

// A signed-in non-staff client with one published project.
const clientTables = {
  profiles: [{ id: "user-fixture", first_name: "Ava", last_name: "Reyes", avatar_url: null }],
  user_roles: [],
  workspace_members: [{ workspace_id: WS_ID, role: "owner" }],
  workspaces: [{ ...baseWorkspace, id: WS_ID, name: "Ava Wellness" }],
  projects: [
    {
      id: PROJECT_ID,
      name: "Summer Brand Shoot",
      business_name: "Ava Wellness",
      client_name: "Ava Reyes",
      project_type: "photo",
      description: "Half-day lifestyle shoot for the spring launch.",
      status: "in_progress",
      start_date: NOW,
      end_date: null,
      event_date: EVENT_DATE,
      published_at: NOW,
    },
  ],
  project_milestones: [
    {
      id: "m-1",
      project_id: PROJECT_ID,
      title: "Pre-production call",
      description: null,
      due_at: NOW,
      status: "done",
      sort_order: 1,
    },
    {
      id: "m-2",
      project_id: PROJECT_ID,
      title: "Shoot day",
      description: null,
      due_at: EVENT_DATE,
      status: "pending",
      sort_order: 2,
    },
  ],
  project_notes: [
    { id: "n-1", project_id: PROJECT_ID, body: "We locked the shot list!", created_at: NOW },
  ],
  project_references: [
    {
      id: "r-1",
      project_id: PROJECT_ID,
      title: "Mood board",
      url: "https://example.com/mood",
      kind: "link",
    },
  ],
  content_items: [
    { id: "c-1", title: "Reel caption v2", status: "changes_requested", updated_at: NOW },
  ],
};

// A signed-in Dream Wave owner (staff), used for the health-banner specs.
const adminTables = {
  profiles: [{ id: "admin-fixture", first_name: "Jesse", last_name: "Hayes", avatar_url: null }],
  user_roles: [{ role: "dream_wave_owner", staff_type: null }],
  workspace_members: [],
  workspaces: [{ ...baseWorkspace, id: STAFF_WS_ID, name: "Dream Wave Media" }],
  production_checklist_items: [],
};

test.describe("client project detail", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    const restored = await restoreSupabaseSession(context, page, baseURL!);
    test.skip(!restored, "no Supabase session injected — set LOVABLE_BROWSER_SUPABASE_* to run");
  });

  test("expands the upcoming shoot spotlight to reveal project details", async ({ page }) => {
    await mockSupabaseRest(page, { tables: clientTables });
    await page.goto("/home");

    const toggle = page.getByRole("button", { name: /view details|hide details/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Details are visually collapsed before the click.
    await expect(page.getByText("Shoot day", { exact: true })).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Milestones", { exact: true })).toBeVisible();
    await expect(page.getByText("Pre-production call", { exact: true })).toBeVisible();
    await expect(page.getByText("Shoot day", { exact: true })).toBeVisible();
    await expect(page.getByText("We locked the shot list!")).toBeVisible();
    // Staff-flagged content changes surface in the same detail view.
    await expect(page.getByText("Reel caption v2", { exact: true })).toBeVisible();
  });

  test("shows the portal-return hint next to external links", async ({ page }) => {
    await mockSupabaseRest(page, { tables: clientTables });
    await page.goto("/home");

    await page.getByRole("button", { name: /view details/i }).click();

    const link = page.getByRole("link", { name: /mood board/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(
      page.getByText(/check your browser tabs to come back to your WaveOS portal/i),
    ).toBeVisible();
  });

  test("submits a change request with comments and shows its status", async ({ page }) => {
    let submitted = false;
    let rpcArgs: Record<string, unknown> | null = null;
    const newRequest = {
      id: NEW_REQUEST_ID,
      title: "Make the cover photo brighter",
      description: "The current one feels too dark for spring.",
      request_type: "revision",
      status: "submitted",
      created_at: NOW,
      updated_at: NOW,
    };

    await mockSupabaseRest(page, {
      tables: {
        ...clientTables,
        client_requests: () => (submitted ? [newRequest] : []),
      },
      rpc: {
        create_client_service_request: (body) => {
          submitted = true;
          rpcArgs = body;
          return NEW_REQUEST_ID;
        },
      },
    });
    await page.goto("/home");

    await page.getByRole("button", { name: /view details/i }).click();
    await page.getByRole("button", { name: /request a change/i }).click();

    await page.getByLabel(/what should change/i).fill("Make the cover photo brighter");
    await page
      .getByLabel(/comments for the team/i)
      .fill("The current one feels too dark for spring.");
    await page.getByRole("button", { name: /send change request/i }).click();

    // The request round-trips through the shared pipeline as a revision…
    expect(rpcArgs).not.toBeNull();
    expect(rpcArgs!["_workspace_id"]).toBe(WS_ID);
    expect(rpcArgs!["_request_type"]).toBe("revision");

    // …and the detail view updates with the new request and its live status.
    await expect(page.getByText("Make the cover photo brighter", { exact: true })).toBeVisible();
    await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
    await expect(
      page.getByText("The current one feels too dark for spring.", { exact: true }),
    ).toBeVisible();
  });

  test("shows the specific validation reason when a submission is rejected", async ({ page }) => {
    let rpcCalls = 0;
    await mockSupabaseRest(page, {
      tables: clientTables,
      rpc: {
        create_client_service_request: () => {
          rpcCalls += 1;
          return NEW_REQUEST_ID;
        },
      },
    });
    await page.goto("/home");

    await page.getByRole("button", { name: /view details/i }).click();
    await page.getByRole("button", { name: /request a change/i }).click();

    // Profanity fails the client-side refine, which short-circuits before the
    // RPC — the user must see why, not the generic fallback.
    await page.getByLabel(/what should change/i).fill("Make the cover photo shit");
    await page.getByLabel(/comments for the team/i).fill("The current one feels too dark.");
    await page.getByRole("button", { name: /send change request/i }).click();

    await expect(page.getByText("Please keep the language professional.")).toBeVisible();
    await expect(page.getByText("Could not send your change request.")).toHaveCount(0);
    expect(rpcCalls).toBe(0);
  });
});

test.describe("production health banner", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    const restored = await restoreSupabaseSession(context, page, baseURL!);
    test.skip(!restored, "no Supabase session injected — set LOVABLE_BROWSER_SUPABASE_* to run");
  });

  const missingColumn = {
    status: 400,
    body: {
      code: "PGRST204",
      message: "Could not find the 'checked_in_at' column of 'production_projects' in the schema cache",
    },
  };

  test("warns an admin when production columns are missing", async ({ page }) => {
    await mockSupabaseRest(page, {
      tables: adminTables,
      errors: { production_projects: missingColumn },
    });
    await page.goto("/home");

    await expect(page.getByText("Admin notice — database out of sync")).toBeVisible();
    await expect(
      page.getByText(/Missing database migration: production_projects\.checked_in_at/),
    ).toBeVisible();
  });

  test("stays hidden for an admin when the schema probe succeeds", async ({ page }) => {
    let probes = 0;
    await mockSupabaseRest(page, {
      tables: { ...adminTables, production_projects: [] },
      onRequest: (name) => {
        if (name === "production_projects") probes += 1;
      },
    });
    await page.goto("/home");

    // Wait until the probe has definitely run before asserting absence.
    await expect
      .poll(() => probes, { message: "production schema probe should have fired" })
      .toBeGreaterThan(0);
    await expect(page.getByText("Admin notice — database out of sync")).toHaveCount(0);
  });

  test("never probes or renders for non-admin users", async ({ page }) => {
    let probes = 0;
    await mockSupabaseRest(page, {
      tables: clientTables,
      errors: { production_projects: missingColumn },
      onRequest: (name) => {
        if (name === "production_projects") probes += 1;
      },
    });
    await page.goto("/home");

    // Client home has fully loaded once the spotlight toggle is up; the
    // health probe (if it were enabled) fires earlier, on shell mount.
    await expect(page.getByRole("button", { name: /view details/i })).toBeVisible();
    expect(probes).toBe(0);
    await expect(page.getByText("Admin notice — database out of sync")).toHaveCount(0);
  });
});
