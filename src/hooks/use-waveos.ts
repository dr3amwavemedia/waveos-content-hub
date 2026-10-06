import { withRequestTimeout } from "@/lib/request-timeout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActingStaff } from "@/hooks/use-acting-staff";
import { useImpersonateClient } from "@/hooks/use-impersonation";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  data_source: "client_data" | "os_data";
  industry: string | null;
  timezone: string;
  is_demo: boolean;
  access_tier:
    "project_client" | "growth_90" | "retainer_full" | "social_management" | "wedding_client";
  approval_required: boolean;
  businessNameOnly?: boolean;
  role: "owner" | "admin" | "editor" | "approver" | "viewer" | "staff";
}

export interface CurrentUserContext {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  isStaff: boolean;
  isDreamWaveOwner: boolean;
  staffType: "sales" | "media_manager" | "crew" | null;
  roles: string[];
  actingAsStaff: boolean;
  actualUserId: string;
  accountSource: "client_data" | "os_data";
  promoCode: string | null;
}

const STAFF_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

async function loadContext(): Promise<CurrentUserContext> {
  const { data: auth, error } = await supabase.auth.getUser();

  if (error || !auth.user) {
    throw new Error("Your session expired. Please sign in again.");
  }

  const user = auth.user;
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("first_name,last_name,avatar_url,account_source")
        .eq("id", user.id)
        .maybeSingle(),
      db.from("user_roles").select("role,staff_type").eq("user_id", user.id),
    ]);
  if (profileError) throw profileError;
  if (rolesError) throw rolesError;
  const roleRows = (roles ?? []) as Array<{
    role: string;
    staff_type: "sales" | "media_manager" | "crew" | null;
  }>;
  const roleList = roleRows.map((role) => role.role);
  const actualOwner = roleList.includes("dream_wave_owner");
  const acting = actualOwner ? getActingStaff() : null;

  if (acting) {
    return {
      userId: acting.userId,
      email: acting.email,
      firstName: acting.firstName,
      lastName: acting.lastName,
      avatarUrl: null,
      isStaff: true,
      isDreamWaveOwner: false,
      staffType: acting.staffType ?? "sales",
      roles: ["dream_wave_team"],
      actingAsStaff: true,
      actualUserId: user.id,
      accountSource: "client_data",
      promoCode: null,
    };
  }

  const teamRole = roleRows.find((role) => role.role === "dream_wave_team");
  return {
    userId: user.id,
    email: user.email ?? "",
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    isStaff: roleList.includes("dream_wave_owner") || roleList.includes("dream_wave_team"),
    isDreamWaveOwner: actualOwner,
    // Only staff accounts have a staff subtype. Previously the fallback to
    // "sales" also applied to clients with no dream_wave_team row, which made
    // client-facing UI identify them as Sales Staff.
    staffType: actualOwner
      ? null
      : teamRole
        ? ((teamRole.staff_type as "sales" | "media_manager" | "crew" | null) ?? "sales")
        : null,
    roles: roleList,
    actingAsStaff: false,
    actualUserId: user.id,
    accountSource: profile?.account_source === "os_data" ? "os_data" : "client_data",
    promoCode:
      typeof user.user_metadata?.promo_code === "string" ? user.user_metadata.promo_code : null,
  };
}

