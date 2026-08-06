import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://clsuecactijyjecxwuxp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsc3VlY2FjdGlqeWplY3h3dXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwODMyMjQsImV4cCI6MjA5OTY1OTIyNH0.7lfS3KCgoSVRz9fPhN3xwzLKTZKVgUxnA_myRLXC8Q4";

export const outlookPublicDb = () =>
  createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });

const userDb = (token: string) =>
  createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });

export function outlookEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export const outlookRedirectUri = () =>
  `${outlookEnv("WAVEOS_APP_URL").replace(/\/$/, "")}/api/outlook/callback`;

const key = async () => {
  const raw = Buffer.from(outlookEnv("OUTLOOK_TOKEN_ENCRYPTION_KEY"), "base64");
  if (raw.byteLength !== 32) throw new Error("OUTLOOK_TOKEN_ENCRYPTION_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
};

export async function encryptOutlook(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(),
    new TextEncoder().encode(value),
  );
  return `${Buffer.from(iv).toString("base64")}.${Buffer.from(encrypted).toString("base64")}`;
}

export async function decryptOutlook(value: string) {
  const [iv, encrypted] = value.split(".");
  if (!iv || !encrypted) throw new Error("Invalid encrypted token");
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, "base64") },
    await key(),
    Buffer.from(encrypted, "base64"),
  );
  return new TextDecoder().decode(clear);
}

export async function requireOutlookStaff(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const db = userDb(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: role } = await db
    .from("user_roles")
    .select("id")
    .eq("user_id", data.user.id)
    .in("role", ["dream_wave_owner", "dream_wave_team"])
    .limit(1)
    .maybeSingle();
  return role ? { user: data.user, db } : null;
}

export async function outlookGraphToken(userId: string, db: ReturnType<typeof userDb>) {
  const { data: connection, error } = await db
    .from("outlook_connections")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !connection) throw new Error("outlook_not_connected");
  if (new Date(connection.token_expires_at).getTime() > Date.now() + 120_000) {
    return decryptOutlook(connection.access_token_encrypted);
  }

  const refreshToken = await decryptOutlook(connection.refresh_token_encrypted);
  const response = await fetch(
    `https://login.microsoftonline.com/${outlookEnv("OUTLOOK_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: outlookEnv("OUTLOOK_CLIENT_ID"),
        client_secret: outlookEnv("OUTLOOK_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        redirect_uri: outlookRedirectUri(),
        scope:
          "openid profile email offline_access User.Read Calendars.ReadWrite Mail.ReadWrite Mail.Send",
      }),
    },
  );
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token) throw new Error("outlook_reconnect_required");
  await db
    .from("outlook_connections")
    .update({
      access_token_encrypted: await encryptOutlook(tokens.access_token),
      refresh_token_encrypted: await encryptOutlook(tokens.refresh_token ?? refreshToken),
      token_expires_at: new Date(
        Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
      ).toISOString(),
      scopes: tokens.scope ?? connection.scopes,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return tokens.access_token as string;
}
