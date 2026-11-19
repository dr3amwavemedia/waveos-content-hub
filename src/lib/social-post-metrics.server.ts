import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyAnalyticsError } from "@/lib/analytics-transparency";
import type { LivePostAccount } from "@/lib/live-posts";
import {
  linkObservationsToContent,
  nextBackfillRun,
  normalizePostMetricObservations,
  OBSERVATION_CONFLICT,
  observationToRow,
} from "@/lib/social-post-metrics";

/**
 * Best-effort, account-scoped storage of one provider analytics page. Never
 * throws: a storage problem (for example before the migration is applied)
 * must not affect the published-post library or any provider call.
 */
export async function storeAccountPostMetrics(input: {
  workspaceId: string;
  account: LivePostAccount;
  payload: unknown;
  hasMore: boolean;
}) {
  const now = new Date();
  const nowIso = now.toISOString();
  try {
    const normalized = normalizePostMetricObservations({
      workspaceId: input.workspaceId,
      account: input.account,
      payload: input.payload,
      capturedAt: nowIso,
    });
    let observations = normalized.observations;
    if (normalized.latePostIds.size) {
      const { data } = await supabaseAdmin
        .from("publish_attempts")
        .select("provider_post_id,content_item_id,platform,request_snapshot")
        .eq("workspace_id", input.workspaceId)
        .eq("provider", "zernio")
        .in("provider_post_id", [...new Set(normalized.latePostIds.values())].slice(0, 200));
      observations = linkObservationsToContent(observations, normalized.latePostIds, data ?? []);
    }
    if (observations.length) {
      const { error } = await supabaseAdmin
        .from("social_post_metric_observations" as never)
        .upsert(observations.map(observationToRow) as never, { onConflict: OBSERVATION_CONFLICT });
      if (error) throw error;
    }
    const oldestDay = observations.map((o) => o.windowStart).sort()[0] ?? null;
    await writeBackfillRun(input.workspaceId, input.account, now, {
      kind: "page",
      stored: observations.length,
      oldestDay,
      hasMore: input.hasMore,
    });
    return { stored: observations.length, skippedWithoutId: normalized.skippedWithoutId };
  } catch (error) {
    console.warn("[post metrics] storage skipped", (error as Error)?.message ?? error);
    return { stored: 0, skippedWithoutId: 0 };
  }
}

export async function recordAccountMetricsFailure(workspaceId: string, account: LivePostAccount, reason: unknown) {
  try {
    const failure = classifyAnalyticsError(reason);
    await writeBackfillRun(workspaceId, account, new Date(), { kind: "failed", ...failure });
  } catch (error) {
    console.warn("[post metrics] backfill status skipped", (error as Error)?.message ?? error);
  }
}

async function writeBackfillRun(
  workspaceId: string,
  account: LivePostAccount,
  now: Date,
  outcome: Parameters<typeof nextBackfillRun>[0]["outcome"],
) {
  const identity = { workspace_id: workspaceId, provider: "zernio", platform: account.platform, provider_account_id: account.accountId };
  const { data: previous } = await supabaseAdmin
    .from("social_metric_backfill_runs" as never)
    .select("attempts,records_stored,covered_range_start,last_success_at")
    .match(identity)
    .maybeSingle();
  const next = nextBackfillRun({ previous: previous as never, today: now.toISOString().slice(0, 10), nowIso: now.toISOString(), outcome });
  const { error } = await supabaseAdmin
    .from("social_metric_backfill_runs" as never)
    .upsert({ ...identity, ...next } as never, { onConflict: "workspace_id,provider,platform,provider_account_id" });
  if (error) throw error;
}
