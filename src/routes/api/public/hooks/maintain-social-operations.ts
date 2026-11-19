import { timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET ?? "";
  const supplied =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export const Route = createFileRoute("/api/public/hooks/maintain-social-operations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { zernioRequest } = await import("@/lib/zernio.server");
        const { refreshZernioPublishAttempt } = await import("@/lib/zernio-publish.server");
        const now = new Date();
        const nowIso = now.toISOString();
        const staleBefore = new Date(now.getTime() - 30 * 60_000).toISOString();
        const stats = {
          disconnected: 0,
          archived: 0,
          publishReconciled: 0,
          publishFailed: 0,
          errors: 0,
        };

        const { data: stale } = await supabaseAdmin
          .from("publish_attempts")
          .select("id,content_item_id,provider_post_id,attempted_at")
          .eq("provider", "zernio")
          .eq("status", "sending")
          .lte("attempted_at", staleBefore)
          .limit(50);
        for (const attempt of stale ?? []) {
          try {
            if (attempt.provider_post_id) {
              await refreshZernioPublishAttempt(attempt.id);
              stats.publishReconciled += 1;
            } else {
              await supabaseAdmin
                .from("publish_attempts")
                .update({
                  status: "failed",
                  error_code: "provider_reference_missing",
                  error_message:
                    "WaveOS could not verify this publish with Zernio. It was not retried automatically to prevent a duplicate post.",
                  completed_at: nowIso,
                })
                .eq("id", attempt.id);
              await supabaseAdmin
                .from("content_items")
                .update({ status: "failed" })
                .eq("id", attempt.content_item_id);
              stats.publishFailed += 1;
            }
          } catch (error) {
            stats.errors += 1;
            console.error("[social maintenance] publish reconciliation failed", attempt.id, error);
          }
        }

        const { data: dueDisconnects } = await supabaseAdmin
          .from("social_subscription_lifecycle" as never)
          .select("workspace_id,state,disconnect_at")
          .eq("state", "grace")
          .lte("disconnect_at", nowIso)
          .limit(50);
        for (const lifecycle of (dueDisconnects ?? []) as Array<{ workspace_id: string }>) {
          try {
            const { data: rows, error } = await supabaseAdmin
              .from("social_connections")
              .select("id,provider_account_id")
              .eq("workspace_id", lifecycle.workspace_id)
              .eq("provider", "zernio")
              .eq("connected", true);
            if (error) throw error;
            for (const row of rows ?? []) {
              if (row.provider_account_id) {
                try {
                  await zernioRequest(`/accounts/${encodeURIComponent(row.provider_account_id)}`, {
                    method: "DELETE",
                  });
                } catch (error) {
                  if ((error as Error & { status?: number }).status !== 404) throw error;
                }
              }
              await supabaseAdmin
                .from("social_connections")
                .update({
                  connected: false,
                  connection_state: "not_connected",
                  provider_account_id: null,
                  raw: {},
                  last_synced_at: nowIso,
                } as never)
                .eq("id", row.id);
            }
            await supabaseAdmin
              .from("social_subscription_lifecycle" as never)
              .update({
                state: "retention",
                disconnected_at: nowIso,
                last_checked_at: nowIso,
                last_error: null,
                updated_at: nowIso,
              } as never)
              .eq("workspace_id", lifecycle.workspace_id);
            stats.disconnected += rows?.length ?? 0;
          } catch (error) {
            stats.errors += 1;
            await supabaseAdmin
              .from("social_subscription_lifecycle" as never)
              .update({
                state: "error",
                last_checked_at: nowIso,
                last_error:
                  error instanceof Error ? error.message.slice(0, 500) : "Unknown disconnect error",
                updated_at: nowIso,
              } as never)
              .eq("workspace_id", lifecycle.workspace_id);
          }
        }

        const { data: dueArchives } = await supabaseAdmin
          .from("social_subscription_lifecycle" as never)
          .select("workspace_id,state,archive_at")
          .in("state", ["retention", "error"])
          .lte("archive_at", nowIso)
          .limit(25);
        for (const lifecycle of (dueArchives ?? []) as Array<{ workspace_id: string }>) {
          const { data: subscription } = await supabaseAdmin
            .from("workspace_social_subscriptions" as never)
            .select("status,service_locked_at")
            .eq("workspace_id", lifecycle.workspace_id)
            .maybeSingle();
          const row = subscription as { status?: string; service_locked_at?: string | null } | null;
          if (!row?.service_locked_at || ["active", "trialing"].includes(row.status ?? ""))
            continue;
          const result = await supabaseAdmin
            .from("workspaces")
            .update({ is_archived: true, status: "archived", updated_at: nowIso })
            .eq("id", lifecycle.workspace_id)
            .eq("data_source", "os_data");
          if (result.error) {
            stats.errors += 1;
            continue;
          }
          await supabaseAdmin
            .from("social_subscription_lifecycle" as never)
            .update({
              state: "archived",
              archived_at: nowIso,
              last_checked_at: nowIso,
              updated_at: nowIso,
            } as never)
            .eq("workspace_id", lifecycle.workspace_id);
          stats.archived += 1;
        }

        // Bounded, non-destructive per-post analytics refresh: a few connected
        // accounts per run, each at most once a day, read-only at the provider.
        let metricsRefreshed = 0;
        try {
          const { refreshAccountPostMetrics } = await import("@/lib/live-posts.server");
          const { toProviderPlatform } = await import("@/lib/live-posts");
          const dayAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString();
          const { data: recent } = await supabaseAdmin
            .from("social_metric_backfill_runs" as never)
            .select("workspace_id,provider_account_id,last_attempt_at,next_retry_at")
            .gte("last_attempt_at", dayAgo)
            .limit(1000);
          const skip = new Set(
            ((recent ?? []) as Array<{ workspace_id: string; provider_account_id: string }>).map(
              (row) => `${row.workspace_id}:${row.provider_account_id}`,
            ),
          );
          const { data: connections } = await supabaseAdmin
            .from("social_connections")
            .select("workspace_id,platform,provider_account_id,display_name,connection_state")
            .eq("provider", "zernio")
            .eq("connected", true)
            .not("provider_account_id", "is", null)
            .limit(200);
          for (const row of connections ?? []) {
            if (metricsRefreshed >= 10) break;
            if (!row.provider_account_id || row.connection_state !== "connected") continue;
            if (skip.has(`${row.workspace_id}:${row.provider_account_id}`)) continue;
            await refreshAccountPostMetrics(row.workspace_id, {
              accountId: row.provider_account_id,
              platform: toProviderPlatform(row.platform),
              name: row.display_name ?? row.platform,
            });
            metricsRefreshed += 1;
          }
        } catch (error) {
          stats.errors += 1;
          console.error("[social maintenance] post metrics refresh failed", error);
        }

        return Response.json({ ...stats, metricsRefreshed });
      },
    },
  },
});
