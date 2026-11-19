import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

const workspaceInput = z.object({ workspaceId: z.string().uuid() });
const syncInput = workspaceInput.extend({
  threadId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  messages: z
    .array(
      z.object({
        id: z.string().uuid(),
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(20_000),
        inputMode: z.enum(["text", "voice"]),
        createdAt: z.number().int().positive(),
      }),
    )
    .max(24),
});

function schemaUnavailable(error: any) {
  return ["42P01", "PGRST205", "PGRST204"].includes(String(error?.code ?? ""));
}

async function requireWorkspaceAccess(context: any, workspaceId: string) {
  const [{ data: member }, { data: manageable }, { data: roles }, { data: entitled }] =
    await Promise.all([
      context.supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase.rpc("can_staff_manage_workspace", {
        _user_id: context.userId,
        _workspace_id: workspaceId,
      }),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.rpc("has_feature", {
        _workspace_id: workspaceId,
        _feature: "can_use_ai_tools",
      }),
    ]);
  const staffIdentity = (roles ?? []).some(
    (row: { role: string }) => row.role === "dream_wave_owner" || row.role === "dream_wave_team",
  );
  const staff = manageable === true || (staffIdentity && workspaceId === STAFF_WORKSPACE_ID);
  if (!member && !staff) throw new Error("forbidden");
  if (!staff && !entitled) throw new Error("My Agent is not included in this plan.");
}

export const getAgentConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireWorkspaceAccess(context, data.workspaceId);
    const threadResult = await (context.supabase as any)
      .from("my_agent_threads")
      .select("id,title,updated_at")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (schemaUnavailable(threadResult.error)) {
      return { cloudAvailable: false, threadId: null, title: null, messages: [] };
    }
    if (threadResult.error) throw new Error("My Agent history could not be loaded.");
    if (!threadResult.data) {
      return { cloudAvailable: true, threadId: null, title: null, messages: [] };
    }

    const messagesResult = await (context.supabase as any)
      .from("my_agent_messages")
      .select("id,role,content,input_mode,created_at")
      .eq("thread_id", threadResult.data.id)
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(24);
    if (schemaUnavailable(messagesResult.error)) {
      return { cloudAvailable: false, threadId: null, title: null, messages: [] };
    }
    if (messagesResult.error) throw new Error("My Agent messages could not be loaded.");
    return {
      cloudAvailable: true,
      threadId: threadResult.data.id as string,
      title: threadResult.data.title as string,
      messages: (messagesResult.data ?? []).map((message: any) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        inputMode: message.input_mode,
        createdAt: new Date(message.created_at).getTime(),
      })),
    };
  });
export const syncAgentConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => syncInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireWorkspaceAccess(context, data.workspaceId);
    const now = new Date().toISOString();
    const threadResult = await (context.supabase as any).from("my_agent_threads").upsert(
      {
        id: data.threadId,
        workspace_id: data.workspaceId,
        user_id: context.userId,
        title: data.title,
        updated_at: now,
        archived_at: null,
      },
      { onConflict: "id" },
    );
    if (schemaUnavailable(threadResult.error)) return { cloudAvailable: false };
    if (threadResult.error) throw new Error("My Agent conversation could not be saved.");

    if (data.messages.length) {
      const messagesResult = await (context.supabase as any).from("my_agent_messages").upsert(
        data.messages.map((message) => ({
          id: message.id,
          thread_id: data.threadId,
          workspace_id: data.workspaceId,
          user_id: context.userId,
          role: message.role,
          content: message.content,
          input_mode: message.inputMode,
          created_at: new Date(message.createdAt).toISOString(),
        })),
        { onConflict: "id" },
      );
      if (schemaUnavailable(messagesResult.error)) return { cloudAvailable: false };
      if (messagesResult.error) throw new Error("My Agent messages could not be saved.");
    }
    return { cloudAvailable: true };
  });

