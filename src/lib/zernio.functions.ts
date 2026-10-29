import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SocialPlatform } from "@/hooks/use-content";
import {
  classifyAnalyticsError,
  parseAnalyticsPayload,
  unavailableAnalyticsSource,
  combineAnalyticsMetric,
  deriveEngagements,
  ANALYTICS_METRIC_KEYS,
  type AnalyticsSource,
  type AnalyticsSourceKey,
} from "@/lib/analytics-transparency";

type ZernioProfileRow = {
  profile_id: string;
  profile_name: string;
  verified_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};

const workspaceAnalyticsInput = z.object({
  workspaceId: z.string().uuid(),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
  refresh: z.boolean().default(false),
});

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

function schemaIsUnavailable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (["42P01", "PGRST205"].includes(error.code ?? "") ||
      /could not find.*social_intelligence|relation.*social_intelligence.*does not exist/i.test(
        error.message ?? "",
      )),
  );
}

export const getZernioAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => workspaceAnalyticsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireWorkspaceFeatureAccess, zernioRequest } = await import("./zernio.server");
    await requireWorkspaceFeatureAccess(
      context.supabase,
      context.userId,
      data.workspaceId,
      "can_view_analytics_checkup",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profileResult = await supabaseAdmin
      .from("zernio_profiles" as never)
      .select("profile_id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (profileResult.error) throw profileResult.error;
    const profile = profileResult.data as { profile_id: string } | null;
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - data.days * 86_400_000);
    const requestedRangeStart = fromDate.toISOString().slice(0, 10);
    const requestedRangeEnd = toDate.toISOString().slice(0, 10);
    if (!profile) {
      const sources = (["organic", "external", "paid"] as AnalyticsSourceKey[]).map((key) =>
        unavailableAnalyticsSource({
          key,
          availability: "not_synced",
          requestedRangeStart,
          requestedRangeEnd,
          safeMessage: "No publishing-provider profile is connected to this workspace.",
        }),
      );
      return { sources, requestedRangeStart, requestedRangeEnd, sync: {state:"profile_missing",message:"No provider profile is mapped to this workspace.",lastSuccessAt:null as string|null,accounts:0} };
    }
    const base = new URLSearchParams({
      profileId: profile.profile_id,
      fromDate: requestedRangeStart,
      toDate: requestedRangeEnd,
    });

    const sync={state:"available",message:"Provider metrics read successfully.",lastSuccessAt:null as string|null,accounts:0};
    try {
      const response=await zernioRequest<{accounts?:Array<{_id?:string;profileId?:string|{_id?:string};isActive?:boolean;needsReconnection?:boolean}>}>(`/accounts?profileId=${encodeURIComponent(profile.profile_id)}`);
      const accounts=(response.accounts??[]).filter(account=>(typeof account.profileId === "string"?account.profileId:account.profileId?._id)===profile.profile_id);
      sync.accounts=accounts.length;
      if(!accounts.length){sync.state="not_synced";sync.message="No accounts resolve to this provider profile. Check Social Media accounts.";}
      if(data.refresh) {
        const outcomes=await Promise.all(accounts.map(async account=>{
          if(!account._id)return {availability:"sync_failed",safeMessage:"A provider account identifier is missing."};
          if(account.needsReconnection || account.isActive===false)return {availability:"connection_expired",safeMessage:"Reconnect this account in Social Media before refreshing."};
          try{await zernioRequest("/posts/sync-external",{method:"POST",body:JSON.stringify({accountId:account._id})});return null;}
          catch(reason){return classifyAnalyticsError(reason);}
        }));
        const failure=outcomes.find(result=>result!==null);if(failure){sync.state=failure.availability;sync.message=failure.safeMessage;}
      }
    } catch(reason) {
      const failure=classifyAnalyticsError(reason);sync.state=failure.availability;sync.message=failure.safeMessage;
    }

    const loadSource = async (key: AnalyticsSourceKey, path: string): Promise<AnalyticsSource> => {
      try {
        const payload = await zernioRequest<Record<string, unknown>>(path);
        const pagination=payload.pagination as {pages?:number}|undefined;
        const field=key==="paid"?"ads":"posts";
        if(Array.isArray(payload[field]) && pagination?.pages && pagination.pages>1){
          const rows=[...payload[field] as unknown[]];
          for(let page=2;page<=pagination.pages;page++){const next=await zernioRequest<Record<string,unknown>>(`${path}&page=${page}`);if(Array.isArray(next[field]))rows.push(...next[field] as unknown[]);}
          payload[field]=rows;
        }
        const overview=payload.overview as {lastSync?:string}|undefined;
        if(overview?.lastSync && (!sync.lastSuccessAt || overview.lastSync>sync.lastSuccessAt))sync.lastSuccessAt=overview.lastSync;
        return parseAnalyticsPayload({
          key,
          payload,
          requestedRangeStart,
          requestedRangeEnd,
        });
      } catch (reason) {
        const unavailable = classifyAnalyticsError(reason);
        return unavailableAnalyticsSource({
          key,
          ...unavailable,
          requestedRangeStart,
          requestedRangeEnd,
        });
      }
    };

    const sources = await Promise.all([
      loadSource("organic", `/analytics?${base}&source=late`),
      loadSource("external", `/analytics?${base}&source=external`),
      loadSource("paid", `/ads?${base}`),
    ]);

    // Persist one sourced observation per day/range so the analytics UI can
    // build real history instead of showing live totals with no timeline.
    try {
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const profileLookup = await supabaseAdmin
        .from("social_intelligence_profiles" as never)
        .select("id,metadata")
        .eq("workspace_id", data.workspaceId)
        .maybeSingle();

      let intelligenceProfile = profileLookup.data as { id: string; metadata?: Record<string, unknown> | null } | null;
      let historicalRangeStart: string | null = null;
      let historicalRangeEnd: string | null = null;
      let historicalRecordCount = 0;
      if (!intelligenceProfile) {
        const created = await supabaseAdmin
          .from("social_intelligence_profiles" as never)
          .insert({
            workspace_id: data.workspaceId,
            provider: "zernio",
            sync_state: "not_synced",
            analyzed_sources: [],
            requested_range_start: requestedRangeStart,
            requested_range_end: requestedRangeEnd,
            record_count: 0,
            last_attempt_at: now,
            metadata: {},
          } as never)
          .select("id")
          .single();
        if (!created.error) intelligenceProfile = { ...(created.data as { id: string }), metadata: {} };
      }

      if (intelligenceProfile) {
        const existingMetadata = intelligenceProfile.metadata ?? {};
        const previousBackfill = existingMetadata.historicalBackfill as
          | { completedAt?: string; availableRangeStart?: string; availableRangeEnd?: string; dailyRecords?: number }
          | undefined;
        historicalRangeStart = previousBackfill?.availableRangeStart ?? null;
        historicalRangeEnd = previousBackfill?.availableRangeEnd ?? null;
        historicalRecordCount = Number(previousBackfill?.dailyRecords ?? 0);

        // Initial onboarding backfill: request two provider-supported windows so
        // a newly connected workspace can analyze up to ~2 years immediately.
        if (!previousBackfill?.completedAt) {
          type DashboardDaily = {
            date?: string;
            impressions?: number;
            reach?: number;
            engagement?: number;
            views?: number;
            followersGained?: number;
          };
          type DashboardPost = {
            postId?: string;
            platform?: string;
            publishedAt?: string;
            metrics?: Record<string, unknown>;
          };
          type DashboardPayload = {
            daily?: DashboardDaily[];
            topPosts?: DashboardPost[];
            recentPosts?: DashboardPost[];
            dataAsOf?: string;
          };

          const end = new Date();
          const newestEnd = end.toISOString().slice(0, 10);
          const newestStartDate = new Date(end);
          newestStartDate.setUTCDate(newestStartDate.getUTCDate() - 365);
          const newestStart = newestStartDate.toISOString().slice(0, 10);
          const olderEndDate = new Date(newestStartDate);
          olderEndDate.setUTCDate(olderEndDate.getUTCDate() - 1);
          const olderEnd = olderEndDate.toISOString().slice(0, 10);
          const olderStartDate = new Date(olderEndDate);
          olderStartDate.setUTCDate(olderStartDate.getUTCDate() - 365);
          const olderStart = olderStartDate.toISOString().slice(0, 10);
          const windows = [
            { fromDate: olderStart, toDate: olderEnd },
            { fromDate: newestStart, toDate: newestEnd },
          ];

          const dashboardResults: DashboardPayload[] = [];
          for (const window of windows) {
            try {
              const params = new URLSearchParams({
                profileId: profile.profile_id,
                fromDate: window.fromDate,
                toDate: window.toDate,
                topPosts: "25",
                recentPosts: "25",
              });
              dashboardResults.push(
                await zernioRequest<DashboardPayload>(`/analytics/dashboard?${params}`),
              );
            } catch (reason) {
              const failure = classifyAnalyticsError(reason);
              if (!["unsupported", "permission_missing"].includes(failure.availability)) throw reason;
            }
          }

          const allDaily = dashboardResults
            .flatMap((result) => result.daily ?? [])
            .filter((row) => typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));

          if (allDaily.length) {
            const capturedAt = now;
            const backfillRows = allDaily.flatMap((row) => {
              const values: Array<[string, number | undefined]> = [
                ["impressions", row.impressions],
                ["reach", row.reach],
                ["views", row.views],
                ["engagements", row.engagement],
                ["followers_gained", row.followersGained],
              ];
              return values.flatMap(([metricKey, rawValue]) => {
                const value = Number(rawValue);
                if (!Number.isFinite(value) || value < 0) return [];
                return [{
                  workspace_id: data.workspaceId,
                  profile_id: intelligenceProfile!.id,
                  metric_key: metricKey,
                  provider: "zernio",
                  availability: value === 0 ? "true_zero" : "available",
                  value,
                  unit: "count",
                  range_start: row.date,
                  range_end: row.date,
                  record_count: 1,
                  captured_at: capturedAt,
                  source_reference: "zernio analytics dashboard daily",
                  calculation_version: "waveos-zernio-dashboard-daily-v1",
                  evidence: {
                    coverage: "complete",
                    mode: "combined",
                    historicalBackfill: true,
                  },
                }];
              });
            });

            // Keep inserts comfortably below request-size limits.
            for (let index = 0; index < backfillRows.length; index += 500) {
              const saved = await supabaseAdmin
                .from("social_intelligence_snapshots" as never)
                .insert(backfillRows.slice(index, index + 500) as never);
              if (saved.error) throw saved.error;
            }

            historicalRangeStart = allDaily[0]?.date ?? null;
            historicalRangeEnd = allDaily.at(-1)?.date ?? null;
            historicalRecordCount = allDaily.length;
            const topPosts = dashboardResults
              .flatMap((result) => result.topPosts ?? [])
              .filter((post) => post.postId && post.publishedAt)
              .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
              .slice(0, 40);

            const metadata = {
              ...existingMetadata,
              historicalBackfill: {
                completedAt: now,
                requestedRangeStart: olderStart,
                requestedRangeEnd: newestEnd,
                availableRangeStart: historicalRangeStart,
                availableRangeEnd: historicalRangeEnd,
                dailyRecords: historicalRecordCount,
                topPosts,
                dataAsOf: dashboardResults.map((result) => result.dataAsOf).filter(Boolean).at(-1) ?? null,
              },
            };
            const metadataUpdate = await supabaseAdmin
              .from("social_intelligence_profiles" as never)
              .update({ metadata } as never)
              .eq("workspace_id", data.workspaceId);
            if (metadataUpdate.error) throw metadataUpdate.error;
            intelligenceProfile.metadata = metadata;
          }
        }

        const latestCombined = await supabaseAdmin
          .from("social_intelligence_snapshots" as never)
          .select("captured_at,range_start,range_end,evidence")
          .eq("workspace_id", data.workspaceId)
          .eq("profile_id", intelligenceProfile.id)
          .eq("range_start", requestedRangeStart)
          .eq("range_end", requestedRangeEnd)
          .contains("evidence" as never, { mode: "combined" } as never)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const previous = latestCombined.data as { captured_at?: string } | null;
        const alreadyCapturedToday = previous?.captured_at?.slice(0, 10) === today;

        if (!alreadyCapturedToday) {
          const modes = [
            { mode: "combined", selected: sources },
            { mode: "organic", selected: sources.filter((source) => source.key !== "paid") },
            { mode: "paid", selected: sources.filter((source) => source.key === "paid") },
          ] as const;

          const snapshotRows = modes.flatMap(({ mode, selected }) => {
            const sourceReference = selected.map((source) => source.sourceReference).join(" + ");
            const recordCount = selected.reduce((sum, source) => sum + source.recordCount, 0);
            const metricRows: Array<Record<string, unknown> & { metric_key: string }> = ANALYTICS_METRIC_KEYS.map((metricKey) => {
              const metric = combineAnalyticsMetric(selected, metricKey);
              return {
                workspace_id: data.workspaceId,
                profile_id: intelligenceProfile!.id,
                metric_key: metricKey,
                provider: "zernio",
                availability: metric.availability,
                value: metric.value,
                unit: "count",
                range_start: requestedRangeStart,
                range_end: requestedRangeEnd,
                record_count: recordCount,
                captured_at: now,
                source_reference: sourceReference || "publishing-provider",
                calculation_version: "waveos-combined-provider-sources-v1",
                evidence: {
                  coverage: metric.coverage,
                  mode,
                  contributingSources: metric.contributingSources,
                  expectedSources: metric.expectedSources,
                },
              };
            });
            const engagements = deriveEngagements(selected);
            metricRows.push({
              workspace_id: data.workspaceId,
              profile_id: intelligenceProfile!.id,
              metric_key: "engagements",
              provider: "zernio",
              availability: engagements.availability,
              value: engagements.value,
              unit: "count",
              range_start: requestedRangeStart,
              range_end: requestedRangeEnd,
              record_count: recordCount,
              captured_at: now,
              source_reference: sourceReference || "publishing-provider",
              calculation_version: engagements.calculationVersion,
              evidence: {
                coverage: engagements.coverage,
                mode,
                contributingSources: engagements.contributingSources,
                expectedSources: engagements.expectedSources,
              },
            });
            return metricRows;
          });

          const saved = await supabaseAdmin
            .from("social_intelligence_snapshots" as never)
            .insert(snapshotRows as never);
          if (saved.error) throw saved.error;
        }

        const availableSources = sources.filter((source) =>
          ["available", "true_zero"].includes(source.availability),
        );
        const availableStarts = sources
          .map((source) => source.availableRangeStart)
          .filter((value): value is string => Boolean(value))
          .sort();
        const availableEnds = sources
          .map((source) => source.availableRangeEnd)
          .filter((value): value is string => Boolean(value))
          .sort();

        const profileState =
          availableSources.length === sources.length
            ? "available"
            : availableSources.length
              ? "partial"
              : sync.state === "available"
                ? "not_synced"
                : sync.state;
        const profileUpdate = await supabaseAdmin
          .from("social_intelligence_profiles" as never)
          .update({
            sync_state: profileState,
            analyzed_sources: availableSources.map((source) => source.key),
            requested_range_start: requestedRangeStart,
            requested_range_end: requestedRangeEnd,
            available_range_start: historicalRangeStart ?? availableStarts[0] ?? null,
            available_range_end: historicalRangeEnd ?? availableEnds.at(-1) ?? null,
            record_count: historicalRecordCount || sources.reduce((sum, source) => sum + source.recordCount, 0),
            last_attempt_at: now,
            last_success_at: availableSources.length ? (sync.lastSuccessAt ?? now) : null,
            safe_error_code: availableSources.length ? null : String(sync.state),
            safe_error_message: availableSources.length ? null : sync.message,
            updated_at: now,
          } as never)
          .eq("workspace_id", data.workspaceId);
        if (profileUpdate.error) throw profileUpdate.error;
      }
    } catch (historyError) {
      console.warn("Historical analytics snapshot persistence failed", historyError);
    }

    return { sources, requestedRangeStart, requestedRangeEnd, sync };
  });

