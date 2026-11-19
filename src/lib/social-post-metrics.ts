/**
 * Pure normalization of provider per-post analytics into the shared social
 * metric contract. Only records with a real provider account id and provider
 * post id are stored; missing metrics are omitted (read back as not_synced),
 * never written as zero.
 */
import {
  ANALYTICS_METRIC_KEYS,
  numericMetric,
  type AnalyticsAvailability,
  type AnalyticsMetricKey,
} from "./analytics-transparency.ts";
import {
  socialMetricObservationKey,
  type SocialContentType,
  type SocialMetricObservation,
} from "./social-metrics-contract.ts";
import { entriesOf, isAccountTarget, toProviderPlatform, zernioAccountId, type LivePostAccount } from "./live-posts.ts";

export const POST_METRICS_SOURCE_REFERENCE = "zernio analytics account-scoped posts";
export const POST_METRICS_CALCULATION_VERSION = "waveos-post-copy-lifetime-v1";
export const POST_METRIC_KEYS = ANALYTICS_METRIC_KEYS.filter((key) => key !== "followers");
export const BACKFILL_MAX_DAYS = 365;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const day = (value: unknown) => {
  const text = str(value);
  return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString().slice(0, 10) : null;
};

export function inferContentType(...rows: (Record<string, unknown> | null | undefined)[]): SocialContentType {
  const hint = rows
    .flatMap((row) => (row ? [row.contentType, row.mediaType, row.postType, row.type, row.media_product_type] : []))
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  if (/story|stories/.test(hint)) return "story";
  if (/reel/.test(hint)) return "reel";
  if (/short/.test(hint)) return "short";
  if (/carousel|album/.test(hint)) return "carousel";
  if (/video/.test(hint)) return "video";
  return "post";
}

export type NormalizedPostMetrics = {
  observations: SocialMetricObservation[];
  /** Zernio post id per copy, used to link WaveOS publish history. */
  latePostIds: Map<string, string>;
  skippedWithoutId: number;
  providerDataAsOf: string | null;
};

export function normalizePostMetricObservations(input: {
  workspaceId: string;
  account: LivePostAccount;
  payload: unknown;
  capturedAt: string;
}): NormalizedPostMetrics {
  const payload = record(input.payload);
  const rows = Array.isArray(payload?.posts) ? payload.posts : [];
  const platform = toProviderPlatform(input.account.platform);
  const providerDataAsOf = str(payload?.dataAsOf) ?? str(payload?.lastUpdated) ?? null;
  const out = new Map<string, SocialMetricObservation>();
  const latePostIds = new Map<string, string>();
  let skippedWithoutId = 0;

  for (const value of rows) {
    const row = record(value);
    if (!row) continue;
    const entries = entriesOf(row);
    const targets = entries.length
      ? entries.filter((entry) => isAccountTarget(entry, input.account))
      : toProviderPlatform(str(row.platform) ?? "") === platform &&
          (!row.accountId || zernioAccountId(row.accountId) === input.account.accountId)
        ? [row]
        : [];
    for (const target of targets) {
      const postId = str(target.platformPostId) ?? (entries.length <= 1 ? str(row.platformPostId) : null);
      const published = day(target.publishedAt) ?? day(row.publishedAt);
      if (!postId || !published) {
        skippedWithoutId += 1;
        continue;
      }
      // Exactly one metric level per copy: the entry's own analytics, else the
      // row rollup only when the row has a single target (never both).
      const metrics =
        record(target.analytics) ??
        (target === row || entries.length === 1 ? record(row.analytics) ?? (target === row ? row : null) : null);
      if (!metrics) continue;
      const contentType = inferContentType(target, row);
      for (const metricKey of POST_METRIC_KEYS) {
        const metricValue = numericMetric(metrics, metricKey as AnalyticsMetricKey);
        if (metricValue === null) continue;
        const availability: AnalyticsAvailability = metricValue === 0 ? "true_zero" : "available";
        const observation: SocialMetricObservation = {
          workspaceId: input.workspaceId,
          provider: "zernio",
          providerAccountId: input.account.accountId,
          providerPostId: postId,
          platform,
          contentType,
          metricKey: metricKey as AnalyticsMetricKey,
          value: metricValue,
          availability,
          granularity: "lifetime",
          windowStart: published,
          windowEnd: published,
          capturedAt: input.capturedAt,
          providerDataAsOf,
          sourceReference: POST_METRICS_SOURCE_REFERENCE,
          calculationVersion: POST_METRICS_CALCULATION_VERSION,
        };
        out.set(socialMetricObservationKey(observation), observation);
      }
      const latePostId = str(row.latePostId) ?? str(row._id);
      if (latePostId) latePostIds.set(`${platform}::${input.account.accountId}::${postId}`, latePostId);
    }
  }
  return { observations: [...out.values()], latePostIds, skippedWithoutId, providerDataAsOf };
}

export type PublishAttemptLink = {
  provider_post_id: string | null;
  content_item_id: string;
  platform?: string | null;
  request_snapshot?: unknown;
};

