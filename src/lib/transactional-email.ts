import { supabase } from "@/integrations/supabase/client";

type Result = { configured?: boolean; sent?: number; attempted?: number; skipped?: boolean };

async function invoke(body: Record<string, unknown>): Promise<Result> {
  const { data, error } = await supabase.functions.invoke("transactional-email", { body });
  if (error) throw error;
  return (data ?? {}) as Result;
}

export const sendInviteEmail = (inviteId: string, url: string) =>
  invoke({ type: "invite", inviteId, url });

export const sendWorkspaceEmail = (payload: {
  workspaceId: string;
  event: "request_updated" | "invoice_updated" | "revisions_updated" | "content_added" | "contract_ready";
  title: string;
  status?: string;
  url?: string | null;
}) => invoke({ type: "workspace_event", ...payload });

export async function tryEmail(action: () => Promise<Result>) {
  try {
    return await action();
  } catch (error) {
    console.warn("Transactional email was not sent", error);
    return { configured: false, sent: 0 } satisfies Result;
  }
}