export const getSocialIntelligenceProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireWorkspaceFeatureAccess } = await import("./zernio.server");
    await requireWorkspaceFeatureAccess(
      context.supabase,
      context.userId,
      data.workspaceId,
      "can_view_analytics_checkup",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profileResult = await supabaseAdmin
      .from("social_intelligence_profiles" as never)
      .select(
        "id,provider,sync_state,analyzed_sources,requested_range_start,requested_range_end,available_range_start,available_range_end,record_count,last_attempt_at,last_success_at,safe_error_code,safe_error_message,updated_at",
      )
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (schemaIsUnavailable(profileResult.error)) {
      return {
        schemaAvailable: false,
        profile: null,
        snapshots: [],
        safeMessage: "Historical social intelligence is not available in this environment yet.",
      };
    }
    if (profileResult.error) throw profileResult.error;
    const profile = profileResult.data as {
      id: string;
      provider: string;
      sync_state: string;
      analyzed_sources: string[];
      requested_range_start: string | null;
      requested_range_end: string | null;
      available_range_start: string | null;
      available_range_end: string | null;
      record_count: number;
      last_attempt_at: string | null;
      last_success_at: string | null;
      safe_error_code: string | null;
      safe_error_message: string | null;
      updated_at: string;
    } | null;
    if (!profile) {
      return {
        schemaAvailable: true,
        profile: null,
        snapshots: [],
        safeMessage: "No historical social intelligence sync has been recorded for this workspace.",
      };
    }
    const snapshotRows: unknown[] = [];
    const pageSize = 1000;
    for (let start = 0; ; start += pageSize) {
      const snapshotResult = await supabaseAdmin
        .from("social_intelligence_snapshots" as never)
        .select(
          "id,metric_key,provider,availability,value,unit,range_start,range_end,record_count,captured_at,source_reference,calculation_version,evidence",
        )
        .eq("workspace_id", data.workspaceId)
        .eq("profile_id", profile.id)
        .order("range_end", { ascending: false })
        .order("captured_at", { ascending: false })
        .range(start, start + pageSize - 1);
      if (schemaIsUnavailable(snapshotResult.error)) {
        return {
          schemaAvailable: false,
          profile: null,
          snapshots: [],
          safeMessage: "Historical social intelligence is not available in this environment yet.",
        };
      }
      if (snapshotResult.error) throw snapshotResult.error;
      const page = (snapshotResult.data ?? []) as unknown[];
      snapshotRows.push(...page);
      if (page.length < pageSize) break;
    }
    type Snapshot = {
      id: string;
      metric_key: string;
      provider: string;
      availability: string;
      value: number | string | null;
      unit: string | null;
      range_start: string | null;
      range_end: string | null;
      record_count: number;
      captured_at: string;
      source_reference: string | null;
      calculation_version: string | null;
      evidence: { coverage?: string; mode?: string } | null;
    };
    return {
      schemaAvailable: true,
      profile,
      snapshots: (snapshotRows as Snapshot[]).map((row) => ({
        ...row,
        value: row.value === null || !Number.isFinite(Number(row.value)) ? null : Number(row.value),
      })),
      safeMessage: profile.safe_error_message,
    };
  });

