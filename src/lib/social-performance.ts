/**
 * The one selector over stored per-post observations. Analytics, Published
 * Posts, Campaign Manager, Overview and My Agent all read this shape, so no
 * screen keeps its own rollup, availability rule or cross-post dedupe.
 */
import type { AnalyticsAvailability, AnalyticsMetricKey } from "./analytics-transparency.ts";
import {
  countConfirmedLeads,
  socialAnalyticsRangeStart,
  socialPostCopyKey,
  SOCIAL_ANALYTICS_RANGES,
  type ConfirmedSocialLead,
  type SocialAnalyticsRangeDays,
  type SocialContentType,
  type SocialMetricObservation,
} from "./social-metrics-contract.ts";
import { dedupeSocialMetricObservations, rollupSocialMetric, type SocialMetricRollup } from "./social-metrics-rollup.ts";
import { POST_METRIC_KEYS, type BackfillStatus } from "./social-post-metrics.ts";

export const PERFORMANCE_METRICS = POST_METRIC_KEYS as readonly AnalyticsMetricKey[];
export const ENGAGEMENT_COMPONENTS: readonly AnalyticsMetricKey[] = ["likes", "comments", "shares", "saves"];
export const LEAD_ACTION_NOTE =
  "Lead actions are provider-reported link clicks and DM/message starts. They are interactions, not unique people, confirmed leads or sales.";

export function isRangeDays(value: unknown): value is SocialAnalyticsRangeDays {
  return SOCIAL_ANALYTICS_RANGES.includes(Number(value) as SocialAnalyticsRangeDays);
}

export type PerformanceFilters = {
  platform?: string | null;
  accountId?: string | null;
  contentType?: SocialContentType | "stories_reels" | null;
  contentItemIds?: readonly string[] | null;
};

export type BackfillRunRow = {
  provider_account_id: string;
  platform: string;
  status: BackfillStatus;
  covered_range_start: string | null;
  covered_range_end: string | null;
  last_success_at: string | null;
  last_attempt_at: string | null;
  safe_message: string | null;
};

export type CopyPerformance = {
  copyKey: string;
  platform: string;
  providerAccountId: string;
  providerPostId: string;
  contentType: SocialContentType;
  contentItemId: string | null;
  publishedOn: string;
  capturedAt: string | null;
  metrics: Partial<Record<AnalyticsMetricKey, { value: number | null; availability: AnalyticsAvailability }>>;
};

export type GroupRollup = { key: string; copies: number; metrics: Record<string, SocialMetricRollup> };

export type SocialPerformance = {
  period: { days: SocialAnalyticsRangeDays; start: string; end: string };
  hasStoredData: boolean;
  copyCount: number;
  metrics: Record<string, SocialMetricRollup>;
  engagement: { value: number | null; availability: AnalyticsAvailability; components: AnalyticsMetricKey[] };
  leadActions: { clicks: SocialMetricRollup; messages: SocialMetricRollup; combined: number | null; note: string };
  confirmedLeads: { count: number; note: string };
  freshestCapture: string | null;
  sourceReferences: string[];
  breakdown: { platform: GroupRollup[]; account: GroupRollup[]; contentType: GroupRollup[] };
  copies: CopyPerformance[];
  best: CopyPerformance[];
  needsAttention: CopyPerformance[];
  rankingMetric: AnalyticsMetricKey | null;
  recommendations: string[];
  evidenceGaps: string[];
  backfill: {
    accounts: BackfillRunRow[];
    availableRangeStart: string | null;
    lastSuccessAt: string | null;
    problems: { accountId: string; platform: string; status: BackfillStatus; message: string }[];
  };
};

function matchesFilters(row: SocialMetricObservation, f: PerformanceFilters) {
  if (f.platform && row.platform !== f.platform) return false;
  if (f.accountId && row.providerAccountId !== f.accountId) return false;
  if (f.contentType === "stories_reels" && !["story", "reel"].includes(row.contentType)) return false;
  if (f.contentType && f.contentType !== "stories_reels" && row.contentType !== f.contentType) return false;
  if (f.contentItemIds && !(row.contentItemId && f.contentItemIds.includes(row.contentItemId))) return false;
  return true;
}

function rollupAll(rows: SocialMetricObservation[], start: string, end: string, expected: string[]) {
  // Lifetime rows are keyed to publish day; align them to the period so the
  // shared rollup sums each distinct copy once.
  const aligned = rows.map((row) => ({ ...row, windowStart: start, windowEnd: end }));
  return Object.fromEntries(
    PERFORMANCE_METRICS.map((metricKey) => [
      metricKey,
      rollupSocialMetric({ observations: aligned, metricKey, windowStart: start, windowEnd: end, expectedPostCopyKeys: expected }),
    ]),
  ) as Record<string, SocialMetricRollup>;
}

function grouped(rows: SocialMetricObservation[], by: (row: SocialMetricObservation) => string, start: string, end: string) {
  const groups = new Map<string, SocialMetricObservation[]>();
  for (const row of rows) groups.set(by(row), [...(groups.get(by(row)) ?? []), row]);
  return [...groups.entries()].map(([key, list]) => {
    const copies = [...new Set(list.map((row) => socialPostCopyKey(row)))];
    return { key, copies: copies.length, metrics: rollupAll(list, start, end, copies) };
  });
}

