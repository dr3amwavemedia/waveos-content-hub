import { test } from "node:test";
import assert from "node:assert/strict";

import {
  countConfirmedLeads,
  countLeadActions,
  socialAnalyticsRangeStart,
  socialMetricObservationKey,
  socialPostCopyKey,
  SOCIAL_ANALYTICS_RANGES,
  SOCIAL_ANALYTICS_RANGE_LABELS,
} from "../../src/lib/social-metrics-contract.ts";
import { resolveMetricAvailability } from "../../src/lib/social-provider-capabilities.ts";
import {
  dedupeSocialMetricObservations,
  rollupSocialMetric,
} from "../../src/lib/social-metrics-rollup.ts";

const base = {
  workspaceId: "workspace-1",
  provider: "zernio",
  providerAccountId: "account-1",
  providerPostId: "post-1",
  platform: "instagram",
  contentType: "reel",
  metricKey: "reach",
  value: 100,
  availability: "available",
  granularity: "lifetime",
  windowStart: "2026-11-01",
  windowEnd: "2026-11-18",
  capturedAt: "2026-11-18T12:00:00Z",
  sourceReference: "provider post analytics",
  calculationVersion: "direct-v1",
};

test("analytics ranges cover day through twelve months with approachable labels", () => {
  assert.deepEqual(SOCIAL_ANALYTICS_RANGES, [1, 7, 30, 90, 180, 365]);
  assert.equal(SOCIAL_ANALYTICS_RANGE_LABELS[1], "Day");
  assert.equal(SOCIAL_ANALYTICS_RANGE_LABELS[30], "Month");
  assert.equal(SOCIAL_ANALYTICS_RANGE_LABELS[365], "12 months");
});

test("post identity separates cross-posted accounts and platforms", () => {
  const first = socialPostCopyKey(base);
  assert.notEqual(first, socialPostCopyKey({ ...base, providerAccountId: "account-2" }));
  assert.notEqual(first, socialPostCopyKey({ ...base, platform: "facebook" }));
  assert.notEqual(first, socialPostCopyKey({ ...base, providerPostId: "post-2" }));
});

test("observation identity excludes capture time so refreshes are idempotent", () => {
  assert.equal(
    socialMetricObservationKey(base),
    socialMetricObservationKey({ ...base, capturedAt: "2026-11-18T18:00:00Z", value: 120 }),
  );
  assert.equal(
    dedupeSocialMetricObservations([
      base,
      { ...base, capturedAt: "2026-11-18T18:00:00Z", value: 120 },
    ])[0].value,
    120,
  );
});

test("cross-post rollups count each copy once without duplicate provider rows", () => {
  const facebook = {
    ...base,
    platform: "facebook",
    providerAccountId: "account-2",
    providerPostId: "post-2",
    value: 40,
  };
  const rollup = rollupSocialMetric({
    observations: [base, { ...base, capturedAt: "2026-11-18T18:00:00Z" }, facebook],
    metricKey: "reach",
    windowStart: base.windowStart,
    windowEnd: base.windowEnd,
  });
  assert.equal(rollup.value, 140);
  assert.equal(rollup.contributingCopies, 2);
  assert.equal(rollup.coverage, "complete");
});

test("availability keeps unsupported, missing, failure and true zero distinct", () => {
  const common = { connection: "active", permission: "granted", fetch: "success" };
  assert.equal(
    resolveMetricAvailability({ ...common, capability: "unsupported", value: null }),
    "unsupported",
  );
  assert.equal(
    resolveMetricAvailability({
      ...common,
      capability: "permission_required",
      permission: "missing",
      value: null,
    }),
    "permission_missing",
  );
  assert.equal(
    resolveMetricAvailability({ ...common, capability: "supported", fetch: "failed", value: null }),
    "sync_failed",
  );
  assert.equal(
    resolveMetricAvailability({ ...common, capability: "supported", value: 0 }),
    "true_zero",
  );
});

test("lead actions and confirmed leads remain separate measures", () => {
  assert.equal(
    countLeadActions([
      { kind: "click", postCopyKey: "a", value: 9, observedAt: "now", sourceReference: "provider" },
      {
        kind: "message_start",
        postCopyKey: "a",
        value: 2,
        observedAt: "now",
        sourceReference: "provider",
      },
    ]),
    11,
  );
  assert.equal(
    countConfirmedLeads([
      { workspaceId: "w", dedupeKey: "person-1", source: "crm", confirmedAt: "now" },
      { workspaceId: "w", dedupeKey: "person-1", source: "form", confirmedAt: "later" },
    ]),
    1,
  );
});

test("analytics ranges include the end date and support the approved windows", () => {
  assert.equal(socialAnalyticsRangeStart("2026-11-18", 7), "2026-11-12");
  assert.equal(socialAnalyticsRangeStart("2026-11-18", 365), "2025-11-19");
});