export const getZernioCommentInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireSocialWorkspaceAccess, zernioRequest } = await import("./zernio.server");
    await requireSocialWorkspaceAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profileResult = await supabaseAdmin
      .from("zernio_profiles" as never)
      .select("profile_id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const profile = profileResult.data as { profile_id: string } | null;
    if (!profile) return { comments: [] };
    const payload = await zernioRequest<Record<string, unknown>>(
      `/inbox/comments?profileId=${encodeURIComponent(profile.profile_id)}&limit=25&sortBy=date&sortOrder=desc`,
    );
    const rows = Array.isArray(payload.comments)
      ? payload.comments
      : Array.isArray(payload.data)
        ? payload.data
        : [];
    return {
      comments: rows.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const row = value as Record<string, unknown>;
        const id = String(row.id ?? row.commentId ?? "");
        const postId = String(row.postId ?? row.platformPostId ?? "");
        const accountId = String(row.accountId ?? "");
        if (!id || !postId || !accountId) return [];
        return [
          {
            id,
            postId,
            accountId,
            platform: String(row.platform ?? ""),
            author: String(row.authorName ?? row.username ?? "Customer"),
            text: String(row.text ?? row.message ?? ""),
            createdAt: String(row.createdAt ?? row.date ?? ""),
          },
        ];
      }),
    };
  });

