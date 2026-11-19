import {
  ANALYTICS_METRIC_KEYS,
  type AnalyticsAvailability,
  type AnalyticsMetricKey,
} from "./analytics-transparency.ts";
import type { SocialContentType } from "./social-metrics-contract.ts";

export type MetricCapability = "supported" | "permission_required" | "unsupported" | "unknown";
export type ProviderConnectionState = "active" | "expired";
export type ProviderPermissionState = "granted" | "missing" | "unknown";
export type ProviderFetchState = "not_requested" | "success" | "failed";

export const SOCIAL_CAPABILITY_MATRIX_VERSION = "waveos-social-capabilities-v1";

type CapabilityMatrix = Record<
  string,
  Partial<Record<SocialContentType, Partial<Record<AnalyticsMetricKey, MetricCapability>>>>
>;

/**
 * The matrix starts conservative. Provider/platform claims are promoted only
 * after the adapter contract and a real response confirm support.
 */
export const SOCIAL_PROVIDER_CAPABILITIES: CapabilityMatrix = {};

export function declaredMetricCapability(input: {
  platform: string;
  contentType: SocialContentType;
  metricKey: AnalyticsMetricKey;
}) {
  return (
    SOCIAL_PROVIDER_CAPABILITIES[input.platform.toLowerCase()]?.[input.contentType]?.[
      input.metricKey
    ] ?? "unknown"
  );
}

export function emptyMetricCapabilities(): Record<AnalyticsMetricKey, MetricCapability> {
  return Object.fromEntries(ANALYTICS_METRIC_KEYS.map((key) => [key, "unknown"])) as Record<
    AnalyticsMetricKey,
    MetricCapability
  >;
}

export function resolveMetricAvailability(input: {
  capability: MetricCapability;
  connection: ProviderConnectionState;
  permission: ProviderPermissionState;
  fetch: ProviderFetchState;
  value: number | null | undefined;
}): AnalyticsAvailability {
  if (input.connection === "expired") return "connection_expired";
  if (input.capability === "unsupported") return "unsupported";
  if (input.capability === "permission_required" && input.permission === "missing") {
    return "permission_missing";
  }
  if (input.fetch === "failed") return "sync_failed";
  if (input.fetch === "not_requested") return "not_synced";
  if (input.value === null || input.value === undefined) return "not_synced";
  if (!Number.isFinite(input.value) || input.value < 0) return "sync_failed";
  return input.value === 0 ? "true_zero" : "available";
}
