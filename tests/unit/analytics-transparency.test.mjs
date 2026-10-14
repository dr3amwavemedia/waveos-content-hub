import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync("src/lib/analytics-transparency.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const analytics = {};
new Function("exports", compiled)(analytics);

const range = { requestedRangeStart: "2026-09-14", requestedRangeEnd: "2026-10-14" };

test("provider rollups are read once instead of recursively double counted", () => {
  const result = analytics.parseAnalyticsPayload({
    key: "organic",
    ...range,
    payload: {
      analytics: {
        impressions: 12,
        childRecords: [{ impressions: 12 }, { impressions: 8 }],
      },
    },
  });
  assert.equal(result.metrics.impressions.value, 12);
  assert.equal(result.recordCount, 1);
});

test("reported zero is distinct from a missing metric", () => {
  const result = analytics.parseAnalyticsPayload({
    key: "external",
    ...range,
    payload: { data: [{ likes: 0 }, { comments: 4 }] },
  });
  assert.deepEqual(result.metrics.likes, { value: 0, availability: "true_zero" });
  assert.deepEqual(result.metrics.reach, { value: null, availability: "not_synced" });
  assert.equal(result.recordCount, 2);
});

test("combined values disclose partial source coverage", () => {
  const available = analytics.parseAnalyticsPayload({
    key: "organic",
    ...range,
    payload: { analytics: { reach: 25 } },
  });
  const unavailable = analytics.unavailableAnalyticsSource({
    key: "paid",
    ...range,
    availability: "permission_missing",
  });
  assert.deepEqual(analytics.combineAnalyticsMetric([available, unavailable], "reach"), {
    value: 25,
    availability: "available",
    coverage: "partial",
    contributingSources: 1,
    expectedSources: 2,
  });
});

test("provider errors become safe availability states", () => {
  assert.equal(
    analytics.classifyAnalyticsError({ status: 403, message: "raw provider detail" }).availability,
    "permission_missing",
  );
  assert.equal(
    analytics.classifyAnalyticsError({ status: 401, message: "token expired" }).availability,
    "connection_expired",
  );
});
