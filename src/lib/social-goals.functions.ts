import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_WEEKLY_POST_GOAL } from "./social-goals";

function normalizeGoal(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30
    ? parsed
    : DEFAULT_WEEKLY_POST_GOAL;
}

export const getSocialPostingGoal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: membership }, { data: staffCanManage }, { data: workspace, error }] =
      await Promise.all([
        supabaseAdmin
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", data.workspaceId)
          .eq("user_id", context.userId)
          .maybeSingle(),
        supabaseAdmin.rpc("can_staff_manage_workspace", {
          _user_id: context.userId,
          _workspace_id: data.workspaceId,
        }),
        supabaseAdmin
          .from("workspaces")
          .select("feature_overrides")
          .eq("id", data.workspaceId)
          .maybeSingle(),
      ]);
    if (error) throw error;
    if (!membership && staffCanManage !== true)
      throw new Error("You do not have access to this workspace.");
    const overrides =
      workspace?.feature_overrides && typeof workspace.feature_overrides === "object"
        ? (workspace.feature_overrides as Record<string, unknown>)
        : {};
    return {
      weeklyGoal: normalizeGoal(overrides.weekly_post_goal),
      canManage: staffCanManage === true || ["owner", "admin"].includes(membership?.role ?? ""),
    };
  });

export const setSocialPostingGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string; weeklyGoal: number }) => data)
  .handler(async ({ data, context }) => {
    if (!Number.isInteger(data.weeklyGoal) || data.weeklyGoal < 1 || data.weeklyGoal > 30) {
      throw new Error("Choose a weekly goal between 1 and 30 posts.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: membership }, { data: staffCanManage }, { data: workspace, error }] =
      await Promise.all([
        supabaseAdmin
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", data.workspaceId)
          .eq("user_id", context.userId)
          .maybeSingle(),
        supabaseAdmin.rpc("can_staff_manage_workspace", {
          _user_id: context.userId,
          _workspace_id: data.workspaceId,
        }),
        supabaseAdmin
          .from("workspaces")
          .select("feature_overrides")
          .eq("id", data.workspaceId)
          .maybeSingle(),
      ]);
    if (error) throw error;
    if (staffCanManage !== true && !["owner", "admin"].includes(membership?.role ?? "")) {
      throw new Error("Only a client admin can change the workspace posting goal.");
    }
    const previous =
      workspace?.feature_overrides && typeof workspace.feature_overrides === "object"
        ? (workspace.feature_overrides as Record<string, unknown>)
        : {};
    const { error: updateError } = await supabaseAdmin
      .from("workspaces")
      .update({ feature_overrides: { ...previous, weekly_post_goal: data.weeklyGoal } })
      .eq("id", data.workspaceId);
    if (updateError) throw updateError;
    await supabaseAdmin.from("activity_logs").insert({
      workspace_id: data.workspaceId,
      actor_user_id: context.userId,
      action: "weekly_post_goal_updated",
      entity_type: "workspace",
      entity_id: data.workspaceId,
      safe_metadata: { weekly_goal: data.weeklyGoal },
    });
    return { weeklyGoal: data.weeklyGoal };
  });
