import type { AnalyticsAvailability, AnalyticsMetricKey } from "./analytics-transparency.ts";

export const SOCIAL_CONTENT_TYPES = ["post", "reel", "story", "video", "carousel", "short"] as const;
export type SocialContentType = (typeof SOCIAL_CONTENT_TYPES)[number];
export type MetricGranularity = "lifetime" | "daily";

/** Lead actions are provider-reported interactions, never people or confirmed leads. */
export const LEAD_ACTION_METRICS = ["clicks", "messages"] as const satisfies readonly AnalyticsMetricKey[];

export type PostCopyIdentity = {
  workspaceId: string;
  platform: string;
  providerAccountId: string;
  providerPostId: string;
};

export type SocialPostMetricObservation = PostCopyIdentity & {
  provider: string;
  contentType: SocialContentType;
  contentItemId?: string | null;
  postVariantId?: string | null;
  metricKey: AnalyticsMetricKey;
  value: number | null;
  availability: AnalyticsAvailability;
  granularity: MetricGranularity;
  windowStart: string;
  windowEnd: string;
  sourceReference: string;
  calculationVersion: string;
  capturedAt: string;
  providerDataAsOf?: string | null;
};

export type LeadActionTotal = {
  kind: "lead_actions";
  value: number | null;
  availability: AnalyticsAvailability;
  countsPeople: false;
};

export type ConfirmedLead = {
  kind: "confirmed_lead";
  workspaceId: string;
  dedupeKey: string;
  source: "manual" | "crm" | "form";
  attributedPost?: PostCopyIdentity | null;
  confirmedBy: string;
  confirmedAt: string;
};

function part(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) throw new Error("Post identity parts are required");
  return encodeURIComponent(trimmed);
}

export function postCopyKey(identity: PostCopyIdentity) {
  return [identity.workspaceId, identity.platform.toLowerCase(), identity.providerAccountId, identity.providerPostId]
    .map(part)
    .join("|");
}

export function observationKey(row: SocialPostMetricObservation) {
  return [postCopyKey(row), row.metricKey, row.granularity, row.windowStart, row.windowEnd].map(String).join("|");
}

/** Normalized dedupe key for confirmed leads: CRM contact id wins, else email, else phone digits. */
export function confirmedLeadDedupeKey(input: { crmContactId?: string | null; email?: string | null; phone?: string | null }) {
  if (input.crmContactId?.trim()) return `crm:${input.crmContactId.trim()}`;
  const email = input.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = input.phone?.replace(/\D/g, "");
  if (phone && phone.length >= 7) return `phone:${phone}`;
  return null;
}
