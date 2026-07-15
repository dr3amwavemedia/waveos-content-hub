import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

// Per-request Supabase client that forwards the caller's bearer token so RLS
// runs as that user. Never use the service-role key here — MCP tools must not
// escalate privileges.
export function supabaseForUser(ctx: ToolContext): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function unauthorized() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated. Please reconnect." }],
    isError: true,
  };
}

export function failure(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
