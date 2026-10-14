import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { releaseMatchesAudience, safeReleaseLink } from "../../src/lib/product-release-audience.ts";

const release = {
  id: "release-1",
  version: "1.0.0",
  title: "Campaign tools",
  summary: "Plan multi-post campaigns.",
  body: "",
  published_at: "2026-10-14T12:00:00.000Z",
  target_data_sources: ["os_data"],
  target_public_plans: ["full", "expanded"],
  target_client_tiers: [],
  target_workspace_roles: ["owner", "admin"],
  link_url: "https://waveos.example/updates/1",
};

test("release audience matching is strict for the active public workspace", () => {
  assert.equal(
    releaseMatchesAudience(release, {
      dataSource: "os_data",
      publicPlan: "full",
      clientTier: "project_client",
      workspaceRole: "owner",
      isStaff: false,
    }),
    true,
  );
  assert.equal(
    releaseMatchesAudience(release, {
      dataSource: "os_data",
      publicPlan: "trial",
      clientTier: "project_client",
      workspaceRole: "owner",
      isStaff: false,
    }),
    false,
  );
  assert.equal(
    releaseMatchesAudience(release, {
      dataSource: "os_data",
      publicPlan: "expanded",
      clientTier: "project_client",
      workspaceRole: "viewer",
      isStaff: false,
    }),
    false,
  );
});

test("client-tier targeting and staff visibility do not leak through public-plan rules", () => {
  const clientRelease = {
    ...release,
    target_data_sources: ["client_data"],
    target_public_plans: [],
    target_client_tiers: ["growth_90"],
  };
  assert.equal(
    releaseMatchesAudience(clientRelease, {
      dataSource: "client_data",
      publicPlan: null,
      clientTier: "project_client",
      workspaceRole: "owner",
      isStaff: false,
    }),
    false,
  );
  assert.equal(
    releaseMatchesAudience(clientRelease, {
      dataSource: "client_data",
      publicPlan: null,
      clientTier: "project_client",
      workspaceRole: "staff",
      isStaff: true,
    }),
    true,
  );
});

test("release links allow HTTPS only", () => {
  assert.equal(safeReleaseLink("https://waveos.example/notes"), "https://waveos.example/notes");
  assert.equal(safeReleaseLink("http://waveos.example/notes"), null);
  assert.equal(safeReleaseLink("javascript:alert(1)"), null);
  assert.equal(safeReleaseLink("not a url"), null);
});

test("dashboard, notifications, and mobile shell preserve truthful and scoped behavior", async () => {
  const [home, notifications, releases, root, calendar, landing] = await Promise.all([
    readFile(new URL("../../src/routes/_authenticated/home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app/notifications-bell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/hooks/use-product-releases.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/routes/__root.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/routes/_authenticated/calendar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/routes/index.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(home, /enabled: !!wsId/);
  assert.match(home, /if \(failed\?\.error\) throw failed\.error/);
  assert.match(home, /can\("can_use_campaign_manager"\)/);
  assert.match(home, /to="\/updates"/);

  assert.match(notifications, /\.eq\("user_id", auth\.user\.id\)/);
  assert.match(notifications, /\.is\("read_at", null\)/);
  assert.doesNotMatch(notifications, /\.delete\(\)/);

  assert.match(releases, /\.lte\("published_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(releases, /releaseMatchesAudience\(release, audience!\)/);
  assert.match(root, /viewport-fit=cover/);
  assert.match(calendar, /aria-label={`\$\{monthName\} agenda`}/);
  assert.match(landing, /Clear about your data/);
});