export const replyToZernioComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        postId: z.string().trim().min(1).max(512),
        commentId: z.string().trim().min(1).max(512),
        accountId: z.string().trim().min(1).max(512),
        message: z.string().trim().min(1).max(2_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requireSocialWorkspaceWriter, zernioRequest } = await import("./zernio.server");
    await requireSocialWorkspaceWriter(context.supabase, context.userId, data.workspaceId);
    // The replying social account must belong to this workspace.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owned } = await supabaseAdmin
      .from("social_connections")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "zernio")
      .eq("provider_account_id", data.accountId)
      .eq("connected", true)
      .limit(1)
      .maybeSingle();
    if (!owned) throw new Error("forbidden");
    await zernioRequest(`/inbox/comments/${encodeURIComponent(data.postId)}`, {
      method: "POST",
      body: JSON.stringify({
        accountId: data.accountId,
        commentId: data.commentId,
        message: data.message,
      }),
    });
    return { replied: true };
  });

export const verifyZernioIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { verifyZernioApiKey } = await import("./zernio.server");
    return verifyZernioApiKey();
  });

export const getZernioWorkspaceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    const { requireSocialWorkspaceAccess, zernioConfigured } = await import("./zernio.server");
    await requireSocialWorkspaceAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("zernio_profiles" as never)
      .select("profile_id,profile_name,verified_at,last_synced_at,last_error")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const profile = result.data as ZernioProfileRow | null;
    const [{ data: limit }, { count: connectedAccounts }, subscriptionResult] = await Promise.all([
      context.supabase.rpc(
        "social_account_limit" as never,
        { _workspace_id: data.workspaceId } as never,
      ),
      supabaseAdmin
        .from("social_connections")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId)
        .eq("provider", "zernio")
        .eq("connected", true),
      supabaseAdmin
        .from("workspace_social_subscriptions" as never)
        .select("plan,status,trial_ends_at,current_period_end")
        .eq("workspace_id", data.workspaceId)
        .maybeSingle(),
    ]);
    return {
      configured: zernioConfigured(),
      hasProfile: Boolean(profile),
      profileName: profile?.profile_name ?? null,
      verifiedAt: profile?.verified_at ?? null,
      lastSyncedAt: profile?.last_synced_at ?? null,
      lastError: profile?.last_error ?? null,
      accountLimit: Number(limit ?? 0),
      connectedAccounts: connectedAccounts ?? 0,
      subscription: subscriptionResult.data as {
        plan: string;
        status: string;
        trial_ends_at: string | null;
        current_period_end: string | null;
      } | null,
    };
  });

