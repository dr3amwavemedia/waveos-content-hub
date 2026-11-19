import type { AnalyticsAvailability, AnalyticsMetricKey } from "./analytics-transparency.ts";
import type { SocialContentType } from "./social-metrics-contract.ts";

export type CapabilitySupport = "supported" | "supported_with_permission" | "not_supported";
export const CAPABILITY_MATRIX_VERSION = "waveos-capabilities-v1-conservative";
export const MAX_HISTORY_DAYS = 365;

type Matrix = Partial<Record<string, Partial<Record<SocialContentType, Partial<Record<AnalyticsMetricKey, CapabilitySupport>>>>>>;

const IG_FEED = { impressions: "supported", reach: "supported", likes: "supported", comments: "supported", shares: "supported", saves: "supported", views: "supported" } as const;

/** Conservative: anything not listed is not claimed (treated as unsupported). Confirm in Phase 3 against real responses. */
const MATRIX: Matrix = {
  instagram: {
    post: IG_FEED,
    carousel: IG_FEED,
    reel: { ...IG_FEED },
    story: { reach: "supported", views: "supported", storyViews: "supported", shares: "supported", messages: "supported_with_permission" },
  },
  facebook: {
    post: { impressions: "supported", reach: "supported", likes: "supported", comments: "supported", shares: "supported", clicks: "supported" },
    video: { views: "supported", reach: "supported", likes: "supported", comments: "supported", shares: "supported" },
    reel: { views: "supported", likes: "supported", comments: "supported", shares: "supported" },
  },
  tiktok: { video: { views: "supported", likes: "supported", comments: "supported", shares: "supported" } },
  youtube: {
    video: { views: "supported", likes: "supported", comments: "supported" },
    short: { views: "supported", likes: "supported", comments: "supported" },
  },
  linkedin: { post: { impressions: "supported", likes: "supported", comments: "supported", shares: "supported", clicks: "supported" } },
};

export function metricSupport(platform: string, contentType: SocialContentType, metric: AnalyticsMetricKey): CapabilitySupport {
  return MATRIX[platform.toLowerCase()]?.[contentType]?.[metric] ?? "not_supported";
}

export type FetchState = "not_fetched" | "fetched" | "failed" | "connection_expired" | "permission_missing";

/** Order matters: unsupported never becomes zero; failures never become zero; only a supported, fetched 0 is a true zero. */
export function resolveMetricAvailability(input: {
  platform: string;
  contentType: SocialContentType;
  metric: AnalyticsMetricKey;
  fetchState: FetchState;
  value: number | null | undefined;
}): { value: number | null; availability: AnalyticsAvailability } {
  if (metricSupport(input.platform, input.contentType, input.metric) === "not_supported")
    return { value: null, availability: "unsupported" };
  if (input.fetchState === "connection_expired") return { value: null, availability: "connection_expired" };
  if (input.fetchState === "permission_missing") return { value: null, availability: "permission_missing" };
  if (input.fetchState === "failed") return { value: null, availability: "sync_failed" };
  if (input.fetchState === "not_fetched") return { value: null, availability: "not_synced" };
  const value = typeof input.value === "number" && Number.isFinite(input.value) ? input.value : null;
  if (value === null) return { value: null, availability: "not_synced" };
  return { value, availability: value === 0 ? "true_zero" : "available" };
}
