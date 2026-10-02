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
    return {
      configured: zernioConfigured(),
      hasProfile: Boolean(profile),
      profileName: profile?.profile_name ?? null,
      verifiedAt: profile?.verified_at ?? null,
      lastSyncedAt: profile?.last_synced_at ?? null,
      lastError: profile?.last_error ?? null,
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
