import type { AnalyticsAvailability, AnalyticsMetricKey } from "./analytics-transparency.ts";
import {
  socialMetricObservationKey,
  socialPostCopyKey,
  type SocialMetricObservation,
} from "./social-metrics-contract.ts";

export type SocialMetricRollup = {
  metricKey: AnalyticsMetricKey;
  value: number | null;
  availability: AnalyticsAvailability;
  coverage: "complete" | "partial" | "unavailable";
  contributingCopies: number;
  expectedCopies: number;
  latestCapturedAt: string | null;
  sourceReferences: string[];
};

export function dedupeSocialMetricObservations(observations: readonly SocialMetricObservation[]) {
  const latest = new Map<string, SocialMetricObservation>();
  for (const observation of observations) {
    const key = socialMetricObservationKey(observation);
    const previous = latest.get(key);
    if (!previous || observation.capturedAt > previous.capturedAt) latest.set(key, observation);
  }
  return [...latest.values()];
}

export function rollupSocialMetric(input: {
  observations: readonly SocialMetricObservation[];
  metricKey: AnalyticsMetricKey;
  windowStart: string;
  windowEnd: string;
  expectedPostCopyKeys?: readonly string[];
}): SocialMetricRollup {
  const matching = dedupeSocialMetricObservations(input.observations).filter(
    (row) =>
      row.metricKey === input.metricKey &&
      row.windowStart === input.windowStart &&
      row.windowEnd === input.windowEnd,
  );
  const expected = new Set(
    input.expectedPostCopyKeys?.length
      ? input.expectedPostCopyKeys
      : matching.map((row) => socialPostCopyKey(row)),
  );
  const availableByCopy = new Map<string, SocialMetricObservation>();
  for (const row of matching) {
    if (row.value === null || !["available", "true_zero"].includes(row.availability)) continue;
    availableByCopy.set(socialPostCopyKey(row), row);
  }
  const available = [...availableByCopy.values()];
  const expectedCopies = expected.size;
  const contributingCopies = available.length;
  const unavailableState = matching.find(
    (row) => !["not_synced", "available", "true_zero"].includes(row.availability),
  )?.availability;
  const value = available.length
    ? available.reduce((total, row) => total + (row.value ?? 0), 0)
    : null;

  return {
    metricKey: input.metricKey,
    value,
    availability:
      value === null ? (unavailableState ?? "not_synced") : value === 0 ? "true_zero" : "available",
    coverage:
      value === null
        ? "unavailable"
        : expectedCopies > 0 && contributingCopies >= expectedCopies
          ? "complete"
          : "partial",
    contributingCopies,
    expectedCopies,
    latestCapturedAt:
      matching
        .map((row) => row.capturedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    sourceReferences: [...new Set(available.map((row) => row.sourceReference))].sort(),
  };
}
