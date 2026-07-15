import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AYRSHARE_BASE = "https://api.ayrshare.com/api";

function envReady() {
  return {
    apiKey: process.env.AYRSHARE_API_KEY ?? "",
    domain: process.env.AYRSHARE_DOMAIN ?? "",
    appBaseUrl: process.env.APP_BASE_URL ?? "",
    ready: Boolean(process.env.AYRSHARE_API_KEY),
  };
}

async function ayrshare(
  path: string,
  init: Omit<RequestInit, "body"> & { profileKey?: string; body?: unknown } = {},
) {
  const { apiKey } = envReady();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (init.profileKey) headers.set("Profile-Key", init.profileKey);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${AYRSHARE_BASE}${path}`, {
    ...init,
    headers,
    body: init.body ? (typeof init.body === "string" ? init.body : JSON.stringify(init.body)) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* text response */ }
  if (!res.ok) {
    const message = (json as { message?: string } | null)?.message ?? text ?? `Ayrshare ${res.status}`;
    throw new Error(message);
  }
  return json as Record<string, unknown>;
}

/** Diagnostic — checks whether Ayrshare secrets are configured. Safe for staff to call. */
export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isStaff = (roles ?? []).some((r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team");
    if (!isStaff) throw new Error("forbidden");

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
    const { supabase, userId } = context;
    const cfg = envReady();
    if (!cfg.ready) throw new Error("Ayrshare is not configured yet.");

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
    if (!prof) throw new Error("profile_missing");

    const res = await ayrshare("/profiles/generateJWT", {
      method: "POST",
      body: {
        domain: cfg.domain || undefined,
        privateKey: process.env.AYRSHARE_PRIVATE_KEY,
        profileKey: prof.profile_key,
      },
    }).catch((e) => { throw new Error(`Connect URL failed: ${(e as Error).message}`); });

    return { url: String((res as Record<string, unknown>).url ?? "") };
  });

/** Pull connected accounts from Ayrshare and mirror non-secret metadata into social_connections. */
export const refreshSocialConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
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
