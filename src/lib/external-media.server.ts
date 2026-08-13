import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type ExternalMediaProvider = "google_drive" | "dropbox";

type ExternalConnection = {
  id: string;
  workspace_id: string;
  provider: ExternalMediaProvider;
  external_account_id: string;
  account_email: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scopes: string;
};

type ExternalAsset = {
  id: string;
  workspace_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  source_provider: ExternalMediaProvider;
  external_file_id: string;
  source_web_url: string | null;
};

const SUPABASE_URL = () =>
  process.env.SUPABASE_URL ?? "https://clsuecactijyjecxwuxp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = () => {
  const value = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!value) throw new Error("Missing SUPABASE_PUBLISHABLE_KEY");
  return value;
};

const userDb = (token: string) =>
  createClient<Database>(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });

export function externalMediaEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export const externalMediaRedirectUri = (provider: ExternalMediaProvider) =>
  `${externalMediaEnv("WAVEOS_APP_URL").replace(/\/$/, "")}/api/external-media/${provider}/callback`;

const encryptionKey = async () => {
  const encoded =
    process.env.EXTERNAL_MEDIA_TOKEN_ENCRYPTION_KEY ??
    process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Missing EXTERNAL_MEDIA_TOKEN_ENCRYPTION_KEY");
  const raw = Buffer.from(encoded, "base64");
  if (raw.byteLength !== 32)
    throw new Error("EXTERNAL_MEDIA_TOKEN_ENCRYPTION_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
};

export async function encryptExternalToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return `${Buffer.from(iv).toString("base64")}.${Buffer.from(encrypted).toString("base64")}`;
}

export async function decryptExternalToken(value: string) {
  const [iv, encrypted] = value.split(".");
  if (!iv || !encrypted) throw new Error("Invalid encrypted external-media token");
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, "base64") },
    await encryptionKey(),
    Buffer.from(encrypted, "base64"),
  );
  return new TextDecoder().decode(clear);
}

