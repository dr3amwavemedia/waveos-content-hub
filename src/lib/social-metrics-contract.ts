import type { AnalyticsAvailability, AnalyticsMetricKey } from "./analytics-transparency.ts";

export const SOCIAL_ANALYTICS_RANGES = [7, 30, 90, 180, 365] as const;

export type SocialAnalyticsRangeDays = (typeof SOCIAL_ANALYTICS_RANGES)[number];
export type SocialContentType = "post" | "reel" | "story" | "video" | "carousel" | "short";
export type SocialMetricGranularity = "daily" | "lifetime";

export type SocialPostCopy = {
  workspaceId: string;
  provider: string;
  providerAccountId: string;
  providerPostId: string;
  platform: string;
  contentType: SocialContentType;
  contentItemId?: string | null;
  postVariantId?: string | null;
};

export type SocialMetricObservation = SocialPostCopy & {
  metricKey: AnalyticsMetricKey;
  value: number | null;
  availability: AnalyticsAvailability;
  granularity: SocialMetricGranularity;
  windowStart: string;
  windowEnd: string;
  capturedAt: string;
  providerDataAsOf?: string | null;
  sourceReference: string;
  calculationVersion: string;
};

export type SocialLeadAction = {
  kind: "click" | "message_start";
  postCopyKey: string;
  value: number;
  observedAt: string;
  sourceReference: string;
};

export type ConfirmedSocialLead = {
  workspaceId: string;
  dedupeKey: string;
  source: "manual" | "crm" | "form";
  confirmedAt: string;
  providerPostId?: string | null;
  crmContactId?: string | null;
};

function identityPart(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) throw new Error(`${label} is required for social metric attribution.`);
  return encodeURIComponent(normalized);
}

/** Identifies one published copy. Cross-posted platform/account copies remain separate. */
export function socialPostCopyKey(copy: SocialPostCopy) {
  return [
    identityPart(copy.workspaceId, "Workspace"),
    identityPart(copy.provider, "Provider"),
    identityPart(copy.platform, "Platform"),
    identityPart(copy.providerAccountId, "Provider account"),
    identityPart(copy.providerPostId, "Provider post"),
  ].join("::");
}

/** Idempotency key for one provider metric window; capture time is intentionally excluded. */
export function socialMetricObservationKey(observation: SocialMetricObservation) {
  return [
    socialPostCopyKey(observation),
    identityPart(observation.metricKey, "Metric"),
    identityPart(observation.granularity, "Granularity"),
    identityPart(observation.windowStart, "Window start"),
    identityPart(observation.windowEnd, "Window end"),
  ].join("::");
}

export function socialAnalyticsRangeStart(endDate: string, days: SocialAnalyticsRangeDays) {
  const end = new Date(`${endDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(end.getTime())) throw new Error("A valid analytics end date is required.");
  end.setUTCDate(end.getUTCDate() - days + 1);
  return end.toISOString().slice(0, 10);
}

export function countLeadActions(actions: readonly SocialLeadAction[]) {
  return actions.reduce((total, action) => total + Math.max(0, action.value), 0);
}

export function countConfirmedLeads(leads: readonly ConfirmedSocialLead[]) {
  return new Set(leads.map((lead) => `${lead.workspaceId}::${lead.dedupeKey}`)).size;
}
