// WaveOS access permissions — single source of truth on the client.
// The server enforces the SAME rules via `public.has_feature(workspace_id, feature)`.
// Anything checked here MUST also be enforced server-side; do not rely on this
// module for security, only for UX.

export type ClientAccessTier = "project_client" | "growth_90" | "retainer_full";
export type AccountStatus = "pending" | "active" | "suspended" | "expired" | "archived";
export type AgreementTerm = "one_time" | "90_day" | "6_month" | "12_month";

export type FeatureKey =
  // Universal
  | "can_view_profile"
  | "can_edit_profile"
  | "can_view_invoices"
  | "can_view_deliveries"
  | "can_contact_support"
  // Layer 2+
  | "can_review_content"
  | "can_request_changes"
  | "can_manage_brand_voice"
  | "can_view_calendar_preview"
  // Layer 3
  | "can_view_media_library"
  | "can_upload_media"
  | "can_create_content"
  | "can_use_ai_tools"
  | "can_connect_socials"
  | "can_schedule_content"
  | "can_publish_content"
  | "can_view_analytics"
  | "can_view_activity_log"
  | "can_invite_members"
  | "can_manage_workspace";

export interface WorkspaceAccess {
  tier: ClientAccessTier;
  status: AccountStatus;
  expiresAt: string | null;
  overrides: Partial<Record<FeatureKey, boolean>>;
}

const PROJECT_CLIENT_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "can_view_profile",
  "can_edit_profile",
  "can_view_invoices",
  "can_view_deliveries",
  "can_contact_support",
]);

const GROWTH_90_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  ...PROJECT_CLIENT_FEATURES,
  "can_review_content",
  "can_request_changes",
  "can_manage_brand_voice",
  "can_view_calendar_preview",
]);

// Retainer gets everything by default.
export function hasFeature(access: WorkspaceAccess, feature: FeatureKey): boolean {
  // Explicit override always wins.
  const override = access.overrides?.[feature];
  if (typeof override === "boolean") return override;

  // Suspended / archived → read-own only.
  if (access.status === "suspended" || access.status === "archived") {
    return (
      feature === "can_view_deliveries" ||
      feature === "can_view_invoices" ||
      feature === "can_view_profile"
    );
  }

  // Expired accounts (either explicit status or date passed) fall back to project_client.
  const dateExpired = access.expiresAt ? new Date(access.expiresAt).getTime() < Date.now() : false;
  if (access.status === "expired" || dateExpired) {
    return PROJECT_CLIENT_FEATURES.has(feature);
  }

  switch (access.tier) {
    case "project_client":
      return PROJECT_CLIENT_FEATURES.has(feature);
    case "growth_90":
      return GROWTH_90_FEATURES.has(feature);
    case "retainer_full":
      return true;
  }
}

// A feature can be shown in "preview / locked" mode to a client. Preview is used
// when the module should visually appear (Layer 2 sees the full product) but the
// user cannot actually operate it. Fully hidden = never in navigation.
export function featureVisibility(
  access: WorkspaceAccess,
  feature: FeatureKey,
): "enabled" | "preview" | "hidden" {
  if (hasFeature(access, feature)) return "enabled";
  // Layer 2 (growth_90) sees premium modules as previews to demonstrate value.
  if (access.tier === "growth_90") return "preview";
  return "hidden";
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export const TIER_LABELS: Record<ClientAccessTier, string> = {
  project_client: "Project Client",
  growth_90: "90-Day Growth",
  retainer_full: "Full Retainer",
};

export const TERM_LABELS: Record<AgreementTerm, string> = {
  one_time: "One-Time Project",
  "90_day": "90-Day Agreement",
  "6_month": "6-Month Retainer",
  "12_month": "12-Month Retainer",
};

export const STATUS_LABELS: Record<AccountStatus, string> = {
  pending: "Pending Activation",
  active: "Active",
  suspended: "Suspended",
  expired: "Access Expired",
  archived: "Archived",
};
