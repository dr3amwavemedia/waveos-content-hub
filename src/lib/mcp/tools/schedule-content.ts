import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthorized, failure } from "../supabase-user";

export default defineTool({
  name: "schedule_content",
  title: "Schedule content",
  description:
    "Request approval or schedule an eligible content item at the given ISO 8601 timestamp, following the workspace approval policy.",
  inputSchema: {
    content_id: z.string().uuid().describe("Content item id to schedule."),
    scheduled_at: z
      .string()
      .datetime({ offset: true })
      .describe("Publish time as ISO 8601 timestamp (e.g. 2026-08-01T14:00:00Z)."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ content_id, scheduled_at }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    if (new Date(scheduled_at).getTime() <= Date.now()) {
      return failure("Schedule time must be in the future.");
    }
    const supabase = supabaseForUser(ctx);
    const { data: item, error: itemError } = await supabase
      .from("content_items")
      .select("id, workspace_id, title, status")
      .eq("id", content_id)
      .maybeSingle();
    if (itemError) return failure(itemError.message);
    if (!item) return failure("Content item not found or unavailable.");
    if (["publishing", "published", "archived"].includes(item.status)) {
      return failure("This content item can no longer be scheduled.");
    }

    const actorUserId = ctx.getUserId();
    const [featureResult, staffResult] = await Promise.all([
      supabase.rpc("has_feature", {
        _workspace_id: item.workspace_id,
        _feature: "can_schedule_content",
      }),
      supabase.rpc("can_staff_manage_workspace", {
        _workspace_id: item.workspace_id,
        _user_id: actorUserId,
      }),
    ]);
    const authorizationError = featureResult.error ?? staffResult.error;
    if (authorizationError) return failure("Unable to verify scheduling permissions.");
    if (featureResult.data !== true && staffResult.data !== true) {
      return failure("Scheduling is not included for this workspace.");
    }

    const { data: status, error } = await supabase.rpc("submit_content_for_approval", {
      _content_id: content_id,
      _requested_action: "schedule",
      _scheduled_at: scheduled_at,
    });
    if (error) return failure(error.message);
    const nextStatus = String(status ?? "in_review");
    return {
      content: [
        {
          type: "text",
          text:
            nextStatus === "scheduled"
              ? `Scheduled ${item.id} for ${scheduled_at}`
              : `Schedule requested for ${item.id}; current status is ${nextStatus}.`,
        },
      ],
      structuredContent: {
        item: { ...item, status: nextStatus, scheduled_at },
      },
    };
  },
});
