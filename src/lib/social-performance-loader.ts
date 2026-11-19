import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { socialAnalyticsRangeStart, type ConfirmedSocialLead, type SocialAnalyticsRangeDays } from "@/lib/social-metrics-contract";
import { rowToObservation, type ObservationRow } from "@/lib/social-post-metrics";
import {
  buildSocialPerformance,
  previousPeriodEnd,
  type BackfillRunRow,
  type PerformanceFilters,
  type SocialPerformance,
} from "@/lib/social-performance";

export const filtersInput = z.object({
  workspaceId: z.string().uuid(),
  days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).default(30),
  platform: z.string().max(40).nullish(),
  accountId: z.string().max(200).nullish(),
  contentType: z.enum(["post", "reel", "story", "video", "carousel", "short", "stories_reels"]).nullish(),
  campaignPlanId: z.string().uuid().nullish(),
  includePrevious: z.boolean().optional(),
});

export type Client = SupabaseClient<Database>;

/**
 * Reads only through the caller's session; the new tables' RLS limits rows to
 * members/staff of this workspace, so no privileged client is needed.
 */
export async function loadSocialPerformance(
  supabase: Client,
  input: z.infer<typeof filtersInput>,
): Promise<{ current: SocialPerformance; previous: SocialPerformance | null; storageReady: boolean }> {
  const days = input.days as SocialAnalyticsRangeDays;
  const end = new Date().toISOString().slice(0, 10);
  const start = socialAnalyticsRangeStart(end, days);
  const prevEnd = previousPeriodEnd({ start });
  const readFrom = input.includePrevious ? socialAnalyticsRangeStart(prevEnd, days) : start;

  let contentItemIds: string[] | null = null;
  if (input.campaignPlanId) {
    const { data } = await supabase
      .from("content_items")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .contains("metadata", { campaignPlanId: input.campaignPlanId })
      .limit(500);
    contentItemIds = (data ?? []).map((row) => row.id);
  }

  const rows: ObservationRow[] = [];
  let storageReady = true;
  for (let page = 0; page < 10; page += 1) {
    let query = supabase
      .from("social_post_metric_observations" as never)
      .select("*")
      .eq("workspace_id", input.workspaceId)
      .eq("granularity", "lifetime")
      .gte("window_start", readFrom)
      .lte("window_start", end)
      .order("window_start", { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (input.platform) query = query.eq("platform", input.platform);
    if (input.accountId) query = query.eq("provider_account_id", input.accountId);
    const { data, error } = await query;
    if (error) {
      storageReady = false;
      break;
    }
    rows.push(...((data ?? []) as ObservationRow[]));
    if ((data ?? []).length < 1000) break;
  }
  const [leadsResult, runsResult] = await Promise.all([
    supabase
      .from("social_lead_conversions" as never)
      .select("workspace_id,dedupe_key,source,confirmed_at,provider_post_id,crm_contact_id")
      .eq("workspace_id", input.workspaceId)
      .gte("confirmed_at", `${readFrom}T00:00:00Z`)
      .limit(5000),
    supabase
      .from("social_metric_backfill_runs" as never)
      .select("provider_account_id,platform,status,covered_range_start,covered_range_end,last_success_at,last_attempt_at,safe_message")
      .eq("workspace_id", input.workspaceId),
  ]);
  const leads: ConfirmedSocialLead[] = ((leadsResult.data ?? []) as Array<Record<string, string | null>>).map((row) => ({
    workspaceId: String(row.workspace_id),
    dedupeKey: String(row.dedupe_key),
    source: row.source as ConfirmedSocialLead["source"],
    confirmedAt: String(row.confirmed_at),
    providerPostId: row.provider_post_id,
    crmContactId: row.crm_contact_id,
  }));
  const observations = rows.map(rowToObservation);
  const backfillRuns = (runsResult.data ?? []) as BackfillRunRow[];
  const filters: PerformanceFilters = {
    platform: input.platform ?? null,
    accountId: input.accountId ?? null,
    contentType: input.contentType ?? null,
    contentItemIds,
  };
  const current = buildSocialPerformance({ observations, leads, backfillRuns, days, endDate: end, filters });
  const previous = input.includePrevious
    ? buildSocialPerformance({ observations, leads, backfillRuns, days, endDate: prevEnd, filters })
    : null;
  return { current, previous, storageReady };
}

