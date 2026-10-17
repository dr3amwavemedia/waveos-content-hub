export const ANALYTICS_METRIC_KEYS = [
  "followers",
  "impressions",
  "reach",
  "likes",
  "comments",
  "shares",
  "saves",
  "clicks",
  "views",
  "storyViews",
] as const;

export type AnalyticsMetricKey = (typeof ANALYTICS_METRIC_KEYS)[number];
export type AnalyticsAvailability =
  | "available"
  | "true_zero"
  | "not_synced"
  | "permission_missing"
  | "connection_expired"
  | "sync_failed"
  | "unsupported";
export type AnalyticsSourceKey = "organic" | "external" | "paid";

export type AnalyticsMetric = {
  value: number | null;
  availability: AnalyticsAvailability;
};

export type AnalyticsSource = {
  key: AnalyticsSourceKey;
  label: string;
  provider: string;
  availability: AnalyticsAvailability;
  metrics: Record<AnalyticsMetricKey, AnalyticsMetric>;
  requestedRangeStart: string;
  requestedRangeEnd: string;
  availableRangeStart: string | null;
  availableRangeEnd: string | null;
  recordCount: number;
  sourceReference: string;
  calculationVersion: string;
  safeMessage: string | null;
};

export type CombinedMetric = AnalyticsMetric & {
  coverage: "complete" | "partial" | "unavailable";
  contributingSources: number;
  expectedSources: number;
};

const METRIC_ALIASES: Record<AnalyticsMetricKey, readonly string[]> = {
  followers: ["followers", "follower_count", "followerCount"],
  impressions: ["impressions", "impression_count", "impressionCount"],
  reach: ["reach", "accounts_reached", "accountsReached"],
  likes: ["likes", "like_count", "likeCount"],
  comments: ["comments", "comment_count", "commentCount"],
  shares: ["shares", "share_count", "shareCount"],
  saves: ["saves", "save_count", "saveCount"],
  clicks: ["clicks", "click_count", "clickCount", "link_clicks", "linkClicks"],
  views: ["views", "view_count", "viewCount", "video_views", "videoViews"],
  storyViews: ["storyViews", "story_views"],
};

const SOURCE_LABELS: Record<AnalyticsSourceKey, string> = {
  organic: "Published content",
  external: "Connected network data",
  paid: "Paid media",
};

const SOURCE_REFERENCES: Record<AnalyticsSourceKey, string> = {
  organic: "publishing-provider analytics source=late",
  external: "publishing-provider analytics source=external",
  paid: "publishing-provider ads endpoint",
};

export const ANALYTICS_CALCULATION_VERSION = "waveos-provider-post-records-v2";