function engagementOf(metrics: CopyPerformance["metrics"]) {
  const known = ENGAGEMENT_COMPONENTS.map((k) => metrics[k]).filter((m) => m && m.value !== null);
  if (!known.length) return null;
  return known.reduce((sum, m) => sum + (m!.value as number), 0);
}

const MIN_COMPARABLE = 3;

export function buildSocialPerformance(input: {
  observations: readonly SocialMetricObservation[];
  leads: readonly ConfirmedSocialLead[];
  backfillRuns: readonly BackfillRunRow[];
  days: SocialAnalyticsRangeDays;
  endDate: string;
  filters?: PerformanceFilters;
}): SocialPerformance {
  const end = input.endDate.slice(0, 10);
  const start = socialAnalyticsRangeStart(end, input.days);
  const filters = input.filters ?? {};
  const rows = dedupeSocialMetricObservations(input.observations).filter(
    (row) => row.granularity === "lifetime" && row.windowStart >= start && row.windowStart <= end && matchesFilters(row, filters),
  );
  const copyKeys = [...new Set(rows.map((row) => socialPostCopyKey(row)))];
  const metrics = rollupAll(rows, start, end, copyKeys);

  const engagementParts = ENGAGEMENT_COMPONENTS.map((k) => metrics[k]).filter((m) => m.value !== null);
  const engagementValue = engagementParts.length ? engagementParts.reduce((s, m) => s + (m.value as number), 0) : null;

  const copyMap = new Map<string, CopyPerformance>();
  for (const row of rows) {
    const key = socialPostCopyKey(row);
    const copy = copyMap.get(key) ?? {
      copyKey: key,
      platform: row.platform,
      providerAccountId: row.providerAccountId,
      providerPostId: row.providerPostId,
      contentType: row.contentType,
      contentItemId: row.contentItemId ?? null,
      publishedOn: row.windowStart,
      capturedAt: null,
      metrics: {},
    };
    copy.metrics[row.metricKey] = { value: row.value, availability: row.availability };
    if (!copy.capturedAt || row.capturedAt > copy.capturedAt) copy.capturedAt = row.capturedAt;
    copy.contentItemId = copy.contentItemId ?? row.contentItemId ?? null;
    copyMap.set(key, copy);
  }
  const copies = [...copyMap.values()].sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));

  // Rank only by one metric every compared copy reports; never mix metrics.
  const rankingMetric =
    (["reach", "views", "impressions"] as AnalyticsMetricKey[]).find(
      (k) => copies.filter((c) => c.metrics[k]?.value != null).length >= MIN_COMPARABLE,
    ) ?? null;
  const ranked = rankingMetric
    ? copies.filter((c) => c.metrics[rankingMetric]?.value != null).sort(
        (a, b) => (b.metrics[rankingMetric]!.value as number) - (a.metrics[rankingMetric]!.value as number),
      )
    : [];
  const best = ranked.slice(0, 3);
  const needsAttention = ranked.length >= MIN_COMPARABLE * 2 ? ranked.slice(-3).reverse() : [];

  const contentTypeGroups = grouped(rows, (row) => row.contentType, start, end);
  const recommendations: string[] = [];
  const evidenceGaps: string[] = [];
  if (!copies.length) evidenceGaps.push("No stored post performance exists for this period yet.");
  else if (!rankingMetric) evidenceGaps.push(`Ranking needs at least ${MIN_COMPARABLE} posts reporting the same reach, views or impressions metric.`);
  if (rankingMetric) {
    const averages = contentTypeGroups.flatMap((g) => {
      const list = copies.filter((c) => c.contentType === g.key && c.metrics[rankingMetric]?.value != null);
      if (list.length < MIN_COMPARABLE) return [];
      return [{ type: g.key, n: list.length, avg: list.reduce((s, c) => s + (c.metrics[rankingMetric]!.value as number), 0) / list.length }];
    });
    if (averages.length >= 2) {
      averages.sort((a, b) => b.avg - a.avg);
      const top = averages[0]!;
      const next = averages[1]!;
      recommendations.push(
        `${top.type} copies averaged ${Math.round(top.avg).toLocaleString()} ${rankingMetric} (${top.n} copies) vs ${Math.round(next.avg).toLocaleString()} for ${next.type} (${next.n} copies) in this period. Consider testing more ${top.type} content; this compares averages only and does not prove the cause.`,
      );
    } else if (copies.length) {
      evidenceGaps.push(`Format recommendations need at least ${MIN_COMPARABLE} comparable copies in two content types.`);
    }
  }

  const leadsInPeriod = input.leads.filter((lead) => {
    const d = lead.confirmedAt.slice(0, 10);
    return d >= start && d <= end;
  });
  const clicks = metrics.clicks!;
  const messages = metrics.messages!;
  const combined = clicks.value === null && messages.value === null ? null : (clicks.value ?? 0) + (messages.value ?? 0);

  const runs = [...input.backfillRuns].filter(
    (run) => (!filters.platform || run.platform === filters.platform) && (!filters.accountId || run.provider_account_id === filters.accountId),
  );
  const freshestCapture = rows.map((r) => r.capturedAt).sort().at(-1) ?? null;
  return {
    period: { days: input.days, start, end },
    hasStoredData: rows.length > 0,
    copyCount: copyKeys.length,
    metrics,
    engagement: {
      value: engagementValue,
      availability: engagementValue === null ? "not_synced" : engagementValue === 0 ? "true_zero" : "available",
      components: engagementParts.map((m) => m.metricKey),
    },
    leadActions: { clicks, messages, combined, note: LEAD_ACTION_NOTE },
    confirmedLeads: {
      count: countConfirmedLeads(leadsInPeriod),
      note: "Confirmed leads are recorded by your team and counted once per person.",
    },
    freshestCapture,
    sourceReferences: [...new Set(rows.map((r) => r.sourceReference))].sort(),
    breakdown: {
      platform: grouped(rows, (row) => row.platform, start, end),
      account: grouped(rows, (row) => `${row.platform}::${row.providerAccountId}`, start, end),
      contentType: contentTypeGroups,
    },
    copies,
    best,
    needsAttention,
    rankingMetric,
    recommendations,
    evidenceGaps,
    backfill: {
      accounts: runs,
      availableRangeStart: runs.map((r) => r.covered_range_start).filter((d): d is string => Boolean(d)).sort()[0] ?? null,
      lastSuccessAt: runs.map((r) => r.last_success_at).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null,
      problems: runs
        .filter((r) => ["failed", "unsupported"].includes(r.status))
        .map((r) => ({
          accountId: r.provider_account_id,
          platform: r.platform,
          status: r.status,
          message: r.safe_message ?? "History could not be loaded for this account.",
        })),
    },
  };
}

