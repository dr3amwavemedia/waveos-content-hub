import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

function describeSupabaseError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message).trim();
    if (message) return message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return "Supabase returned an unknown error.";
}

function auditError(stage: string, error: unknown): Error {
  return new Error(`${stage}: ${describeSupabaseError(error)}`);
}

export const scanWorkspaceAccessHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ownerRole, error: ownerRoleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "dream_wave_owner")
      .maybeSingle();
    if (ownerRoleError) throw auditError("Could not verify owner access", ownerRoleError);
    if (!ownerRole) throw new Error("Only the Dream Wave owner can run the access audit.");

    const users = [];
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw auditError(`Could not list authentication users (page ${page})`, error);
      if (!data?.users) {
        throw new Error(`Could not list authentication users (page ${page}): empty response.`);
      }
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }

    const [
      { data: memberships, error: membershipsError },
      { data: roles, error: rolesError },
      { data: workspaces, error: workspacesError },
    ] = await Promise.all([
      supabaseAdmin.from("workspace_members").select("user_id,workspace_id,role"),
      supabaseAdmin.from("user_roles").select("user_id,role,staff_type"),
      supabaseAdmin.from("workspaces").select("id,name,is_archived,data_source"),
    ]);
    if (membershipsError) {
      throw auditError("Could not load workspace memberships", membershipsError);
    }
    if (rolesError) throw auditError("Could not load user roles", rolesError);
    if (workspacesError) throw auditError("Could not load workspaces", workspacesError);

    const workspaceById = new Map((workspaces ?? []).map((row) => [row.id, row]));
    const membershipsByUser = new Map<string, typeof memberships>();
    for (const membership of memberships ?? []) {
      const rows = membershipsByUser.get(membership.user_id) ?? [];
      rows.push(membership);
      membershipsByUser.set(membership.user_id, rows);
    }
    const rolesByUser = new Map<string, typeof roles>();
    for (const role of roles ?? []) {
      const rows = rolesByUser.get(role.user_id) ?? [];
      rows.push(role);
      rolesByUser.set(role.user_id, rows);
    }

    const rows = users.map((user) => {
      const userMemberships = membershipsByUser.get(user.id) ?? [];
      const userRoles = rolesByUser.get(user.id) ?? [];
      const isStaff = userRoles.some((row) =>
        ["dream_wave_owner", "dream_wave_team"].includes(row.role),
      );
      const activeMemberships = userMemberships.filter(
        (row) => workspaceById.get(row.workspace_id)?.is_archived === false,
      );
      const clientMemberships = activeMemberships.filter(
        (row) => row.workspace_id !== STAFF_WORKSPACE_ID,
      );
      const accountSource =
        user.user_metadata?.account_source === "os_data" ? "os_data" : "client_data";
      const issues: string[] = [];
      if (!user.email_confirmed_at) issues.push("Email is not confirmed");
      if (isStaff && !workspaceById.has(STAFF_WORKSPACE_ID)) {
        issues.push("Dream Wave staff workspace is missing");
      }
      if (!isStaff && clientMemberships.length === 0) issues.push("No active workspace membership");
      for (const membership of userMemberships) {
        if (!workspaceById.has(membership.workspace_id)) {
          issues.push(`Membership points to missing workspace ${membership.workspace_id}`);
        }
      }
      const defaultWorkspace = isStaff
        ? (workspaceById.get(STAFF_WORKSPACE_ID)?.name ?? "Dream Wave Media staff workspace")
        : (clientMemberships
            .map((row) => ({ ...row, workspace: workspaceById.get(row.workspace_id) }))
            .filter((row) => row.workspace)
            .sort(
              (a, b) =>
                Number(b.role === "owner") - Number(a.role === "owner") ||
                a.workspace!.name.localeCompare(b.workspace!.name),
            )[0]?.workspace?.name ?? null);
      return {
        userId: user.id,
        email: user.email ?? "No email",
        accountSource,
        isStaff,
        defaultWorkspace,
        memberships: activeMemberships.map((membership) => ({
          workspaceId: membership.workspace_id,
          workspaceName: workspaceById.get(membership.workspace_id)?.name ?? "Missing workspace",
          role: membership.role,
        })),
        lastSignInAt: user.last_sign_in_at ?? null,
        issues,
      };
    });

    const authIds = new Set(users.map((user) => user.id));
    for (const membership of memberships ?? []) {
      if (!authIds.has(membership.user_id)) {
        rows.push({
          userId: membership.user_id,
          email: "Deleted auth user",
          accountSource: "client_data",
          isStaff: false,
          defaultWorkspace: null,
          memberships: [
            {
              workspaceId: membership.workspace_id,
              workspaceName:
                workspaceById.get(membership.workspace_id)?.name ?? "Missing workspace",
              role: membership.role,
            },
          ],
          lastSignInAt: null,
          issues: ["Workspace membership has no matching login"],
        });
      }
    }

    rows.sort((a, b) => b.issues.length - a.issues.length || a.email.localeCompare(b.email));
    return {
      scannedAt: new Date().toISOString(),
      total: rows.length,
      healthy: rows.filter((row) => row.issues.length === 0).length,
      rows,
    };
  });
