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
    body: z
      .string()
      .trim()
      .min(1)
      .max(20_000)
      .describe("Primary caption (Markdown or plain text)."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, title, body }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForUser(ctx);
    const actorUserId = ctx.getUserId();
    const [featureResult, roleResult, staffResult] = await Promise.all([
      supabase.rpc("has_feature", {
        _workspace_id: workspace_id,
        _feature: "can_create_content",
      }),
      supabase.rpc("workspace_role", {
        _workspace_id: workspace_id,
        _user_id: actorUserId,
      }),
      supabase.rpc("can_staff_manage_workspace", {
        _workspace_id: workspace_id,
        _user_id: actorUserId,
      }),
    ]);
    const authorizationError = featureResult.error ?? roleResult.error ?? staffResult.error;
    if (authorizationError) return failure("Unable to verify workspace permissions.");
    const canManageAsStaff = staffResult.data === true;
    const canAuthorAsMember =
      featureResult.data === true &&
      ["owner", "admin", "editor"].includes(String(roleResult.data ?? ""));
    if (!canManageAsStaff && !canAuthorAsMember) {
      return failure("You do not have permission to create content in this workspace.");
    }

    const { data, error } = await supabase
      .from("content_items")
      .insert({
        workspace_id,
        title,
        primary_caption: body,
        status: "draft",
        created_by: actorUserId,
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
