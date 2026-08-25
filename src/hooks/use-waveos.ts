import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActingStaff } from "@/hooks/use-acting-staff";
import { useImpersonateClient } from "@/hooks/use-impersonation";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  timezone: string;
  is_demo: boolean;
  access_tier: "project_client" | "growth_90" | "retainer_full" | "social_management" | "wedding_client";
  approval_required: boolean;
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
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name,last_name,avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    db.from("user_roles").select("role,staff_type").eq("user_id", user.id),
  ]);
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
  };
}

async function loadWorkspaces(
  ctx: CurrentUserContext,
  previewWorkspaceId: string | null,
): Promise<WorkspaceSummary[]> {
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", ctx.userId);

  const membershipMap = new Map((memberships ?? []).map((m) => [m.workspace_id, m.role]));

  const workspaceIds = previewWorkspaceId
    ? [previewWorkspaceId]
    : ctx.isDreamWaveOwner
      ? [STAFF_WORKSPACE_ID]
      : ctx.isStaff && ctx.staffType !== "media_manager"
        ? [STAFF_WORKSPACE_ID]
        : Array.from(membershipMap.keys());

  if (!workspaceIds.length && ctx.staffType !== "media_manager") return [];

  let workspacesQuery = supabase
    .from("workspaces")
    .select("id,name,slug,industry,timezone,is_demo,access_tier,feature_overrides")
    .eq("is_archived", false)
    .order("name", { ascending: true });

  if (ctx.staffType !== "media_manager" || previewWorkspaceId) {
    workspacesQuery = workspacesQuery.in("id", workspaceIds);
  }

  const { data: workspaces, error } = await workspacesQuery;
  if (error) throw error;

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
            workspace.access_tier === "social_management" ||
            overrides.social_management_access === true
          );
        })
      : (workspaces ?? []);

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
      industry: w.industry,
      timezone: w.timezone,
      is_demo: w.is_demo,
      access_tier:
        featureOverrides.social_management_access === true ? "social_management" : w.access_tier,
      approval_required: featureOverrides.automatic_content_approval !== true,
      role: (previewWorkspaceId
        ? "viewer"
        : w.id === STAFF_WORKSPACE_ID && ctx.isStaff
          ? "staff"
          : (role ?? "viewer")) as "owner" | "admin" | "editor" | "approver" | "viewer" | "staff",
    };
  });
}

export function useCurrentUser() {
  const impersonate = useImpersonateClient();
  const activeWorkspaceId =
    typeof window !== "undefined" ? localStorage.getItem("waveos.active-workspace") : null;
  const viewingClientWorkspace =
    impersonate.on || (!!activeWorkspaceId && activeWorkspaceId !== STAFF_WORKSPACE_ID);

  const query = useQuery({
    queryKey: [
      "waveos",
      "current-user",
      viewingClientWorkspace ? "client" : "staff",
      activeWorkspaceId,
    ],
    queryFn: loadContext,
    staleTime: 60_000,
  });

  if (!viewingClientWorkspace || !query.data) return query;

  return {
    ...query,
    data: {
      ...query.data,
      isStaff: false,
      isDreamWaveOwner: false,
      staffType: null,
    },
  };
}

export function useWorkspaces() {
  const { data: user } = useCurrentUser();
  const impersonate = useImpersonateClient();
  // Client preview intentionally masks isStaff so the UI follows the same
  // navigation path as a client. Authorize preview from the verified database
  // roles retained in the user context instead of that presentation flag.
  const canPreviewClients =
    user?.roles.includes("dream_wave_owner") === true ||
    user?.roles.includes("dream_wave_team") === true;
  const previewWorkspaceId =
    typeof window !== "undefined" && canPreviewClients && impersonate.on
      ? localStorage.getItem("waveos.active-workspace")
      : null;

  return useQuery({
    queryKey: ["waveos", "workspaces", user?.userId, previewWorkspaceId],
    queryFn: () => loadWorkspaces(user!, previewWorkspaceId),
    enabled: !!user,
    staleTime: 30_000,
  });
}
