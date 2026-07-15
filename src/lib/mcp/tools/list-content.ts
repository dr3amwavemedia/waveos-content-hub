import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthorized, failure } from "../supabase-user";

export default defineTool({
  name: "list_content",
  title: "List content",
  description:
    "List content items in a workspace. Filter by status (draft, in_review, changes_requested, approved, scheduled, published) and limit.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id to list content from."),
    status: z
      .enum(["draft", "in_review", "changes_requested", "approved", "scheduled", "published"])
      .optional()
      .describe("Optional status filter."),
    limit: z.number().int().min(1).max(100).default(25).describe("Max rows to return (1-100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("content_items")
      .select("id, title, status, scheduled_at, published_at, created_at, updated_at")
      .eq("workspace_id", workspace_id)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return failure(error.message);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { items: data ?? [] },
    };
  },
});
