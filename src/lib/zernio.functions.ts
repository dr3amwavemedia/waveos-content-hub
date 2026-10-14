import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SocialPlatform } from "@/hooks/use-content";
import {
  classifyAnalyticsError,
  parseAnalyticsPayload,
  unavailableAnalyticsSource,
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
      return { sources, requestedRangeStart, requestedRangeEnd };
    }
    const base = new URLSearchParams({
      profileId: profile.profile_id,
      fromDate: requestedRangeStart,
      toDate: requestedRangeEnd,
    });
    const loadSource = async (key: AnalyticsSourceKey, path: string): Promise<AnalyticsSource> => {
      try {
        const payload = await zernioRequest<Record<string, unknown>>(path);
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
    return { sources, requestedRangeStart, requestedRangeEnd };
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
    const snapshotResult = await supabaseAdmin
      .from("social_intelligence_snapshots" as never)
      .select(
        "id,metric_key,provider,availability,value,unit,range_start,range_end,record_count,captured_at,source_reference,calculation_version",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("profile_id", profile.id)
      .order("captured_at", { ascending: false })
      .limit(100);
    if (schemaIsUnavailable(snapshotResult.error)) {
      return {
        schemaAvailable: false,
        profile: null,
        snapshots: [],
        safeMessage: "Historical social intelligence is not available in this environment yet.",
      };
    }
    if (snapshotResult.error) throw snapshotResult.error;
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
    };
    const latest = new Map<string, Snapshot>();
    for (const row of (snapshotResult.data ?? []) as Snapshot[]) {
      if (!latest.has(row.metric_key)) latest.set(row.metric_key, row);
    }
    return {
      schemaAvailable: true,
      profile,
      snapshots: [...latest.values()].map((row) => ({
        ...row,
        value: row.value === null ? null : Number(row.value),
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
