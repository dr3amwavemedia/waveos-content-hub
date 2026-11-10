import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  decryptExternalToken,
  encryptExternalToken,
  externalMediaEnv,
} from "@/lib/external-media.server";
import { frameioThumbnailLink } from "@/lib/frameio-media-preview";

export const frameioEnv = (name: "FRAMEIO_CLIENT_ID" | "FRAMEIO_CLIENT_SECRET") =>
  externalMediaEnv(name);

export const frameioRedirectUri = () =>
  process.env.FRAMEIO_REDIRECT_URI ??
  `${new URL(externalMediaEnv("WAVEOS_APP_URL")).origin}/api/frameio/callback`;

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
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
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

type FrameioPage<T> = {
  data?: T[];
  links?: { next?: string | null };
  total_count?: number;
};

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

function frameioPagePath(path: string, stickyQuery: Record<string, string>) {
  const url = new URL(path, "https://api.frame.io");
  if (url.origin !== "https://api.frame.io" || !url.pathname.startsWith("/v4/")) {
    throw new Error("frameio_invalid_pagination_link");
  }
  for (const [key, value] of Object.entries(stickyQuery)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

async function frameioPages<T>(
  path: string,
  options: { experimental?: boolean; stickyQuery?: Record<string, string> } = {},
) {
  const items: T[] = [];
  const stickyQuery = options.stickyQuery ?? {};
  let next: string | null = frameioPagePath(path, stickyQuery);
  const seen = new Set<string>();
  for (let page = 0; next; page += 1) {
    if (page >= 500) throw new Error("frameio_pagination_limit");
    const requestPath = frameioPagePath(next, stickyQuery);
    if (seen.has(requestPath)) throw new Error("frameio_pagination_loop");
    seen.add(requestPath);
    const result: FrameioPage<T> = await frameioGet<FrameioPage<T>>(
      requestPath,
      options.experimental,
    );
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
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  folderPath: string[];
};

const FRAMEIO_LIST_QUERY = {
  page_size: "100",
  include_total_count: "true",
  include: "media_links.thumbnail",
};

function frameioEntryFile(entry: Record<string, unknown>, folderPath: string[]): FrameioFile | null {
  if (entry.type !== "file" || !entry.id) return null;
  const links = (entry.media_links ?? {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const metadata =
    entry.metadata && typeof entry.metadata === "object"
      ? (entry.metadata as Record<string, unknown>)
      : {};
  return {
    id: String(entry.id),
    name: String(entry.name ?? "Untitled"),
    mediaType: String(entry.media_type ?? "application/octet-stream"),
    sizeBytes: Number(entry.file_size ?? 0),
    thumbnailUrl: frameioThumbnailLink(links),
    viewUrl: typeof entry.view_url === "string" ? entry.view_url : null,
    width: positiveFrameioNumber(entry.width ?? metadata.width),
    height: positiveFrameioNumber(entry.height ?? metadata.height),
    durationSeconds: frameioDurationSeconds(entry.duration ?? metadata.duration),
    folderPath,
  };
}

export async function listFrameioShareFiles(accountId: string, shareId: string) {
  const rootEntries = await frameioPages<Record<string, unknown>>(
    `/v4/accounts/${encodeURIComponent(accountId)}/shares/${encodeURIComponent(shareId)}/assets`,
    { experimental: true, stickyQuery: FRAMEIO_LIST_QUERY },
  );
  const files = new Map<string, FrameioFile>();
  const containers: Array<{ type: "folder" | "version_stack"; id: string; path: string[] }> = [];
  const visitedContainers = new Set<string>();

  const collect = (entries: Record<string, unknown>[], folderPath: string[]) => {
    for (const entry of entries) {
      const file = frameioEntryFile(entry, folderPath);
      if (file) {
        if (!files.has(file.id)) files.set(file.id, file);
        continue;
      }
      const type = entry.type;
      if ((type === "folder" || type === "version_stack") && entry.id) {
        containers.push({
          type,
          id: String(entry.id),
          path: [...folderPath, String(entry.name ?? (type === "folder" ? "Folder" : "Versions"))],
        });
      }
    }
  };

  collect(rootEntries, []);
  for (let index = 0; index < containers.length; index += 1) {
    if (containers.length > 10_000 || files.size > 100_000) {
      throw new Error("frameio_share_too_large");
    }
    const container = containers[index]!;
    const key = `${container.type}:${container.id}`;
    if (visitedContainers.has(key)) continue;
    visitedContainers.add(key);
    const segment = container.type === "folder" ? "folders" : "version_stacks";
    const children = await frameioPages<Record<string, unknown>>(
      `/v4/accounts/${encodeURIComponent(accountId)}/${segment}/${encodeURIComponent(container.id)}/children`,
      {
        // Version-stack children moved to the stable V4 API in September 2025.
        experimental: container.type === "folder",
        stickyQuery: FRAMEIO_LIST_QUERY,
      },
    );
    collect(children, container.path);
  }

  return [...files.values()];
}

function positiveFrameioNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function frameioDurationSeconds(value: unknown) {
  const duration = positiveFrameioNumber(value);
  if (duration === null) return null;
  return duration > 10_000 ? duration / 1000 : duration;
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

/**
 * Fresh, short-lived thumbnail link for one Frame.io file (V4 show-file).
 * Returns null when Frame.io has not produced a thumbnail yet.
 */
export async function frameioFileThumbnailUrl(accountId: string, fileId: string) {
  const result = await frameioGet<{ data?: Record<string, unknown> }>(
    `/v4/accounts/${encodeURIComponent(accountId)}/files/${encodeURIComponent(fileId)}?include=media_links.thumbnail`,
    true,
  );
  return frameioThumbnailLink((result.data ?? {}).media_links);
}
