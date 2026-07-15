import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthorized, failure } from "../supabase-user";

export default defineTool({
  name: "list_workspaces",
  title: "List workspaces",
  description:
    "List every Brand Workspace the signed-in user belongs to, with their role in each.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("workspace_members")
      .select("role, workspace:workspaces(id, name, slug, industry, timezone)")
      .eq("user_id", ctx.getUserId());
    if (error) return failure(error.message);
    const rows = (data ?? []).map((r) => {
      const ws = r.workspace as unknown as {
        id: string; name: string; slug: string;
        industry: string | null; timezone: string | null;
      } | null;
      return ws
        ? { id: ws.id, name: ws.name, slug: ws.slug, industry: ws.industry, timezone: ws.timezone, role: r.role }
        : null;
    }).filter(Boolean);
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { workspaces: rows },
    };
  },
});
export const _schema = z.object({});
