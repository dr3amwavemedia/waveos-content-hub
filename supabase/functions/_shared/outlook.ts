import { createClient } from "npm:@supabase/supabase-js@2.110.2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticatedStaffUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data.user) return null;
  const { data: role } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", data.user.id)
    .in("role", ["dream_wave_owner", "dream_wave_team"])
    .limit(1)
    .maybeSingle();
  return role ? data.user : null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const raw = base64ToBytes(env("OUTLOOK_TOKEN_ENCRYPTION_KEY"));
  if (raw.byteLength !== 32) throw new Error("OUTLOOK_TOKEN_ENCRYPTION_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decrypt(value: string) {
  const [iv, encrypted] = value.split(".");
  if (!iv || !encrypted) throw new Error("Invalid encrypted token");
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(encrypted),
  );
  return new TextDecoder().decode(clear);
}

export const redirectUri = () => `${env("SUPABASE_URL")}/functions/v1/outlook-oauth/callback`;

export async function graphToken(userId: string) {
  const admin = adminClient();
  const { data: connection, error } = await admin
    .from("outlook_connections")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !connection) throw new Error("outlook_not_connected");

  if (new Date(connection.token_expires_at).getTime() > Date.now() + 120_000) {
    return decrypt(connection.access_token_encrypted);
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${env("OUTLOOK_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("OUTLOOK_CLIENT_ID"),
        client_secret: env("OUTLOOK_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: await decrypt(connection.refresh_token_encrypted),
        redirect_uri: redirectUri(),
        scope: "openid profile email offline_access User.Read Calendars.ReadWrite Mail.Send",
      }),
    },
  );
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token) throw new Error("outlook_reconnect_required");
  await admin
    .from("outlook_connections")
    .update({
      access_token_encrypted: await encrypt(tokens.access_token),
      refresh_token_encrypted: await encrypt(
        tokens.refresh_token ?? (await decrypt(connection.refresh_token_encrypted)),
      ),
      token_expires_at: new Date(
        Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
      ).toISOString(),
      scopes: tokens.scope ?? connection.scopes,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return tokens.access_token as string;
}
