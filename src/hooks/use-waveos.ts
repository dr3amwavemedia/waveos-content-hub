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
  roles: string[];
}

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
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const roleList = (roles ?? []).map((r) => r.role);
  return {
    userId: user.id,
    email: user.email ?? "",
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    isStaff: roleList.includes("dream_wave_owner") || roleList.includes("dream_wave_team"),
    isDreamWaveOwner: roleList.includes("dream_wave_owner"),
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
    : ctx.isStaff
      ? ["11111111-1111-1111-1111-111111111111"]
      : Array.from(membershipMap.keys());

  if (!workspaceIds.length) return [];

  const { data: workspaces, error } = await supabase
    .from("workspaces")
    .select("id,name,slug,industry,timezone,is_demo")
    .in("id", workspaceIds)
    .eq("is_archived", false)
    .order("name", { ascending: true });

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
