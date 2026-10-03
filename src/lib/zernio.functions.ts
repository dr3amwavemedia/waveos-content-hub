import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SocialPlatform } from "@/hooks/use-content";

type ZernioProfileRow = {
  profile_id: string;
  profile_name: string;
  verified_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};

const METRIC_KEYS = [
  "followers",
  "impressions",
  "reach",
  "likes",
  "comments",
  "shares",
  "saves",
  "clicks",
  "views",
  "storyViews",
] as const;

function sumMetrics(payload: Record<string, unknown>) {
  const totals = Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])) as Record<
    (typeof METRIC_KEYS)[number],
    number
  >;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    const row = value as Record<string, unknown>;
    for (const key of METRIC_KEYS) {
      const candidate = Number(row[key] ?? (key === "storyViews" ? row.story_views : undefined));
      if (Number.isFinite(candidate) && candidate > 0) totals[key] += candidate;
    }
  };
  visit(payload.analytics ?? payload.overview ?? payload.data ?? payload.posts ?? payload);
  return totals;
}

export const getZernioAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string; days?: 7 | 30 | 90 }) => data)
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
    if (!profile) return { organic: null, external: null, paid: null, paidAvailable: false };
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - (data.days ?? 30) * 86_400_000);
    const base = new URLSearchParams({
      profileId: profile.profile_id,
      fromDate: fromDate.toISOString().slice(0, 10),
      toDate: toDate.toISOString().slice(0, 10),
    });
    const [organicPayload, externalPayload] = await Promise.all([
      zernioRequest<Record<string, unknown>>(`/analytics?${base}&source=late`),
      zernioRequest<Record<string, unknown>>(`/analytics?${base}&source=external`),
    ]);
    let paid: ReturnType<typeof sumMetrics> | null = null;
    try {
      const adsPayload = await zernioRequest<Record<string, unknown>>(`/ads?${base}`);
      paid = sumMetrics(adsPayload);
    } catch (reason) {
      const error = reason as Error & { status?: number };
      if (![400, 403, 404].includes(error.status ?? 0)) throw reason;
    }
    return {
      organic: sumMetrics(organicPayload),
      external: sumMetrics(externalPayload),
      paid,
      paidAvailable: Boolean(paid),
    };
  });

export const getZernioCommentInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { workspaceId: string }) => data)
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
  .validator(
    (data: {
      workspaceId: string;
      postId: string;
      commentId: string;
      accountId: string;
      message: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { requireSocialWorkspaceAccess, zernioRequest } = await import("./zernio.server");
    await requireSocialWorkspaceAccess(context.supabase, context.userId, data.workspaceId);
    if (!data.message.trim()) throw new Error("Reply cannot be empty.");
    await zernioRequest(`/inbox/comments/${encodeURIComponent(data.postId)}`, {
      method: "POST",
      body: JSON.stringify({
        accountId: data.accountId,
        commentId: data.commentId,
        message: data.message.trim(),
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
    const { requireSocialWorkspaceAccess, zernioRequest } = await import("./zernio.server");
    await requireSocialWorkspaceAccess(context.supabase, context.userId, data.workspaceId);
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
  .validator((data: { workspaceId: string; platform: SocialPlatform }) => data)
  .handler(async ({ data, context }) => {
    const { requireSocialWorkspaceAccess, toZernioPlatform, waveOsPublicOrigin, zernioRequest } =
      await import("./zernio.server");
    await requireSocialWorkspaceAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.platform === "snapchat") {
      throw new Error("Snapchat connections are still a closed Zernio beta.");
    }
    const [{ data: limit }, { count: connectedAccounts }, existingConnection] = await Promise.all([
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
        .select("connected")
        .eq("workspace_id", data.workspaceId)
        .eq("provider", "zernio")
        .eq("platform", data.platform)
        .maybeSingle(),
    ]);
    if (
      !(existingConnection.data as { connected?: boolean } | null)?.connected &&
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
    const profile = profileResult.data as { profile_id: string } | null;
    if (!profile) throw new Error("Create this workspace's Zernio profile first.");
    const appBaseUrl = waveOsPublicOrigin();
    const params = new URLSearchParams({
      profileId: profile.profile_id,
      redirect_url: `${appBaseUrl}/social-connections/callback?workspaceId=${encodeURIComponent(data.workspaceId)}&provider=zernio`,
    });
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
  .validator((data: { workspaceId: string; platform: SocialPlatform }) => data)
  .handler(async ({ data, context }) => {
    const { requireSocialWorkspaceAccess, zernioRequest } = await import("./zernio.server");
    await requireSocialWorkspaceAccess(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("social_connections")
      .select("provider_account_id")
      .eq("workspace_id", data.workspaceId)
      .eq("platform", data.platform)
      .eq("provider", "zernio")
      .maybeSingle();
    if (result.error) throw result.error;
    const connection = result.data as { provider_account_id: string | null } | null;
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
      .eq("platform", data.platform)
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
      const params = new URLSearchParams({
        profileId: profile.profile_id,
        page: "1",
        limit: "100",
      });
      const response = await zernioRequest<Record<string, unknown>>(`/accounts?${params}`);
      const accounts = normalizeZernioAccounts(response).filter(
        (account) => !account.profileId || account.profileId === profile.profile_id,
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
        const upsert = await supabaseAdmin
          .from("social_connections")
          .upsert(rows as never, { onConflict: "workspace_id,platform" });
        if (upsert.error) throw upsert.error;
      }
      await supabaseAdmin
        .from("zernio_profiles" as never)
        .update({ verified_at: now, last_synced_at: now, last_error: null } as never)
        .eq("workspace_id", data.workspaceId);
      return { updated: rows.length, profileMissing: false };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Zernio sync failed.";
      await supabaseAdmin
        .from("zernio_profiles" as never)
        .update({ last_error: message } as never)
        .eq("workspace_id", data.workspaceId);
      throw new Error(message);
    }
  });
