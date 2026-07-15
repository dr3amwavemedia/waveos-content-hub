import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthorized, failure } from "../supabase-user";

export default defineTool({
  name: "list_media_assets",
  title: "List media assets",
  description: "List media assets in a workspace's library, most recent first.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("media_assets")
      .select("id, filename, mime_type, size_bytes, folder_id, created_at")
      .eq("workspace_id", workspace_id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return failure(error.message);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { assets: data ?? [] },
    };
  },
});
