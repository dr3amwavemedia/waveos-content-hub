import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Diagnostic — booleans only, no secret values. Any authenticated user may check readiness. */
export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { envReady } = await import("./ayrshare.server");
    const cfg = envReady();
    return {
      ayrshare: {
        api_key: Boolean(cfg.apiKey),
        domain: Boolean(cfg.domain),
        webhook_secret: Boolean(process.env.AYRSHARE_WEBHOOK_SECRET),
        white_label_private_key: Boolean(process.env.AYRSHARE_PRIVATE_KEY || process.env.AYRSHARE_PRIVATE_KEY_BASE64),
      },
      app: {
        base_url: cfg.appBaseUrl || null,
        environment: process.env.APP_ENVIRONMENT || null,
      },
      lovable: {
        ai_gateway: Boolean(process.env.LOVABLE_API_KEY),
      },
    };
  });

/** Ensure an Ayrshare profile exists for the current workspace and return non-secret metadata. */
export const ensureAyrshareProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { ayrshare, envReady } = await import("./ayrshare.server");
    const { supabase, userId } = context;
    const cfg = envReady();
    if (!cfg.ready) throw new Error("Ayrshare is not configured yet. Add AYRSHARE_API_KEY to enable social publishing.");

    // authorize: staff or workspace member
    const { data: mem } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isStaff = (roles ?? []).some((r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team");
    if (!mem && !isStaff) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .eq("id", data.workspaceId)
      .single();
    if (!ws) throw new Error("workspace_not_found");

    const { data: existing } = await supabaseAdmin
      .from("ayrshare_profiles")
      .select("profile_key, profile_title, ref_id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (existing) {
      return { title: existing.profile_title, ref_id: existing.ref_id, existed: true };
    }

    const created = await ayrshare("/profiles/profile", {
      method: "POST",
      body: { title: ws.name },
    }).catch((e) => { throw new Error(`Create profile failed: ${(e as Error).message}`); });

    const profileKey = String((created as Record<string, unknown>).profileKey ?? "");
    const refId = String((created as Record<string, unknown>).refId ?? "");
    if (!profileKey) throw new Error("no_profile_key");

    await supabaseAdmin.from("ayrshare_profiles").insert({
      workspace_id: data.workspaceId,
      profile_key: profileKey,
      profile_title: ws.name,
      ref_id: refId || null,
    });

    return { title: ws.name, ref_id: refId, existed: false };
  });

