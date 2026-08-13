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