function emptyMetrics(
  availability: Exclude<AnalyticsAvailability, "available" | "true_zero">,
): Record<AnalyticsMetricKey, AnalyticsMetric> {
  return Object.fromEntries(
    ANALYTICS_METRIC_KEYS.map((key) => [key, { value: null, availability }]),
  ) as Record<AnalyticsMetricKey, AnalyticsMetric>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numericMetric(row: Record<string, unknown>, key: AnalyticsMetricKey) {
  for (const alias of METRIC_ALIASES[key]) {
    if (!(alias in row)) continue;
    const raw = row[alias];
    if (raw === null || raw === "" || typeof raw === "boolean") continue;
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function hasMetric(row: Record<string, unknown>) {
  return ANALYTICS_METRIC_KEYS.some((key) => numericMetric(row, key) !== null);
}

/**
 * Selects one documented response level. This intentionally avoids recursive
 * traversal, which can count the same rollup and child records more than once.
 */
function metricRows(payload: Record<string, unknown>) {
  // Zernio overview contains counts, not metrics. Read one per-post rollup;
  // platforms[].analytics repeats that rollup and must not be added again.
  if(Array.isArray(payload.posts)) return payload.posts.flatMap(item=>{
    const post=record(item);if(!post)return [];
    const analytics=record(post.analytics);return analytics && hasMetric(analytics)?[analytics]:hasMetric(post)?[post]:[];
  });
  if(Array.isArray(payload.ads)) return payload.ads.flatMap(item=>{
    const ad=record(item);if(!ad)return [];
    const metrics=record(ad.metrics);return metrics && hasMetric(metrics)?[metrics]:[];
  });
  const preferred = [
    payload.analytics,
    payload.overview,
    payload.data,
    payload.posts,
    payload,
  ].find((value) => value !== undefined && value !== null);
  if (Array.isArray(preferred))
    return preferred.map(record).filter(Boolean) as Record<string, unknown>[];
  const container = record(preferred);
  if (!container) return [];
  if (hasMetric(container)) return [container];

  const directArray = Object.values(container).find(Array.isArray);
  if (directArray) {
    return directArray.map(record).filter(Boolean) as Record<string, unknown>[];
  }
  return Object.values(container)
    .map(record)
    .filter((row): row is Record<string, unknown> => Boolean(row && hasMetric(row)));
}

function dateValue(payload: Record<string, unknown>, names: readonly string[]) {
  for (const name of names) {
    const value = payload[name];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
  }
  return null;
}

export function unavailableAnalyticsSource(input: {
  key: AnalyticsSourceKey;
  provider?: string;
  availability: Exclude<AnalyticsAvailability, "available" | "true_zero">;
  requestedRangeStart: string;
  requestedRangeEnd: string;
  safeMessage?: string | null;
}): AnalyticsSource {
  return {
    key: input.key,
    label: SOURCE_LABELS[input.key],
    provider: input.provider ?? "publishing-provider",
    availability: input.availability,
    metrics: emptyMetrics(input.availability),
    requestedRangeStart: input.requestedRangeStart,
    requestedRangeEnd: input.requestedRangeEnd,
    availableRangeStart: null,
    availableRangeEnd: null,
    recordCount: 0,
    sourceReference: SOURCE_REFERENCES[input.key],
    calculationVersion: ANALYTICS_CALCULATION_VERSION,
    safeMessage: input.safeMessage ?? null,
  };
}

export function parseAnalyticsPayload(input: {
  key: AnalyticsSourceKey;
  payload: Record<string, unknown>;
  requestedRangeStart: string;
  requestedRangeEnd: string;
  provider?: string;
}): AnalyticsSource {
  const rows = metricRows(input.payload);
  const metrics = Object.fromEntries(
    ANALYTICS_METRIC_KEYS.map((key) => {
      const values = rows
        .map((row) => numericMetric(row, key))
        .filter((value): value is number => value !== null);
      if (!values.length) return [key, { value: null, availability: "not_synced" as const }];
      const value = values.reduce((sum, current) => sum + current, 0);
      return [
        key,
        { value, availability: value === 0 ? ("true_zero" as const) : ("available" as const) },
      ];
    }),
  ) as Record<AnalyticsMetricKey, AnalyticsMetric>;
  // Account follower totals are an inventory, not per-post metrics. Include
  // once in the network source so Combined cannot double-count accounts.
  if(input.key === "external" && Array.isArray(input.payload.accounts)) {
    const seen=new Set<string>();
    const followers=input.payload.accounts.flatMap(item=>{const account=record(item);if(!account)return [];const id=String(account._id??account.id??"");if(!id||seen.has(id))return [];seen.add(id);const value=numericMetric({...account,followers:account.followersCount},"followers");return value===null?[]:[value];});
    if(followers.length){const value=followers.reduce((sum,current)=>sum+current,0);metrics.followers={value,availability:value===0?"true_zero":"available"};}
  }
  const availableMetrics = Object.values(metrics).filter((metric) => metric.value !== null);

  if (!availableMetrics.length) {
    return unavailableAnalyticsSource({
      key: input.key,
      provider: input.provider,
      availability: "not_synced",
      requestedRangeStart: input.requestedRangeStart,
      requestedRangeEnd: input.requestedRangeEnd,
      safeMessage: "The provider response did not include recognized numeric metrics.",
    });
  }

  return {
    key: input.key,
    label: SOURCE_LABELS[input.key],
    provider: input.provider ?? "publishing-provider",
    availability: availableMetrics.some((metric) => metric.availability === "available")
      ? "available"
      : "true_zero",
    metrics,
    requestedRangeStart: input.requestedRangeStart,
    requestedRangeEnd: input.requestedRangeEnd,
    availableRangeStart: dateValue(input.payload, [
      "availableRangeStart",
      "rangeStart",
      "fromDate",
      "startDate",
    ]),
    availableRangeEnd: dateValue(input.payload, [
      "availableRangeEnd",
      "rangeEnd",
      "toDate",
      "endDate",
    ]),
    recordCount: rows.filter(hasMetric).length,
    sourceReference: SOURCE_REFERENCES[input.key],
    calculationVersion: ANALYTICS_CALCULATION_VERSION,
    safeMessage: null,
  };
}

export function classifyAnalyticsError(reason: unknown): {
  availability: Exclude<AnalyticsAvailability, "available" | "true_zero">;
  safeMessage: string;
} {
  const error = reason as { status?: number; message?: string };
  const message = String(error?.message ?? "").toLowerCase();
  if (error?.status === 401 || /expired|invalid token|reauthori[sz]/.test(message)) {
    return {
      availability: "connection_expired",
      safeMessage: "The provider connection expired and must be reconnected.",
    };
  }
  if (error?.status === 403 || /permission|scope|forbidden/.test(message)) {
    return {
      availability: "permission_missing",
      safeMessage: "The connected account has not granted access to these metrics.",
    };
  }
  if (
    [400, 404, 405, 501].includes(error?.status ?? 0) ||
    /unsupported|not available/.test(message)
  ) {
    return {
      availability: "unsupported",
      safeMessage: "This metric source is not supported for the connected account.",
    };
  }
  return {
    availability: "sync_failed",
    safeMessage: "The metric source could not be refreshed. No value has been substituted.",
  };
}

export function combineAnalyticsMetric(
  sources: readonly AnalyticsSource[],
  key: AnalyticsMetricKey,
): CombinedMetric {
  const metrics = sources.map((source) => source.metrics[key]);
  const withValues = metrics.filter(
    (metric): metric is AnalyticsMetric & { value: number } => metric.value !== null,
  );
  if (!withValues.length) {
    const unavailable = metrics.find((metric) => metric.availability !== "not_synced");
    return {
      value: null,
      availability: unavailable?.availability ?? "not_synced",
      coverage: "unavailable",
      contributingSources: 0,
      expectedSources: sources.length,
    };
  }
  const value = withValues.reduce((sum, metric) => sum + metric.value, 0);
  return {
    value,
    availability: value === 0 ? "true_zero" : "available",
    coverage: withValues.length === sources.length ? "complete" : "partial",
    contributingSources: withValues.length,
    expectedSources: sources.length,
  };
}

export function deriveEngagements(
  sources: readonly AnalyticsSource[],
): CombinedMetric & { calculationVersion: string } {
  const likes = combineAnalyticsMetric(sources, "likes");
  const comments = combineAnalyticsMetric(sources, "comments");
  const available = [likes, comments].filter(
    (metric): metric is CombinedMetric & { value: number } => metric.value !== null,
  );
  if (!available.length) {
    return {
      value: null,
      availability:
        likes.availability !== "not_synced" ? likes.availability : comments.availability,
      coverage: "unavailable",
      contributingSources: 0,
      expectedSources: sources.length * 2,
      calculationVersion: "waveos-engagements-likes-plus-comments-v1",
    };
  }
  const value = available.reduce((sum, metric) => sum + metric.value, 0);
  return {
    value,
    availability: value === 0 ? "true_zero" : "available",
    coverage:
      likes.coverage === "complete" && comments.coverage === "complete" ? "complete" : "partial",
    contributingSources: likes.contributingSources + comments.contributingSources,
    expectedSources: sources.length * 2,
    calculationVersion: "waveos-engagements-likes-plus-comments-v1",
  };
}