/** Links copies to WaveOS posts only through recorded publish attempts; external posts stay unlinked. */
export function linkObservationsToContent(
  observations: SocialMetricObservation[],
  latePostIds: Map<string, string>,
  attempts: readonly PublishAttemptLink[],
) {
  const byLate = new Map<string, PublishAttemptLink>();
  for (const attempt of attempts) if (attempt.provider_post_id) byLate.set(attempt.provider_post_id, attempt);
  return observations.map((row) => {
    const late = latePostIds.get(`${row.platform}::${row.providerAccountId}::${row.providerPostId}`);
    const attempt = late ? byLate.get(late) : undefined;
    if (!attempt) return row;
    const target = record(record(attempt.request_snapshot)?.waveosTarget);
    const variant = str(target?.variantId) ?? str(target?.postVariantId);
    return { ...row, contentItemId: attempt.content_item_id, postVariantId: variant ?? row.postVariantId ?? null };
  });
}

export type ObservationRow = {
  workspace_id: string;
  content_item_id: string | null;
  post_variant_id: string | null;
  provider: string;
  provider_account_id: string;
  provider_post_id: string;
  platform: string;
  content_type: SocialContentType;
  metric_key: AnalyticsMetricKey;
  value: number | null;
  availability: AnalyticsAvailability;
  granularity: "daily" | "lifetime";
  window_start: string;
  window_end: string;
  captured_at: string;
  provider_data_as_of: string | null;
  source_reference: string;
  calculation_version: string;
  evidence?: Record<string, unknown>;
};

export const OBSERVATION_CONFLICT =
  "workspace_id,provider,platform,provider_account_id,provider_post_id,metric_key,granularity,window_start,window_end";

export function observationToRow(row: SocialMetricObservation): ObservationRow {
  return {
    workspace_id: row.workspaceId,
    content_item_id: row.contentItemId ?? null,
    post_variant_id: row.postVariantId ?? null,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    provider_post_id: row.providerPostId,
    platform: row.platform,
    content_type: row.contentType,
    metric_key: row.metricKey,
    value: row.value,
    availability: row.availability,
    granularity: row.granularity,
    window_start: row.windowStart,
    window_end: row.windowEnd,
    captured_at: row.capturedAt,
    provider_data_as_of: row.providerDataAsOf ?? null,
    source_reference: row.sourceReference,
    calculation_version: row.calculationVersion,
    evidence: {},
  };
}

export function rowToObservation(row: ObservationRow): SocialMetricObservation {
  return {
    workspaceId: row.workspace_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    providerPostId: row.provider_post_id,
    platform: row.platform,
    contentType: row.content_type,
    contentItemId: row.content_item_id,
    postVariantId: row.post_variant_id,
    metricKey: row.metric_key,
    value: row.value === null ? null : Number(row.value),
    availability: row.availability,
    granularity: row.granularity,
    windowStart: String(row.window_start).slice(0, 10),
    windowEnd: String(row.window_end).slice(0, 10),
    capturedAt: row.captured_at,
    providerDataAsOf: row.provider_data_as_of,
    sourceReference: row.source_reference,
    calculationVersion: row.calculation_version,
  };
}

export type BackfillStatus = "queued" | "running" | "partial" | "complete" | "failed" | "unsupported";

export function backfillWindow(today: string) {
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (BACKFILL_MAX_DAYS - 1));
  return { start: start.toISOString().slice(0, 10), end: today };
}

/** Next backfill-run state for one account after one fetched page or failure. */
export function nextBackfillRun(input: {
  previous: { attempts?: number; records_stored?: number; covered_range_start?: string | null; last_success_at?: string | null } | null;
  today: string;
  nowIso: string;
  outcome:
    | { kind: "page"; stored: number; oldestDay: string | null; hasMore: boolean }
    | { kind: "failed"; availability: AnalyticsAvailability; safeMessage: string };
}) {
  const window = backfillWindow(input.today);
  const attempts = (input.previous?.attempts ?? 0) + 1;
  if (input.outcome.kind === "failed") {
    const retry = new Date(Date.parse(input.nowIso) + Math.min(24, 2 ** Math.min(attempts, 5)) * 3_600_000);
    return {
      requested_range_start: window.start,
      requested_range_end: window.end,
      status: (input.outcome.availability === "unsupported" ? "unsupported" : "failed") as BackfillStatus,
      safe_message: input.outcome.safeMessage.slice(0, 500),
      attempts,
      last_attempt_at: input.nowIso,
      next_retry_at: retry.toISOString(),
      updated_at: input.nowIso,
    };
  }
  const oldest = [input.outcome.oldestDay, input.previous?.covered_range_start]
    .filter((d): d is string => Boolean(d) && (d as string) >= window.start)
    .sort()[0] ?? null;
  return {
    requested_range_start: window.start,
    requested_range_end: window.end,
    covered_range_start: oldest,
    covered_range_end: window.end,
    status: (input.outcome.hasMore ? "partial" : "complete") as BackfillStatus,
    safe_message: null,
    attempts,
    records_stored: (input.previous?.records_stored ?? 0) + input.outcome.stored,
    last_attempt_at: input.nowIso,
    last_success_at: input.nowIso,
    next_retry_at: null,
    updated_at: input.nowIso,
  };
}
