import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("trend discovery keeps workspace permission checks ahead of external provider access", () => {
  const source = read("src/lib/trending-now.functions.ts");
  assert.ok(source.indexOf("requireWorkspaceFeatureAccess") < source.indexOf("PARALLEL_API_KEY"));
  assert.match(source, /small business storytelling/);
  assert.match(source, /connection_unavailable/);
  assert.match(source, /provider_unavailable/);
  assert.match(source, /connector-gateway\.lovable\.dev\/parallel\/v1\/search/);
  assert.match(source, /X-Connection-Api-Key/);
  assert.match(source, /Math\.min\(20, maxResults\)/);
  assert.match(source, /\.slice\(0, 3\)/);
  assert.doesNotMatch(source, /`site:/);
});

test("analytics exposes stored backfill evidence without fabricating a chart", () => {
  const server = read("src/lib/zernio.functions.ts");
  const ui = read("src/components/social/analytics-checkup.tsx");
  assert.match(server, /updated_at,metadata/);
  assert.match(ui, /History collection in progress/);
  assert.match(ui, /Top provider-reported content/);
  assert.match(ui, /No content winners are\s+inferred\s+from account totals/);
});

test("screenshot-targeted surfaces use the compact Ocean hierarchy", () => {
  const mobileShell = read("src/components/app/app-shell.tsx");
  const production = read("src/routes/_authenticated/videographer.tsx");
  const content = read("src/routes/_authenticated/content.tsx");
  const studio = read("src/routes/_authenticated/creative-studio.tsx");
  assert.match(mobileShell, /function MobileAdminNav/);
  assert.match(mobileShell, /aria-expanded=\{open\}/);
  assert.match(mobileShell, /min\(18rem,82vw\)/);
  assert.match(production, /Today in production/);
  assert.match(production, /ProductionProjectsPanel/);
  assert.match(content, /<details className="ocean-disclosure group"/);
  assert.match(studio, /cn\("ocean-disclosure group"/);
});
