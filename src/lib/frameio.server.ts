import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { decryptExternalToken, encryptExternalToken, externalMediaEnv } from "@/lib/external-media.server";

export const frameioEnv = (name: "FRAMEIO_CLIENT_ID" | "FRAMEIO_CLIENT_SECRET") =>
  externalMediaEnv(name);

export const frameioRedirectUri = () =>
  process.env.FRAMEIO_REDIRECT_URI ??
  `${externalMediaEnv("WAVEOS_APP_URL").replace(/\/$/, "")}/api/frameio/callback`;

function bearer(request: Request) {
  const value = request.headers.get("Authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

export async function requireDreamWaveOwner(request: Request) {
  const token = bearer(request);
  if (!token) return null;
  const url = process.env.SUPABASE_URL ?? "https://clsuecactijyjecxwuxp.supabase.co";
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_PUBLISHABLE_KEY");
  const db = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data: auth } = await db.auth.getUser(token);
  if (!auth.user) return null;
  const { data: roles } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id);
  if (!(roles ?? []).some((row) => row.role === "dream_wave_owner")) return null;
  return { user: auth.user, token };
}

type StoredConnection = {
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
};

export async function frameioAccessToken() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("frameio_service_connections" as never)
    .select("access_token_encrypted,refresh_token_encrypted,token_expires_at")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  const connection = data as unknown as StoredConnection | null;
  if (!connection) throw new Error("frameio_not_connected");
  if (new Date(connection.token_expires_at).getTime() > Date.now() + 120_000)
    return decryptExternalToken(connection.access_token_encrypted);

  const response = await fetch("https://ims-na1.adobelogin.com/ims/token/v3", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${frameioEnv("FRAMEIO_CLIENT_ID")}:${frameioEnv("FRAMEIO_CLIENT_SECRET")}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: await decryptExternalToken(connection.refresh_token_encrypted),
    }),
  });
  const tokens = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof tokens.access_token !== "string")
    throw new Error("frameio_reconnect_required");
  const patch: Record<string, unknown> = {
    access_token_encrypted: await encryptExternalToken(tokens.access_token),
    token_expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (typeof tokens.refresh_token === "string")
    patch.refresh_token_encrypted = await encryptExternalToken(tokens.refresh_token);
  const { error: updateError } = await supabaseAdmin
    .from("frameio_service_connections" as never)
    .update(patch as never)
    .eq("id", true);
  if (updateError) throw updateError;
  return tokens.access_token;
}

type FrameioPage<T> = { data?: T[]; links?: { next?: string | null } };

async function frameioGet<T>(path: string, experimental = false) {
  const response = await fetch(`https://api.frame.io${path}`, {
    headers: {
      Authorization: `Bearer ${await frameioAccessToken()}`,
      ...(experimental ? { "api-version": "experimental" } : {}),
    },
  });
  const result = (await response.json()) as T;
  if (!response.ok) throw new Error(`frameio_api_${response.status}`);
  return result;
}

async function frameioPages<T>(path: string) {
  const items: T[] = [];
  let next: string | null = path;
  for (let page = 0; next && page < 20; page += 1) {
    const result: FrameioPage<T> = await frameioGet<FrameioPage<T>>(next);
    items.push(...(Array.isArray(result.data) ? result.data : []));
    next = typeof result.links?.next === "string" ? result.links.next : null;
  }
  return items;
}

const comparableShareUrl = (value: string) => {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "").toLowerCase();
};

export async function resolveFrameioShare(shareUrl: string) {
  const accounts = await frameioPages<{ id: string }>("/v4/accounts?page_size=100");
  const target = comparableShareUrl(shareUrl);
  for (const account of accounts) {
    const projects = await frameioPages<{ id: string }>(
      `/v4/accounts/${encodeURIComponent(account.id)}/projects?page_size=100`,
    );
    for (const project of projects) {
      const shares = await frameioPages<{
        id: string;
        short_url: string;
        enabled: boolean;
        downloading_enabled: boolean;
      }>(
        `/v4/accounts/${encodeURIComponent(account.id)}/projects/${encodeURIComponent(project.id)}/shares?page_size=100`,
      );
      const share = shares.find((item) => comparableShareUrl(item.short_url) === target);
      if (share) {
        if (!share.enabled) throw new Error("frameio_share_disabled");
        if (!share.downloading_enabled) throw new Error("frameio_share_downloads_required");
        return { accountId: account.id, projectId: project.id, shareId: share.id };
      }
    }
  }
  throw new Error("frameio_share_not_found");
}

export type FrameioFile = {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  thumbnailUrl: string | null;
  viewUrl: string | null;
};

export async function listFrameioShareFiles(accountId: string, shareId: string) {
  const result = await frameioGet<FrameioPage<Record<string, unknown>>>(
    `/v4/accounts/${encodeURIComponent(accountId)}/shares/${encodeURIComponent(shareId)}/assets?page_size=100&include=media_links.thumbnail`,
    true,
  );
  return (result.data ?? [])
    .map((entry): FrameioFile | null => {
      const links = (entry.media_links ?? {}) as Record<string, Record<string, unknown> | undefined>;
      const mediaType = String(entry.media_type ?? "application/octet-stream");
      if (!/^(image|video)\//.test(mediaType) || entry.type !== "file") return null;
      return {
        id: String(entry.id ?? ""),
        name: String(entry.name ?? "Untitled"),
        mediaType,
        sizeBytes: Number(entry.file_size ?? 0),
        thumbnailUrl:
          typeof links.thumbnail?.url === "string" ? links.thumbnail.url : null,
        viewUrl: typeof entry.view_url === "string" ? entry.view_url : null,
      };
    })
    .filter((file): file is FrameioFile => Boolean(file?.id));
}

export async function frameioFileOriginalUrl(accountId: string, fileId: string) {
  const result = await frameioGet<{ data?: Record<string, unknown> }>(
    `/v4/accounts/${encodeURIComponent(accountId)}/files/${encodeURIComponent(fileId)}?include=media_links.original`,
    true,
  );
  const data = result.data ?? {};
  const links = (data.media_links ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const url = links.original?.inline_url ?? links.original?.download_url;
  if (typeof url !== "string") throw new Error("frameio_file_not_ready");
  return url;
}
