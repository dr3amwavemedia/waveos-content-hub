import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Prepared cloud-history endpoints. Do not wire into the UI until the
 * agent_conversations table and user-owned RLS policies are deployed.
 * No database migrations are applied by this module.
 */
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(12000),
});

const conversationInput = z.object({
  workspaceId: z.string().uuid(),
});

const saveInput = conversationInput.extend({
  messages: z.array(messageSchema).max(40),
});

async function verifyWorkspaceAccess(
  supabase: any,
  userId: string,
  workspaceId: string,
) {
  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError) throw new Error("Workspace access could not be verified.");
  if (member) return;

  const { data: staffAllowed, error: staffError } = await supabase.rpc(
    "can_staff_manage_workspace",
    { _user_id: userId, _workspace_id: workspaceId },
  );
  if (staffError || staffAllowed !== true) throw new Error("forbidden");
}

export const loadAgentConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => conversationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await verifyWorkspaceAccess(supabase, userId, data.workspaceId);
    const { data: conversation, error } = await (supabase as any)
      .from("agent_conversations")
      .select("messages,updated_at")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("Conversation history is unavailable.");
    return {
      messages: conversation ? saveInput.shape.messages.parse(conversation.messages) : [],
      updatedAt: conversation?.updated_at ?? null,
    };
  });

export const saveAgentConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await verifyWorkspaceAccess(supabase, userId, data.workspaceId);
    const { error } = await (supabase as any).from("agent_conversations").upsert(
      {
        workspace_id: data.workspaceId,
        user_id: userId,
        messages: data.messages,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,user_id" },
    );
    if (error) throw new Error("Conversation could not be saved.");
    return { saved: true };
  });
