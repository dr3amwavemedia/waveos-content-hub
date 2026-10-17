export interface ProductRelease {
  id: string;
  version: string;
  title: string;
  summary: string;
  body: string;
  published_at: string;
  target_data_sources: string[];
  target_public_plans: string[];
  target_client_tiers: string[];
  target_workspace_roles: string[];
  link_url: string | null;
}

export interface ReleaseAudience {
  dataSource: "client_data" | "os_data";
  publicPlan: "trial" | "standard" | "full" | "expanded" | null;
  clientTier: string;
  workspaceRole: string;
  isStaff: boolean;
}

export function releaseMatchesAudience(release: ProductRelease, audience: ReleaseAudience) {
  if (audience.isStaff) return true;
  if (
    release.target_data_sources.length > 0 &&
    !release.target_data_sources.includes(audience.dataSource)
  ) {
    return false;
  }
  if (
    audience.dataSource === "os_data" &&
    release.target_public_plans.length > 0 &&
    (!audience.publicPlan || !release.target_public_plans.includes(audience.publicPlan))
  ) {
    return false;
  }
  if (
    audience.dataSource === "client_data" &&
    release.target_client_tiers.length > 0 &&
    !release.target_client_tiers.includes(audience.clientTier)
  ) {
    return false;
  }
  if (
    release.target_workspace_roles.length > 0 &&
    !release.target_workspace_roles.includes(audience.workspaceRole)
  ) {
    return false;
  }
  return true;
}

export function safeReleaseLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface ReleaseSeenState {
  viewed_at: string | null;
  dismissed_at: string | null;
  acknowledged_at: string | null;
}

/**
 * One-time "New Update" popup: only WaveOS SaaS (os_data) workspaces, and only a
 * release this user has no stored state for. Any stored row (viewed, dismissed or
 * acknowledged) permanently suppresses auto-show for that user + release.
 */
export function pickOneTimeUpdate<T extends { state: ReleaseSeenState | null }>(
  releases: T[],
  dataSource: string | null | undefined,
): T | null {
  if (dataSource !== "os_data") return null;
  return releases.find((release) => !release.state) ?? null;
}
