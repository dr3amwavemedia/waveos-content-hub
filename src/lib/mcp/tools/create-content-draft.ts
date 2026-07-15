import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthorized, failure } from "../supabase-user";

export default defineTool({
  name: "create_content_draft",
  title: "Create content draft",
  description:
    "Create a new draft content item in the given workspace with a title and body. Returns the created row.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace to create the draft in."),
    title: z.string().trim().min(1).max(200).describe("Content title."),
    body: z.string().trim().min(1).describe("Content body (Markdown or plain text)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ workspace_id, title, body }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("content_items")
      .insert({
        workspace_id,
        title,
        body,
        status: "draft",
        created_by: ctx.getUserId(),
      })
      .select("id, workspace_id, title, status, created_at")
      .single();
    if (error) return failure(error.message);
    return {
      content: [{ type: "text", text: `Draft created: ${data?.id}` }],
      structuredContent: { item: data },
    };
  },
});
