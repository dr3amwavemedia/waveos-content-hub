import type { AnalyticsAvailability, AnalyticsMetricKey } from "./analytics-transparency.ts";
import { LEAD_ACTION_METRICS, observationKey, postCopyKey, type LeadActionTotal, type SocialPostMetricObservation } from "./social-metrics-contract.ts";

export const ANALYTICS_RANGE_DAYS = [7, 30, 90, 180, 365] as const;
export type AnalyticsRangeDays = (typeof ANALYTICS_RANGE_DAYS)[number];

export function rangeWindow(days: AnalyticsRangeDays, today: string) {
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: start.toISOString().slice(0, 10), end: today };
}

/** Keep one row per identity; the newest capture wins. */
export function dedupeObservations(rows: readonly SocialPostMetricObservation[]) {
  const byKey = new Map<string, SocialPostMetricObservation>();
  for (const row of rows) {
    const key = observationKey(row);
    const prev = byKey.get(key);
    if (!prev || row.capturedAt > prev.capturedAt) byKey.set(key, row);
  }
  return [...byKey.values()];
}

export type MetricRollup = {
  metricKey: AnalyticsMetricKey;
  value: number | null;
  availability: AnalyticsAvailability;
  coverage: "complete" | "partial" | "unavailable";
  contributingCopies: number;
  expectedCopies: number;
  freshestCapture: string | null;
};

/** Sum lifetime values across distinct post copies (platform/account/post id), ignoring unsupported copies in the denominator. */
export function rollupMetric(rows: readonly SocialPostMetricObservation[], metricKey: AnalyticsMetricKey): MetricRollup {
  const latest = new Map<string, SocialPostMetricObservation>();
  for (const row of dedupeObservations(rows)) {
    if (row.metricKey !== metricKey || row.granularity !== "lifetime") continue;
    const key = postCopyKey(row);
    const prev = latest.get(key);
    if (!prev || row.capturedAt > prev.capturedAt) latest.set(key, row);
  }
  const copies = [...latest.values()];
  const relevant = copies.filter((row) => row.availability !== "unsupported");
  const withValues = relevant.filter((row) => row.value !== null);
  const freshestCapture = copies.reduce<string | null>((max, row) => (!max || row.capturedAt > max ? row.capturedAt : max), null);
  if (!withValues.length) {
    const reason = relevant.find((row) => row.availability !== "not_synced")?.availability ?? (copies.length && !relevant.length ? "unsupported" : "not_synced");
    return { metricKey, value: null, availability: reason, coverage: "unavailable", contributingCopies: 0, expectedCopies: relevant.length, freshestCapture };
  }
  const value = withValues.reduce((sum, row) => sum + (row.value as number), 0);
  return {
    metricKey,
    value,
    availability: value === 0 ? "true_zero" : "available",
    coverage: withValues.length === relevant.length ? "complete" : "partial",
    contributingCopies: withValues.length,
    expectedCopies: relevant.length,
    freshestCapture,
  };
}

export function leadActionTotal(rows: readonly SocialPostMetricObservation[]): LeadActionTotal {
  const parts = LEAD_ACTION_METRICS.map((key) => rollupMetric(rows, key));
  const known = parts.filter((p) => p.value !== null);
  if (!known.length) return { kind: "lead_actions", value: null, availability: parts[0].availability, countsPeople: false };
  const value = known.reduce((sum, p) => sum + (p.value as number), 0);
  return { kind: "lead_actions", value, availability: value === 0 ? "true_zero" : "available", countsPeople: false };
}