async function loadWorkspaces(
  ctx: CurrentUserContext,
  previewWorkspaceId: string | null,
  previewRole: WorkspaceSummary["role"] = "admin",
): Promise<WorkspaceSummary[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", ctx.userId);

  if (membershipError) throw membershipError;
  const membershipMap = new Map((memberships ?? []).map((m) => [m.workspace_id, m.role]));

  // Staff always keep the shared Dream Wave staff workspace, plus any
  // workspaces they personally belong to (e.g. their own personal workspace).
  const ownIds = Array.from(membershipMap.keys());
  const workspaceIds = previewWorkspaceId
    ? [previewWorkspaceId]
    : ctx.isDreamWaveOwner
      ? [STAFF_WORKSPACE_ID, ...ownIds]
      : ctx.isStaff && ctx.staffType !== "media_manager"
        ? [STAFF_WORKSPACE_ID, ...ownIds]
        : ownIds;

  if (!workspaceIds.length && ctx.staffType !== "media_manager") return [];

  let workspacesQuery = supabase
    .from("workspaces")
    .select("id,name,slug,data_source,industry,timezone,is_demo,access_tier,feature_overrides")
    .eq("is_archived", false)
    .order("name", { ascending: true });

  if (ctx.staffType !== "media_manager" || previewWorkspaceId) {
    workspacesQuery = workspacesQuery.in("id", workspaceIds);
  }

  const { data: workspaces, error } = await workspacesQuery;
  if (error) throw error;

  let subscribedWorkspaceIds = new Set<string>();
  if (ctx.staffType === "media_manager" && !previewWorkspaceId) {
    const { data: subscriptions, error: subscriptionsError } = await db
      .from("workspace_social_subscriptions")
      .select("workspace_id,status,trial_ends_at")
      .in("status", ["active", "trialing"]);
    if (subscriptionsError) throw subscriptionsError;
    const now = Date.now();
    subscribedWorkspaceIds = new Set(
      (subscriptions ?? [])
        .filter(
          (subscription: { status: string; trial_ends_at: string | null }) =>
            subscription.status === "active" ||
            (subscription.status === "trialing" &&
              Boolean(subscription.trial_ends_at) &&
              new Date(subscription.trial_ends_at!).getTime() > now),
        )
        .map((subscription: { workspace_id: string }) => subscription.workspace_id),
    );
  }

  const visibleWorkspaces =
    ctx.staffType === "media_manager" && !previewWorkspaceId
      ? (workspaces ?? []).filter((workspace) => {
          const overrides =
            workspace.feature_overrides &&
            typeof workspace.feature_overrides === "object" &&
            !Array.isArray(workspace.feature_overrides)
              ? (workspace.feature_overrides as Record<string, unknown>)
              : {};
          return (
            workspace.id === STAFF_WORKSPACE_ID ||
            membershipMap.has(workspace.id) ||
            workspace.access_tier === "social_management" ||
            subscribedWorkspaceIds.has(workspace.id) ||
            overrides.social_management_access === true
          );
        })
      : (workspaces ?? []);

  // Every staff identity starts in the shared Dream Wave workspace. A client
  // membership must never silently become a staff member's default workspace.
  const rank = (id: string) => {
    if (ctx.isStaff) return id === STAFF_WORKSPACE_ID ? 0 : 1;
    return membershipMap.get(id) === "owner" ? 0 : 1;
  };
  visibleWorkspaces.sort((a, b) => rank(a.id) - rank(b.id));

  return visibleWorkspaces.map((w) => {
    const role = membershipMap.get(w.id);
    const featureOverrides =
      w.feature_overrides &&
      typeof w.feature_overrides === "object" &&
      !Array.isArray(w.feature_overrides)
        ? (w.feature_overrides as Record<string, unknown>)
        : {};
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      data_source: w.data_source === "os_data" ? "os_data" : "client_data",
      industry: w.industry,
      timezone: w.timezone,
      is_demo: w.is_demo,
      access_tier:
        featureOverrides.social_management_access === true ? "social_management" : w.access_tier,
      businessNameOnly: featureOverrides.business_name_only === true,
      approval_required: featureOverrides.automatic_content_approval !== true,
      role: (previewWorkspaceId
        ? previewRole
        : w.id === STAFF_WORKSPACE_ID && ctx.isStaff
          ? "staff"
          : (role ?? "viewer")) as "owner" | "admin" | "editor" | "approver" | "viewer" | "staff",
    };
  });
}

/** Real authenticated identity, even while the UI is previewing a client. */
export function useActualCurrentUser() {
  return useQuery({
    queryKey: ["waveos", "current-user"],
    queryFn: () => withRequestTimeout(loadContext()),
    staleTime: 60_000,
  });
}

export function useCurrentUser() {
  const impersonate = useImpersonateClient();
  const query = useActualCurrentUser();

  // Only explicit "View as client" preview masks staff identity. Simply
  // switching the active workspace must NOT strip staff flags — doing so made
  // loadWorkspaces fall back to membership rows (which staff don't have) and
  // wiped the workspace list until sign-out.
  if (!impersonate.on || !query.data) return query;

  const [firstName, ...lastNameParts] = (impersonate.name ?? "").trim().split(/\s+/);

  return {
    ...query,
    data: {
      ...query.data,
      email: impersonate.email ?? query.data.email,
      firstName: firstName || query.data.firstName,
      lastName: lastNameParts.join(" ") || query.data.lastName,
      isStaff: false,
      isDreamWaveOwner: false,
      staffType: null,
    },
  };
}

export function useWorkspaces() {
  // Always load workspaces from the unmasked context so staff keep their
  // workspace pool while previewing a client.
  const { data: user } = useActualCurrentUser();
  const impersonate = useImpersonateClient();
  const canPreviewClients =
    user?.roles.includes("dream_wave_owner") === true ||
    user?.roles.includes("dream_wave_team") === true;
  const previewWorkspaceId =
    typeof window !== "undefined" && canPreviewClients && impersonate.on
      ? localStorage.getItem("waveos.active-workspace")
      : null;

  return useQuery({
    queryKey: ["waveos", "workspaces", user?.userId, previewWorkspaceId, impersonate.role],
    queryFn: () => withRequestTimeout(loadWorkspaces(user!, previewWorkspaceId, impersonate.role)),
    enabled: !!user,
    staleTime: 30_000,
  });
}
