import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user!;
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
    isStaff:
      roleList.includes("dream_wave_owner") ||
      roleList.includes("dream_wave_team"),
    isDreamWaveOwner: roleList.includes("dream_wave_owner"),
    roles: roleList,
  };
}

async function loadWorkspaces(
  ctx: CurrentUserContext,
): Promise<WorkspaceSummary[]> {
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id,name,slug,industry,timezone,is_demo")
    .eq("is_archived", false)
    .order("name", { ascending: true });

  if (!workspaces) return [];

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", ctx.userId);

  const membershipMap = new Map(
    (memberships ?? []).map((m) => [m.workspace_id, m.role]),
  );

  return workspaces.map((w) => {
    const role = membershipMap.get(w.id);
    return {
      ...w,
      role: (role ?? (ctx.isStaff ? "staff" : "viewer")) as
        | "owner"
        | "approver"
        | "viewer"
        | "staff",
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
  return useQuery({
    queryKey: ["waveos", "workspaces", user?.userId],
    queryFn: () => loadWorkspaces(user!),
    enabled: !!user,
    staleTime: 30_000,
  });
}
