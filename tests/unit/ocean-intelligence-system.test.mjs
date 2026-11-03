import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("client financial data remains role gated in both dashboard variants", () => {
  for (const path of [
    "src/components/app/layer1-overview.tsx",
    "src/components/app/wedding-overview.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /canViewClientFinancials\(activeWorkspace\?\.role\)/);
    assert.match(source, /enabled: !!wsId && canViewFinancials/);
    assert.match(source, /\{canViewFinancials &&/);
  }
});

test("Ocean disclosures preserve native keyboard and screen-reader semantics", () => {
  const source = read("src/components/app/ocean-ui.tsx");
  const styles = read("src/styles.css");
  assert.match(source, /<details/);
  assert.match(source, /<summary/);
  assert.match(source, /cursor-pointer/);
  assert.match(styles, /\.ocean-disclosure summary:focus-visible/);
});

test("analytics keeps unavailable values unavailable and comparisons evidence-bound", () => {
  const analytics = read("src/components/social/analytics-checkup.tsx");
  const history = read("src/lib/analytics-history.ts");
  assert.match(analytics, /metric\.value\s*===\s*null\s*\?\s*"—"/);
  assert.match(analytics, /Missing or failed sources remain unavailable/);
  assert.match(analytics, /equal-length,\s+non-overlapping observed periods/);
  assert.match(analytics, /These are calculated observations, not AI conclusions/);
  assert.match(history, /calculation_version/);
  assert.match(history, /provider/);
});

test("the shared app canvas and Ocean pages protect narrow layouts", () => {
  const shell = read("src/components/app/app-shell.tsx");
  const styles = read("src/styles.css");
  assert.match(shell, /min-w-0 px-3/);
  assert.match(styles, /\.ocean-page[\s\S]*overflow-x: clip/);
  assert.match(styles, /@media \(max-width: 639px\)/);
});

test("authenticated client navigation retains action routes and feature gates", () => {
  const shell = read("src/components/app/app-shell.tsx");
  for (const route of ["/deliveries", "/analytics", "/settings", "/wedding-content"]) {
    assert.ok(shell.includes(`to: "${route}"`), `${route} should remain in app navigation`);
  }
  assert.match(shell, /feature: "can_view_analytics_checkup"/);
  assert.match(shell, /WEDDING_ALLOWED_PATHS\.includes\(pathname\)/);
});