export const ensureZernioProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    const { requireSocialWorkspaceManager, zernioRequest } = await import("./zernio.server");
    await requireSocialWorkspaceManager(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existingResult = await supabaseAdmin
      .from("zernio_profiles" as never)
      .select("profile_id,profile_name")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const existing = existingResult.data as Pick<
      ZernioProfileRow,
      "profile_id" | "profile_name"
    > | null;
    if (existing) return { profileName: existing.profile_name, existed: true };

    const { data: workspace, error } = await supabaseAdmin
      .from("workspaces")
      .select("name")
      .eq("id", data.workspaceId)
      .single();
    if (error || !workspace) throw new Error("Workspace not found.");

    const response = await zernioRequest<{ profile?: { _id?: string; name?: string } }>(
      "/profiles",
      {
        method: "POST",
        body: JSON.stringify({ name: workspace.name }),
      },
    );
    const profileId = String(response.profile?._id ?? "");
    if (!profileId) throw new Error("Zernio did not return a profile ID.");
    const now = new Date().toISOString();
    const saved = await supabaseAdmin.from("zernio_profiles" as never).insert({
      workspace_id: data.workspaceId,
      profile_id: profileId,
      profile_name: response.profile?.name ?? workspace.name,
      verified_at: now,
      last_synced_at: now,
      last_error: null,
    } as never);
    if (saved.error) throw saved.error;
    return { profileName: response.profile?.name ?? workspace.name, existed: false };
  });