function authorizationToken(request: Request) {
  const header = request.headers.get("Authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function requireExternalMediaWorkspace(request: Request, workspaceId: string) {
  const token = authorizationToken(request);
  if (!token) return null;
  const db = userDb(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const [{ data: membership }, manageResult] = await Promise.all([
    db
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", data.user.id)
      .maybeSingle(),
    db.rpc("can_staff_manage_workspace" as never, {
      _user_id: data.user.id,
      _workspace_id: workspaceId,
    } as never),
  ]);
  const manageable = manageResult.data as unknown as boolean | null;
  if (!membership && manageable !== true) return null;
  return { user: data.user, db, token };
}

export function randomHex(bytes: number) {
  return crypto
    .getRandomValues(new Uint8Array(bytes))
    .reduce((value, byte) => value + byte.toString(16).padStart(2, "0"), "");
}

export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

export async function getExternalConnection(
  workspaceId: string,
  provider: ExternalMediaProvider,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("external_media_connections" as never)
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as ExternalConnection | null;
}

async function updateExternalConnection(id: string, patch: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("external_media_connections" as never)
    .update(patch as never)
    .eq("id", id);
  if (error) throw error;
}

export async function externalAccessToken(connection: ExternalConnection) {
  const current = await decryptExternalToken(connection.access_token_encrypted);
  if (
    !connection.token_expires_at ||
    new Date(connection.token_expires_at).getTime() > Date.now() + 120_000
  ) {
    return current;
  }
  if (!connection.refresh_token_encrypted) throw new Error("external_media_reconnect_required");
  const refreshToken = await decryptExternalToken(connection.refresh_token_encrypted);

  if (connection.provider === "google_drive") {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: externalMediaEnv("GOOGLE_DRIVE_CLIENT_ID"),
        client_secret: externalMediaEnv("GOOGLE_DRIVE_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok || typeof json.access_token !== "string")
      throw new Error("google_drive_reconnect_required");
    await updateExternalConnection(connection.id, {
      access_token_encrypted: await encryptExternalToken(json.access_token),
      token_expires_at: new Date(
        Date.now() + Number(json.expires_in ?? 3600) * 1000,
      ).toISOString(),
      updated_at: new Date().toISOString(),
    });
    return json.access_token;
  }

  const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${externalMediaEnv("DROPBOX_APP_KEY")}:${externalMediaEnv("DROPBOX_APP_SECRET")}`,
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof json.access_token !== "string")
    throw new Error("dropbox_reconnect_required");
  await updateExternalConnection(connection.id, {
    access_token_encrypted: await encryptExternalToken(json.access_token),
    token_expires_at: new Date(Date.now() + Number(json.expires_in ?? 14400) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return json.access_token;
}

export async function createExternalPublishingUrl(asset: ExternalAsset) {
  const connection = await getExternalConnection(asset.workspace_id, asset.source_provider);
  if (!connection) throw new Error(`${asset.source_provider}_not_connected`);
  const accessToken = await externalAccessToken(connection);

  if (asset.source_provider === "dropbox") {
    const response = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: asset.external_file_id }),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok || typeof json.link !== "string")
      throw new Error("dropbox_file_unavailable");
    return json.link;
  }

  // Keep private Drive files private: Ayrshare receives a short-lived WaveOS
  // relay URL, and WaveOS streams the bytes from Drive without storing them.
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(asset.external_file_id)}?fields=id`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  ).then((response) => {
    if (!response.ok) throw new Error("google_drive_file_unavailable");
  });
  return createExternalRelayUrl(asset.id);
}

function relaySecret() {
  return externalMediaEnv("EXTERNAL_MEDIA_RELAY_SECRET");
}

function relaySignature(payload: string) {
  return import("crypto").then(({ createHmac }) =>
    createHmac("sha256", relaySecret()).update(payload).digest("base64url"),
  );
}

export async function createExternalRelayUrl(assetId: string, lifetimeSeconds = 6 * 60 * 60) {
  const expires = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  const payload = `${assetId}.${expires}`;
  const signature = await relaySignature(payload);
  const url = new URL(
    `${externalMediaEnv("WAVEOS_APP_URL").replace(/\/$/, "")}/api/public/external-media/${assetId}`,
  );
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);
  return url.toString();
}

export async function verifyExternalRelay(assetId: string, expires: string, signature: string) {
  const expiresAt = Number(expires);
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = await relaySignature(`${assetId}.${expiresAt}`);
  const { timingSafeEqual } = await import("crypto");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function resolveMediaAssetUrl(asset: {
  id: string;
  workspace_id: string;
  name: string;
  storage_path: string | null;
  mime_type: string;
  size_bytes: number;
  source_provider?: string | null;
  external_file_id?: string | null;
  external_parent_id?: string | null;
  source_web_url?: string | null;
}) {
  const provider = asset.source_provider ?? "waveos";
  if (provider === "waveos") {
    if (!asset.storage_path) throw new Error(`asset_missing_path:${asset.id}`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage
      .from("media")
      .createSignedUrl(asset.storage_path, 60 * 60 * 24 * 7);
    if (error || !data?.signedUrl) throw new Error(`asset_unavailable:${asset.id}`);
    return data.signedUrl;
  }
  if (
    (provider !== "google_drive" && provider !== "dropbox" && provider !== "frameio") ||
    !asset.external_file_id
  ) {
    throw new Error(`asset_source_invalid:${asset.id}`);
  }
  if (provider === "frameio") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("workspace_frameio_sources" as never)
      .select("frameio_account_id,frameio_share_id,sync_status")
      .eq("workspace_id", asset.workspace_id)
      .maybeSingle();
    const source = data as unknown as {
      frameio_account_id: string | null;
      frameio_share_id: string | null;
      sync_status: string;
    } | null;
    if (
      !source?.frameio_account_id ||
      !source.frameio_share_id ||
      source.sync_status !== "ready" ||
      asset.external_parent_id !== source.frameio_share_id
    ) throw new Error("frameio_share_access_revoked");
    const { frameioFileOriginalUrl, listFrameioShareFiles } = await import("@/lib/frameio.server");
    const currentFiles = await listFrameioShareFiles(
      source.frameio_account_id,
      source.frameio_share_id,
    );
    if (!currentFiles.some((file) => file.id === asset.external_file_id))
      throw new Error("frameio_file_removed_from_share");
    return frameioFileOriginalUrl(source.frameio_account_id, asset.external_file_id);
  }
  return createExternalPublishingUrl({
    ...asset,
    source_provider: provider,
    external_file_id: asset.external_file_id,
    source_web_url: asset.source_web_url ?? null,
  });
}
