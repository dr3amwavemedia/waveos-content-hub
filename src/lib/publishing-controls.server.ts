import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertPublishingEnabled(workspaceId: string) {
  const { data, error } = await supabaseAdmin
    .from("publishing_controls" as never)
    .select("workspace_id,paused,reason")
    .eq("paused", true);
  if (error) throw error;
  const controls = (data ?? []) as Array<{
    workspace_id: string | null;
    paused: boolean;
    reason: string | null;
  }>;
  const pause = controls.find(
    (row) => row.workspace_id === null || row.workspace_id === workspaceId,
  );
  if (pause) {
    throw new Error(pause.reason || "Publishing is temporarily paused by WaveOS operations.");
  }
}