export const createZernioConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      workspaceId: string;
      platform: SocialPlatform;
      additional?: boolean;
      instagramLoginMethod?: "instagram_login" | "facebook_login";
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { requireSocialWorkspaceManager, toZernioPlatform, waveOsPublicOrigin, zernioRequest } =
      await import("./zernio.server");
    await requireSocialWorkspaceManager(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.platform === "snapchat" || data.platform === "bluesky") {
      throw new Error("This network is not currently available in WaveOS.");
    }
    const [{ data: limit }, { count: connectedAccounts }, existingConnections, subscriptionResult] =
      await Promise.all([
        context.supabase.rpc(
          "social_account_limit" as never,
          { _workspace_id: data.workspaceId } as never,
        ),
        supabaseAdmin
          .from("social_connections")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", data.workspaceId)
          .eq("provider", "zernio")
          .eq("connected", true),
        supabaseAdmin
          .from("social_connections")
          .select("id,connected,raw")
          .eq("workspace_id", data.workspaceId)
          .eq("provider", "zernio")
          .eq("platform", data.platform)
          .eq("connected", true),
        supabaseAdmin
          .from("workspace_social_subscriptions" as never)
          .select("plan")
          .eq("workspace_id", data.workspaceId)
          .maybeSingle(),
      ]);
    const existingPlatformAccounts = existingConnections.data ?? [];
    const plan = (subscriptionResult.data as { plan?: string } | null)?.plan;
    if (data.additional && plan !== "expanded") {
      throw new Error("Additional accounts from the same social network are available on Tidal.");
    }
    if (!data.additional && existingPlatformAccounts.length > 0) {
      return { alreadyConnected: true, url: null, accountId: null };
    }
    if (
      (data.additional || existingPlatformAccounts.length === 0) &&
      (connectedAccounts ?? 0) >= Number(limit ?? 0)
    ) {
      throw new Error(
        `This plan allows ${Number(limit ?? 0)} connected social accounts. Upgrade or disconnect one first.`,
      );
    }
    const profileResult = await supabaseAdmin
      .from("zernio_profiles" as never)
      .select("profile_id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    let profile = profileResult.data as { profile_id: string } | null;
    if (!profile) throw new Error("Prepare this workspace's secure social connection first.");
    if (data.additional) {
      const [{ data: workspace }, { data: existingSlots }] = await Promise.all([
        supabaseAdmin.from("workspaces").select("name").eq("id", data.workspaceId).single(),
        supabaseAdmin
          .from("zernio_workspace_subprofiles" as never)
          .select("slot,profile_id,profile_name")
          .eq("workspace_id", data.workspaceId)
          .eq("platform", data.platform),
      ]);
      const slots = (existingSlots ?? []) as Array<{
        slot: number;
        profile_id: string;
        profile_name: string;
      }>;
      const connectedProfileIds = new Set(
        existingPlatformAccounts
          .map((row) => (row.raw as { profileId?: unknown } | null)?.profileId)
          .filter((value): value is string => typeof value === "string"),
      );
      const reusable = slots.find((row) => !connectedProfileIds.has(row.profile_id));
      if (reusable) {
        profile = { profile_id: reusable.profile_id };
      }
      const occupied = new Set(slots.map((row) => row.slot));
      const slot = Array.from({ length: 7 }, (_, index) => index + 2).find(
        (candidate) => !occupied.has(candidate),
      );
      if (!reusable) {
        if (!slot) throw new Error("No additional Tidal account slot is available.");
        const profileName = `${workspace?.name ?? "WaveOS"} · ${data.platform} ${slot} · ${data.workspaceId.slice(0, 8)}`;
        const created = await zernioRequest<{ profile?: { _id?: string; name?: string } }>(
          "/profiles",
          {
            method: "POST",
            body: JSON.stringify({ name: profileName, description: "WaveOS Tidal account space" }),
          },
        );
        const profileId = created.profile?._id;
        if (!profileId) throw new Error("The publishing service did not return an account space.");
        const saved = await supabaseAdmin.from("zernio_workspace_subprofiles" as never).insert({
          workspace_id: data.workspaceId,
          platform: data.platform,
          slot,
          profile_id: profileId,
          profile_name: created.profile?.name ?? profileName,
        } as never);
        if (saved.error) throw saved.error;
        profile = { profile_id: profileId };
      }
    }
    const appBaseUrl = waveOsPublicOrigin();
    const params = new URLSearchParams({
      profileId: profile.profile_id,
      redirect_url: `${appBaseUrl}/social-connections/callback?workspaceId=${encodeURIComponent(data.workspaceId)}&provider=zernio&platform=${encodeURIComponent(data.platform)}`,
    });
    if (data.platform === "instagram" && data.instagramLoginMethod) {
      params.set("loginMethod", data.instagramLoginMethod);
    }
    const response = await zernioRequest<Record<string, unknown>>(
      `/connect/${encodeURIComponent(toZernioPlatform(data.platform))}?${params}`,
    );
    return {
      alreadyConnected: response.alreadyConnected === true,
      url: typeof response.authUrl === "string" ? response.authUrl : null,
      accountId: typeof response.accountId === "string" ? response.accountId : null,
    };
  });

