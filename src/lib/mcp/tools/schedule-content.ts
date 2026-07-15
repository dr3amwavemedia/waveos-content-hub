import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthorized, failure } from "../supabase-user";

export default defineTool({
  name: "schedule_content",
  title: "Schedule content",
  description:
    "Move a content item to 'scheduled' at the given ISO 8601 UTC timestamp. Caller must have permission in the item's workspace.",
  inputSchema: {
    content_id: z.string().uuid().describe("Content item id to schedule."),
    scheduled_at: z
      .string()
      .datetime({ offset: true })
      .describe("Publish time as ISO 8601 timestamp (e.g. 2026-08-01T14:00:00Z)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ content_id, scheduled_at }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("content_items")
      .update({ status: "scheduled", scheduled_at })
      .eq("id", content_id)
      .select("id, workspace_id, title, status, scheduled_at")
      .single();
    if (error) return failure(error.message);
    return {
      content: [{ type: "text", text: `Scheduled ${data?.id} for ${data?.scheduled_at}` }],
      structuredContent: { item: data },
    };
  },
});