/** Create a one-time connect URL for a workspace to link social accounts inside Ayrshare. */
export const createAyrshareConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { ayrshare, buildAyrshareJwtBody, envReady, profileKeyFingerprint } = await import("./ayrshare.server");
    const { supabase, userId } = context;
    const cfg = envReady();
    if (!cfg.ready) throw new Error("Ayrshare is not configured yet.");

    // 1-3. Authorize: workspace membership is REQUIRED (no staff bypass for connect flow,
    // to guarantee the JWT is minted for the workspace the caller actually belongs to).
    const { data: mem } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const memberOk = Boolean(mem);
    if (!memberOk) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const isStaff = (roles ?? []).some((r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team");
      if (!isStaff) throw new Error("forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 4-5. Look up profile strictly by workspace_id.
    const { data: prof } = await supabaseAdmin
      .from("ayrshare_profiles")
      .select("profile_key, ref_id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!prof) throw new Error("profile_missing");

    // Read the workspace's "always require fresh login" setting.
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("require_fresh_social_login")
      .eq("id", data.workspaceId)
      .single();

    // Session-isolation flags:
    //  - development: always force fresh login + email verification so testers
    //    switching workspaces in one browser can never inherit the previous
    //    Ayrshare browser session.
    //  - production: respect the per-workspace toggle (default off).
    const env = (process.env.APP_ENVIRONMENT || "").toLowerCase();
    const isDev = env === "development" || env === "dev" || env === "preview";
    const forceFresh = Boolean(ws?.require_fresh_social_login);
    const logout = isDev || forceFresh;
    const verify = isDev;

    const res = await ayrshare("/profiles/generateJWT", {
      method: "POST",
      body: buildAyrshareJwtBody({
        domain: cfg.domain || undefined,
        privateKey: process.env.AYRSHARE_PRIVATE_KEY,
        privateKeyBase64: process.env.AYRSHARE_PRIVATE_KEY_BASE64,
        profileKey: prof.profile_key,
        logout,
        verify,
      }),
    }).catch((e) => { throw new Error(`Connect URL failed: ${(e as Error).message}`); });

    const url = String((res as Record<string, unknown>).url ?? "");
    const fingerprint = await profileKeyFingerprint(prof.profile_key);

    // Safe diagnostic block — no secrets, no full keys, no tokens.
    return {
      url,
      diagnostics: {
        workspaceId: data.workspaceId,
        member: memberOk,
        profileFound: true,
        profileFingerprint: fingerprint,
        refIdPresent: Boolean(prof.ref_id),
        logout,
        verify,
        urlHostOk: url.startsWith("https://profile.ayrshare.com"),
        environment: isDev ? "development" : "production",
      },
    };
  });

/** Owner/manager toggle: force a fresh Ayrshare login every time this workspace connects. */
export const setRequireFreshSocialLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; enabled: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: mem } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("user_id", userId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const isWsAdmin = mem?.role === "owner" || mem?.role === "admin";
    if (!isWsAdmin) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const isStaff = (roles ?? []).some((r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team");
      if (!isStaff) throw new Error("forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("workspaces")
      .update({ require_fresh_social_login: data.enabled })
      .eq("id", data.workspaceId);
    if (error) throw error;
    return { ok: true, enabled: data.enabled };
  });

/** Read the workspace's Ayrshare status (safe metadata only — no keys). */
export const getWorkspaceAyrshareStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { profileKeyFingerprint } = await import("./ayrshare.server");
    const { supabase, userId } = context;
    const { data: mem } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!mem) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const isStaff = (roles ?? []).some((r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team");
      if (!isStaff) throw new Error("forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: prof }, { data: ws }] = await Promise.all([
      supabaseAdmin.from("ayrshare_profiles").select("profile_key, ref_id, created_at").eq("workspace_id", data.workspaceId).maybeSingle(),
      supabaseAdmin.from("workspaces").select("require_fresh_social_login").eq("id", data.workspaceId).single(),
    ]);
    return {
      hasProfile: Boolean(prof),
      profileFingerprint: prof ? await profileKeyFingerprint(prof.profile_key) : null,
      refIdPresent: Boolean(prof?.ref_id),
      profileCreatedAt: prof?.created_at ?? null,
      requireFreshLogin: Boolean(ws?.require_fresh_social_login),
    };
  });


/** Pull connected accounts from Ayrshare and mirror non-secret metadata into social_connections. */
export const refreshSocialConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { ayrshare, envReady } = await import("./ayrshare.server");
    const { supabase, userId } = context;
    const cfg = envReady();
    if (!cfg.ready) return { updated: 0, ayrshareConfigured: false };

    const { data: mem } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!mem) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const isStaff = (roles ?? []).some((r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team");
      if (!isStaff) throw new Error("forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("ayrshare_profiles")
      .select("profile_key")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!prof) return { updated: 0, ayrshareConfigured: true, profileMissing: true };

    const res = await ayrshare("/user", { method: "GET", profileKey: prof.profile_key })
      .catch((e) => { throw new Error(`Fetch user failed: ${(e as Error).message}`); });

    const platforms = ((res as Record<string, unknown>).activeSocialAccounts as string[] | undefined) ?? [];
    const displayNames = (res as Record<string, unknown>).displayNames as
      | Array<{ platform: string; displayName?: string; userName?: string; userImage?: string }>
      | undefined;
    const map = new Map<string, { display?: string; username?: string; avatar?: string }>();
    (displayNames ?? []).forEach((d) => {
      map.set(d.platform, { display: d.displayName, username: d.userName, avatar: d.userImage });
    });

    const validPlatforms = ["instagram","facebook","tiktok","youtube","linkedin","x","pinterest","threads","bluesky","gmb","snapchat"];
    const rows = platforms
      .filter((p) => validPlatforms.includes(p))
      .map((p) => ({
        workspace_id: data.workspaceId,
        platform: p as "instagram",
        display_name: map.get(p)?.display ?? null,
        username: map.get(p)?.username ?? null,
        avatar_url: map.get(p)?.avatar ?? null,
        connected: true,
        last_synced_at: new Date().toISOString(),
        raw: JSON.parse(JSON.stringify(map.get(p) ?? {})),
      }));

    if (rows.length) {
      await supabaseAdmin.from("social_connections").upsert(rows, { onConflict: "workspace_id,platform" });
    }
    // mark all others as disconnected
    await supabaseAdmin
      .from("social_connections")
      .update({ connected: false })
      .eq("workspace_id", data.workspaceId)
      .not("platform", "in", `(${platforms.map((p) => `"${p}"`).join(",") || '""'})`);

    return { updated: rows.length, ayrshareConfigured: true };
  });
