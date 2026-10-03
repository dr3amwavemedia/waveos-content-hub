import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteContentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { contentId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: item, error: itemError } = await supabaseAdmin
      .from("content_items")
      .select("id,workspace_id,status,title")
      .eq("id", data.contentId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) throw new Error("Post not found.");
    if (item.status === "publishing") {
      throw new Error("This post is publishing now and cannot be deleted yet.");
    }

    const [{ data: roles }, { data: membership }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role,staff_type").eq("user_id", context.userId),
      supabaseAdmin
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", item.workspace_id)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    const isOwner = (roles ?? []).some((role) => role.role === "dream_wave_owner");
    const isMediaManager = (roles ?? []).some(
      (role) => role.role === "dream_wave_team" && role.staff_type === "media_manager",
    );
    const isClientManager = ["owner", "admin", "editor"].includes(membership?.role ?? "");

    let mediaManagerCanManage = false;
    if (isMediaManager) {
      const [{ data: workspace }, { data: subscription }] = await Promise.all([
        supabaseAdmin
          .from("workspaces")
          .select("id,access_tier,feature_overrides")
          .eq("id", item.workspace_id)
          .maybeSingle(),
        supabaseAdmin
          .from("workspace_social_subscriptions" as never)
          .select("status,trial_ends_at")
          .eq("workspace_id", item.workspace_id)
          .maybeSingle(),
      ]);
      const socialOverride =
        (workspace?.feature_overrides as Record<string, boolean> | null)?.[
          "social_management_access"
        ] === true;
      const socialPlan = subscription as {
        status?: string;
        trial_ends_at?: string | null;
      } | null;
      const activeSubscription =
        socialPlan?.status === "active" ||
        (socialPlan?.status === "trialing" &&
          Boolean(socialPlan.trial_ends_at) &&
          new Date(socialPlan.trial_ends_at!).getTime() > Date.now());
      mediaManagerCanManage = Boolean(
        workspace &&
        (workspace.id === "11111111-1111-1111-1111-111111111111" ||
          workspace.access_tier === "social_management" ||
          socialOverride ||
          activeSubscription),
      );
    }

    if (!isOwner && !isClientManager && !mediaManagerCanManage) {
      throw new Error("You do not have permission to delete this post.");
    }

    const { error: deleteError } = await supabaseAdmin
      .from("content_items")
      .delete()
      .eq("id", item.id);
    if (deleteError) throw deleteError;

    await supabaseAdmin.from("activity_logs").insert({
      workspace_id: item.workspace_id,
      actor_user_id: context.userId,
      action: "content_item_deleted",
      entity_type: "content_item",
      entity_id: item.id,
      safe_metadata: { previous_status: item.status, title: item.title },
    });

    return { deleted: true, previousStatus: item.status };
  });
