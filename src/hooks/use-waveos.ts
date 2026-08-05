import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonateClient } from "@/hooks/use-impersonation";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  timezone: string;
  is_demo: boolean;
  role: "owner" | "approver" | "viewer" | "staff";
}

export interface CurrentUserContext {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  isStaff: boolean;
  isDreamWaveOwner: boolean;
  staffType: "sales" | "media_manager" | null;
  roles: string[];
}

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
    staff_type: "sales" | "media_manager" | null;
  }>;
  const roleList = roleRows.map((role) => role.role);
  const teamRole = roleRows.find((role) => role.role === "dream_wave_team");
  return {
    userId: user.id,
    email: user.email ?? "",
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    isStaff: roleList.includes("dream_wave_owner") || roleList.includes("dream_wave_team"),
    isDreamWaveOwner: roleList.includes("dream_wave_owner"),
    staffType: roleList.includes("dream_wave_owner")
      ? null
      : ((teamRole?.staff_type as "sales" | "media_manager" | null) ?? "sales"),
    roles: roleList,
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

  // The account switcher is for workspaces the signed-in account actually
  // belongs to. Staff can read every client workspace through RLS for
  // administration, but their normal account view is the seeded internal
  // Dream Wave Media workspace only. While previewing, expose only the
  // explicitly selected client workspace.
  const workspaceIds = previewWorkspaceId
    ? [previewWorkspaceId]
    : ctx.isStaff && ctx.staffType !== "media_manager"
      ? ["11111111-1111-1111-1111-111111111111"]
      : Array.from(membershipMap.keys());

  if (!workspaceIds.length && ctx.staffType !== "media_manager") return [];

  let workspacesQuery = supabase
    .from("workspaces")
    .select("id,name,slug,industry,timezone,is_demo")
    .eq("is_archived", false)
    .order("name", { ascending: true });

  if (ctx.staffType !== "media_manager" || previewWorkspaceId) {
    workspacesQuery = workspacesQuery.in("id", workspaceIds);
  }

  const { data: workspaces, error } = await workspacesQuery;

  if (error) throw error;

  return (workspaces ?? []).map((w) => {
    const role = membershipMap.get(w.id);
    return {
      ...w,
      // A staff preview is intentionally represented as client-level access.
      // Outside preview, the internal account is labelled with the app role.
      role: (previewWorkspaceId ? "viewer" : ctx.isStaff ? "staff" : (role ?? "viewer")) as
        "owner" | "approver" | "viewer" | "staff",
    };
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["waveos", "current-user"],
    queryFn: loadContext,
    staleTime: 60_000,
  });
}

export function useWorkspaces() {
  const { data: user } = useCurrentUser();
  const impersonate = useImpersonateClient();
  const previewWorkspaceId =
    typeof window !== "undefined" && impersonate.on
      ? localStorage.getItem("waveos.active-workspace")
      : null;

  return useQuery({
    queryKey: ["waveos", "workspaces", user?.userId, previewWorkspaceId],
    queryFn: () => loadWorkspaces(user!, previewWorkspaceId),
    enabled: !!user,
    staleTime: 30_000,
  });
}