export const disconnectZernioAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { workspaceId: string; platform: SocialPlatform; connectionId?: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const { requireSocialWorkspaceManager, zernioRequest } = await import("./zernio.server");
    await requireSocialWorkspaceManager(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let connectionQuery = supabaseAdmin
      .from("social_connections")
      .select("id,provider_account_id")
      .eq("workspace_id", data.workspaceId)
      .eq("platform", data.platform)
      .eq("provider", "zernio");
    connectionQuery = data.connectionId
      ? connectionQuery.eq("id", data.connectionId)
      : connectionQuery.limit(1);
    const result = await connectionQuery.maybeSingle();
    if (result.error) throw result.error;
    const connection = result.data as { id: string; provider_account_id: string | null } | null;
    if (!connection?.provider_account_id) throw new Error("This social account is not connected.");

    try {
      await zernioRequest(`/accounts/${encodeURIComponent(connection.provider_account_id)}`, {
        method: "DELETE",
      });
    } catch (reason) {
      const error = reason as Error & { status?: number };
      if (error.status !== 404) throw error;
    }

    const update = await supabaseAdmin
      .from("social_connections")
      .update({
        connected: false,
        connection_state: "not_connected",
        provider_account_id: null,
        display_name: null,
        username: null,
        avatar_url: null,
        raw: {},
        last_synced_at: new Date().toISOString(),
      } as never)
      .eq("workspace_id", data.workspaceId)
      .eq("id", connection.id)
      .eq("provider", "zernio");
    if (update.error) throw update.error;
    return { disconnected: true };
  });

