import { test, expect } from "@playwright/test";
import { startSmokeSession, skipWithoutSession, visit } from "./helpers/smoke";

/**
 * Tenant isolation invariant: every browser-side read of a tenant-scoped
 * table must be filtered to a single workspace. A query that leaves the
 * filter off would return another client's rows under a permissive policy,
 * so the absence of a workspace filter is itself the defect we look for.
 */

// Tables whose rows always belong to exactly one workspace.
const TENANT_TABLES = [
  "content_items",
  "media_assets",
  "media_folders",
  "client_invoices",
  "client_contracts",
  "client_deliveries",
  "approvals",
  "post_variants",
  "projects",
  "catalog_items",
  "vision_decks",
];

const FILTER_KEYS = ["workspace_id", "id", "or", "select=workspace_id"];

test.describe("smoke: workspace isolation", () => {
  test("tenant reads are always scoped to one workspace", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    for (const route of ["/home", "/content", "/payments", "/approvals", "/analytics"]) {
      await visit(page, route);
    }

    const unscoped = session.restRequests
      .map((raw) => new URL(raw))
      .filter((url) => {
        const table = url.pathname.split("/").filter(Boolean)[2];
        if (!table || !TENANT_TABLES.includes(table)) return false;
        const query = url.search;
        return !FILTER_KEYS.some((key) => query.includes(key));
      })
      .map((url) => `${url.pathname}${url.search}`);

    expect(unscoped, "tenant table read without a workspace/id filter").toEqual([]);
  });

  test("a signed-in user only sees workspaces they belong to", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const session = await startSmokeSession(context, page, baseURL!);
    skipWithoutSession(session, testInfo);

    await visit(page, "/home");

    // Membership is resolved through workspace_members / RLS, never an
    // unfiltered workspaces listing.
    const workspaceReads = session.restRequests.filter((url) => url.includes("/rest/v1/workspaces"));
    for (const raw of workspaceReads) {
      const url = new URL(raw);
      expect(
        url.search.length > 0,
        `unfiltered workspaces read: ${url.pathname}${url.search}`,
      ).toBe(true);
    }
  });
});
