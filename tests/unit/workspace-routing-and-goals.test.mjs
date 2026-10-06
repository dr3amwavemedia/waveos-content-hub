import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const workspaceSource = readFileSync("src/hooks/use-waveos.ts", "utf8");
const impersonationSource = readFileSync("src/hooks/use-impersonation.ts", "utf8");
const clientsSource = readFileSync("src/routes/_authenticated/clients.tsx", "utf8");
const goalsSource = readFileSync("src/lib/social-goals.ts", "utf8");
const goalsCompiled = ts.transpileModule(goalsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const goals = {};
new Function("exports", goalsCompiled)(goals);

test("staff always rank the shared Dream Wave workspace first", () => {
  assert.match(workspaceSource, /if \(ctx\.isStaff\) return id === STAFF_WORKSPACE_ID \? 0 : 1/);
  assert.doesNotMatch(workspaceSource, /ownsStaffWorkspace/);
});

test("view-as-client carries the selected member role and keeps admin attribution visible", () => {
  assert.match(impersonationSource, /waveos\.preview-client-role/);
  assert.match(workspaceSource, /\? previewRole/);
  assert.match(clientsSource, /View as this account/);
  assert.match(clientsSource, /role: member\.workspace_role/);
});

test("weekly goal counts scheduled and published posts in the local Monday week", () => {
  const now = new Date("2026-10-07T12:00:00");
  const items = [
    { status: "draft", scheduled_at: "2026-10-06T12:00:00", published_at: null },
    { status: "scheduled", scheduled_at: "2026-10-06T12:00:00", published_at: null },
    { status: "published", scheduled_at: null, published_at: "2026-10-07T10:00:00" },
    { status: "published", scheduled_at: null, published_at: "2026-10-01T10:00:00" },
  ];
  assert.equal(goals.weeklyPostingProgress(items, now), 2);
});
