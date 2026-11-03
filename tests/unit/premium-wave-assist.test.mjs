import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync("src/lib/wave-assist.functions.ts", "utf8");
const dashboard = readFileSync("src/components/app/ocean-intelligence-dashboard.tsx", "utf8");
const campaign = readFileSync("src/lib/campaign-ideas.functions.ts", "utf8");
const seo = readFileSync("src/lib/seo-growth.functions.ts", "utf8");

test("Wave Assist is a real contextual advisor with bounded conversation history", () => {
  assert.match(backend, /"advisor"/);
  assert.match(backend, /conversation:[\s\S]*\.max\(8\)/);
  assert.match(backend, /Never claim an action was completed/);
  assert.match(dashboard, /mode: "advisor"/);
  assert.match(dashboard, /waveos\.assist\./);
  assert.match(dashboard, /Turn answer into a draft/);
});

test("active WaveOS text intelligence uses the current premium everyday model", () => {
  for (const source of [backend, campaign, seo]) {
    assert.match(source, /google\/gemini-3\.8-flash/);
    assert.doesNotMatch(source, /gemini-3\.1-flash-lite/);
  }
});

test("premium assistant remains review-only", () => {
  assert.match(dashboard, /never publishes or changes records for you/);
  assert.match(backend, /the user must explicitly complete it in WaveOS/);
});