/** Previous period of identical length, ending the day before the current one starts. */
export function previousPeriodEnd(current: { start: string }) {
  const d = new Date(`${current.start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function compareMetric(current: SocialMetricRollup, previous: SocialMetricRollup) {
  if (current.value === null || previous.value === null)
    return { comparable: false as const, reason: "One of the periods has no provider value for this metric." };
  if (current.coverage !== "complete" || previous.coverage !== "complete")
    return { comparable: false as const, reason: "Coverage is partial in at least one period." };
  return { comparable: true as const, change: current.value - previous.value };
}

const AVAILABILITY_TEXT: Record<AnalyticsAvailability, string> = {
  available: "available",
  true_zero: "reported as zero",
  not_synced: "not synced yet",
  permission_missing: "unavailable — permission missing",
  connection_expired: "unavailable — connection expired",
  sync_failed: "unavailable — the last sync failed",
  unsupported: "not offered by this network",
};

export function availabilityText(value: AnalyticsAvailability) {
  return AVAILABILITY_TEXT[value];
}

export function formatRollup(rollup: SocialMetricRollup) {
  if (rollup.value === null) return availabilityText(rollup.availability);
  return `${rollup.value.toLocaleString()} (${rollup.coverage} coverage, ${rollup.contributingCopies}/${rollup.expectedCopies} copies)`;
}

/** Evidence block for My Agent: every number carries period, source, freshness and coverage. */
export function performanceEvidenceText(p: SocialPerformance, previous?: SocialPerformance | null) {
  const lines = [
    `Stored post performance ${p.period.start} to ${p.period.end} (${p.period.days} days). Source: ${p.sourceReferences.join(", ") || "none"}. Freshest capture: ${p.freshestCapture ?? "never"}. Copies: ${p.copyCount}.`,
  ];
  for (const key of PERFORMANCE_METRICS) {
    const r = p.metrics[key]!;
    let line = `- ${key}: ${formatRollup(r)}`;
    if (previous) {
      const cmp = compareMetric(r, previous.metrics[key]!);
      line += cmp.comparable
        ? `; previous ${previous.period.start}..${previous.period.end}: ${previous.metrics[key]!.value} (change ${cmp.change >= 0 ? "+" : ""}${cmp.change})`
        : `; no comparison (${cmp.reason})`;
    }
    lines.push(line);
  }
  lines.push(`- lead actions (clicks + DM/message starts): ${p.leadActions.combined ?? "unavailable"}. ${p.leadActions.note}`);
  lines.push(`- confirmed leads (team-recorded): ${p.confirmedLeads.count}`);
  for (const c of p.best) lines.push(`- best by ${p.rankingMetric}: ${c.platform} ${c.contentType} ${c.providerPostId} on ${c.publishedOn} = ${c.metrics[p.rankingMetric!]?.value}`);
  for (const c of p.needsAttention) lines.push(`- lowest by ${p.rankingMetric}: ${c.platform} ${c.contentType} ${c.providerPostId} on ${c.publishedOn} = ${c.metrics[p.rankingMetric!]?.value}`);
  for (const g of p.evidenceGaps) lines.push(`- gap: ${g}`);
  for (const pr of p.backfill.problems) lines.push(`- history problem (${pr.platform}): ${pr.message}`);
  return lines.join("\n");
}
