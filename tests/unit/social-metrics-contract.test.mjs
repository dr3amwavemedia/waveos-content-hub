import test from "node:test";
import assert from "node:assert/strict";
import { postCopyKey, confirmedLeadDedupeKey } from "../../src/lib/social-metrics-contract.ts";
import { resolveMetricAvailability } from "../../src/lib/social-provider-capabilities.ts";
import { rollupMetric, dedupeObservations, leadActionTotal, rangeWindow, ANALYTICS_RANGE_DAYS } from "../../src/lib/social-metrics-rollup.ts";

const base = { workspaceId: "w1", provider: "zernio", contentType: "post", granularity: "lifetime", windowStart: "2026-11-01", windowEnd: "2026-11-01", sourceReference: "test", calculationVersion: "v1", capturedAt: "2026-11-02T00:00:00Z" };
const obs = (o) => ({ ...base, platform: "instagram", providerAccountId: "a1", providerPostId: "p1", metricKey: "reach", value: 10, availability: "available", ...o });

test("cross-posted copies stay separate by platform/account/post id", () => {
  assert.notEqual(postCopyKey(obs({})), postCopyKey(obs({ platform: "facebook" })));
  assert.notEqual(postCopyKey(obs({})), postCopyKey(obs({ providerAccountId: "a2" })));
  const r = rollupMetric([obs({}), obs({ platform: "facebook", value: 5 })], "reach");
  assert.equal(r.value, 15); assert.equal(r.contributingCopies, 2);
});
test("re-captures of the same copy are not double counted", () => {
  const rows = [obs({ value: 10 }), obs({ value: 12, capturedAt: "2026-11-03T00:00:00Z" })];
  assert.equal(dedupeObservations(rows).length, 1);
  assert.equal(rollupMetric(rows, "reach").value, 12);
});
test("unsupported and failed metrics are not zero; supported fetched 0 is true zero", () => {
  assert.deepEqual(resolveMetricAvailability({ platform: "tiktok", contentType: "video", metric: "saves", fetchState: "fetched", value: 0 }), { value: null, availability: "unsupported" });
  assert.equal(resolveMetricAvailability({ platform: "instagram", contentType: "post", metric: "reach", fetchState: "failed", value: 0 }).availability, "sync_failed");
  assert.equal(resolveMetricAvailability({ platform: "instagram", contentType: "post", metric: "reach", fetchState: "connection_expired", value: 3 }).availability, "connection_expired");
  assert.deepEqual(resolveMetricAvailability({ platform: "instagram", contentType: "post", metric: "reach", fetchState: "fetched", value: 0 }), { value: 0, availability: "true_zero" });
});
test("missing copy makes coverage partial, not a lower total presented as complete", () => {
  const r = rollupMetric([obs({}), obs({ providerPostId: "p2", value: null, availability: "permission_missing" })], "reach");
  assert.equal(r.value, 10); assert.equal(r.coverage, "partial");
});
test("lead actions sum clicks and messages but never count people", () => {
  const t = leadActionTotal([obs({ metricKey: "clicks", value: 4 }), obs({ metricKey: "messages", value: 2 })]);
  assert.equal(t.value, 6); assert.equal(t.countsPeople, false);
});
test("confirmed leads dedupe by CRM id, then email, then phone", () => {
  assert.equal(confirmedLeadDedupeKey({ crmContactId: "c9", email: "x@y.com" }), "crm:c9");
  assert.equal(confirmedLeadDedupeKey({ email: " A@B.com " }), "email:a@b.com");
  assert.equal(confirmedLeadDedupeKey({ phone: "(941) 555-0100" }), "phone:9415550100");
  assert.equal(confirmedLeadDedupeKey({}), null);
});
test("range options are 7/30/90/180/365 days inclusive", () => {
  assert.deepEqual([...ANALYTICS_RANGE_DAYS], [7, 30, 90, 180, 365]);
  assert.deepEqual(rangeWindow(7, "2026-11-19"), { start: "2026-11-13", end: "2026-11-19" });
});