export const refreshZernioConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    const {
      fromZernioPlatform,
      normalizeZernioAccounts,
      requireSocialWorkspaceAccess,
      zernioRequest,
    } = await import("./zernio.server");
    await requireSocialWorkspaceAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profileResult = await supabaseAdmin
      .from("zernio_profiles" as never)
      .select("profile_id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const profile = profileResult.data as { profile_id: string } | null;
    if (!profile) return { updated: 0, profileMissing: true };

    try {
      const { data: subprofiles } = await supabaseAdmin
        .from("zernio_workspace_subprofiles" as never)
        .select("profile_id")
        .eq("workspace_id", data.workspaceId);
      const profileIds = [
        profile.profile_id,
        ...((subprofiles ?? []) as Array<{ profile_id: string }>).map((row) => row.profile_id),
      ];
      const payloads = await Promise.all(
        profileIds.map((profileId) => {
          const params = new URLSearchParams({ profileId, page: "1", limit: "100" });
          return zernioRequest<Record<string, unknown>>(`/accounts?${params}`);
        }),
      );
      const accounts = payloads.flatMap((response, index) =>
        normalizeZernioAccounts(response).filter(
          (account) => !account.profileId || account.profileId === profileIds[index],
        ),
      );
      const healthRows = await Promise.all(
        accounts.map(async (account) => {
          try {
            const health = await zernioRequest<Record<string, unknown>>(
              `/accounts/${encodeURIComponent(account.id)}/health`,
            );
            return [account.id, health] as const;
          } catch (reason) {
            return [
              account.id,
              {
                status: "error",
                issues: [reason instanceof Error ? reason.message : "Health check failed"],
              },
            ] as const;
          }
        }),
      );
      const healthById = new Map(healthRows);
      const now = new Date().toISOString();
      const rows = accounts.flatMap((account) => {
        const platform = fromZernioPlatform(account.platform);
        if (!platform) return [];
        const health = healthById.get(account.id) ?? {};
        const healthStatus = String(health.status ?? account.status).toLowerCase();
        const needsReconnect = health.needsReconnect === true;
        const state = needsReconnect
          ? "expired"
          : healthStatus === "error"
            ? "error"
            : healthStatus === "warning"
              ? "action_required"
              : account.connected
                ? "connected"
                : "not_connected";
        return [
          {
            workspace_id: data.workspaceId,
            platform,
            display_name: account.displayName,
            username: account.username,
            avatar_url: account.avatarUrl,
            connected: state === "connected" || state === "action_required",
            last_synced_at: now,
            provider: "zernio",
            provider_account_id: account.id,
            connection_state: state,
            raw: { ...account.raw, health },
          },
        ];
      });

      await supabaseAdmin
        .from("social_connections")
        .update({ connected: false, connection_state: "not_connected" } as never)
        .eq("workspace_id", data.workspaceId);
      if (rows.length) {
        const upsert = await supabaseAdmin.from("social_connections").upsert(rows as never, {
          onConflict: "workspace_id,provider,provider_account_id",
        });
        if (upsert.error) throw upsert.error;
      }
      await supabaseAdmin
        .from("zernio_profiles" as never)
        .update({ verified_at: now, last_synced_at: now, last_error: null } as never)
        .eq("workspace_id", data.workspaceId);
      return { updated: rows.length, profileMissing: false };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Social account sync failed.";
      await supabaseAdmin
        .from("zernio_profiles" as never)
        .update({ last_error: message } as never)
        .eq("workspace_id", data.workspaceId);
      throw new Error(message);
    }
  });
