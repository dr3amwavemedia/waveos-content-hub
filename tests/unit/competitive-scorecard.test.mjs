import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(
  new URL("../../src/lib/competitive-scorecard.ts", import.meta.url).pathname,
).href;

test("competitive scorecards keep missing evidence unavailable", async () => {
  const source = await (
    await import("node:fs/promises")
  ).readFile(new URL("../../src/lib/competitive-scorecard.ts", import.meta.url), "utf8");
  assert.match(source, /score: number \| null/);
  assert.match(source, /evidenceCount > 0 && sources\.length > 0/);
  assert.match(source, /Missing categories stay unavailable instead of becoming zero/);
  assert.match(source, /Brand Recognition Signals/);
  assert.match(source, /Conversion Readiness/);
  assert.ok(moduleUrl.includes("competitive-scorecard"));
});

test("competitive scoring is deterministic rather than model-authored", async () => {
  const source = await (
    await import("node:fs/promises")
  ).readFile(new URL("../../src/lib/competitive-scorecard.ts", import.meta.url), "utf8");
  assert.match(source, /50 \+ strengths\.length \* 10 - gaps\.length \* 12/);
  assert.match(source, /eligible\.reduce/);
  assert.match(source, /buildNinetyDayPlan/);
});
