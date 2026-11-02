import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAdminOperationalHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ownerRole } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "dream_wave_owner")
      .maybeSingle();
    if (!ownerRole) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [media, ai, analytics, connections] = await Promise.all([
      supabaseAdmin
        .from("media_assets")
        .select("size_bytes,workspace_id")
        .eq("source_provider", "waveos")
        .is("archived_at", null)
        .not("storage_path", "is", null),
      (
        supabaseAdmin as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              gte: (
                column: string,
                value: string,
              ) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
            };
          };
        }
      )
        .from("ai_usage_events")
        .select("workspace_id,input_tokens,output_tokens,estimated_cost_micros,status,created_at")
        .gte("created_at", since),
      supabaseAdmin
        .from("social_intelligence_profiles")
        .select("workspace_id,sync_state,last_attempt_at,last_success_at,safe_error_code"),
      supabaseAdmin
        .from("external_media_connections")
        .select("workspace_id,provider,token_expires_at,updated_at"),
    ]);

    const mediaRows = media.data ?? [];
    const aiRows = ai.data ?? [];
    const analyticsRows = analytics.data ?? [];
    const connectionRows = connections.data ?? [];
    const totalStorageBytes = mediaRows.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
    const aiFailures = aiRows.filter((row) => row.status !== "succeeded").length;
    const aiInputTokens = aiRows.reduce((sum, row) => sum + Number(row.input_tokens || 0), 0);
    const aiOutputTokens = aiRows.reduce((sum, row) => sum + Number(row.output_tokens || 0), 0);
    const estimatedCostMicros = aiRows.reduce(
      (sum, row) => sum + Number(row.estimated_cost_micros || 0),
      0,
    );
    const unhealthyAnalytics = analyticsRows.filter((row) =>
      ["permission_missing", "connection_expired", "sync_failed"].includes(row.sync_state),
    ).length;
    const staleAnalytics = analyticsRows.filter(
      (row) =>
        !row.last_success_at ||
        Date.parse(row.last_success_at) < Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).length;
    const unhealthyConnections = connectionRows.filter(
      (row) => row.token_expires_at && Date.parse(row.token_expires_at) <= Date.now(),
    ).length;

    return {
      observedAt: new Date().toISOString(),
      storage: {
        usedBytes: totalStorageBytes,
        safetyLimitBytes: 1_610_612_736,
        workspaceCount: new Set(mediaRows.map((row) => row.workspace_id)).size,
        available: !media.error,
      },
      ai: {
        requests30d: aiRows.length,
        failures30d: aiFailures,
        inputTokens30d: aiInputTokens,
        outputTokens30d: aiOutputTokens,
        estimatedCostMicros30d: estimatedCostMicros || null,
        available: !ai.error,
      },
      analytics: {
        profiles: analyticsRows.length,
        unhealthy: unhealthyAnalytics,
        stale: staleAnalytics,
        available: !analytics.error,
      },
      externalMedia: {
        connections: connectionRows.length,
        unhealthy: unhealthyConnections,
        available: !connections.error,
      },
    };
  });
