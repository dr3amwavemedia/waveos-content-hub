import {
  adminClient,
  authenticatedStaffUser,
  corsHeaders,
  encrypt,
  env,
  json,
  redirectUri,
} from "../_shared/outlook.ts";

const appUrl = () => env("WAVEOS_APP_URL").replace(/\/$/, "");
const randomValue = (length = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};
const challenge = async (verifier: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  const admin = adminClient();

  try {
    if (url.pathname.endsWith("/callback")) {
      const state = url.searchParams.get("state") ?? "";
      const code = url.searchParams.get("code") ?? "";
      const { data: stateRow } = await admin
        .from("outlook_oauth_states")
        .select("*")
        .eq("state", state)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (!stateRow || !code)
        return Response.redirect(`${appUrl()}/outlook?error=invalid_state`, 302);
      await admin.from("outlook_oauth_states").delete().eq("state", state);

      const tokenResponse = await fetch(
        `https://login.microsoftonline.com/${env("OUTLOOK_TENANT_ID")}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: env("OUTLOOK_CLIENT_ID"),
            client_secret: env("OUTLOOK_CLIENT_SECRET"),
            grant_type: "authorization_code",
            code,
            code_verifier: stateRow.code_verifier,
            redirect_uri: redirectUri(),
            scope: "openid profile email offline_access User.Read Calendars.ReadWrite Mail.Send",
          }),
        },
      );
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
        return Response.redirect(`${appUrl()}/outlook?error=token_exchange`, 302);
      }
      const meResponse = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      );
      const me = await meResponse.json();
      if (!meResponse.ok || !me.id)
        return Response.redirect(`${appUrl()}/outlook?error=profile`, 302);

      await admin.from("outlook_connections").upsert({
        user_id: stateRow.user_id,
        microsoft_user_id: me.id,
        email: me.mail ?? me.userPrincipalName,
        access_token_encrypted: await encrypt(tokens.access_token),
        refresh_token_encrypted: await encrypt(tokens.refresh_token),
        token_expires_at: new Date(
          Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
        ).toISOString(),
        scopes: tokens.scope ?? "",
        updated_at: new Date().toISOString(),
      });
      return Response.redirect(`${appUrl()}/outlook?connected=1`, 302);
    }

    const user = await authenticatedStaffUser(request);
    if (!user) return json({ error: "not_authenticated" }, 401);
    const payload = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    if (payload.action === "disconnect") {
      await admin.from("outlook_connections").delete().eq("user_id", user.id);
      return json({ connected: false });
    }
    if (payload.action === "connect") {
      const verifier = randomValue(64);
      const state = randomValue(32);
      await admin.from("outlook_oauth_states").delete().eq("user_id", user.id);
      await admin.from("outlook_oauth_states").insert({
        state,
        user_id: user.id,
        code_verifier: verifier,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      const authorize = new URL(
        `https://login.microsoftonline.com/${env("OUTLOOK_TENANT_ID")}/oauth2/v2.0/authorize`,
      );
      authorize.search = new URLSearchParams({
        client_id: env("OUTLOOK_CLIENT_ID"),
        response_type: "code",
        redirect_uri: redirectUri(),
        response_mode: "query",
        scope: "openid profile email offline_access User.Read Calendars.ReadWrite Mail.Send",
        state,
        code_challenge: await challenge(verifier),
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();
      return json({ url: authorize.toString() });
    }
    const { data } = await admin
      .from("outlook_connections")
      .select("email,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    return json({ connected: Boolean(data), connection: data ?? null });
  } catch (error) {
    console.error(error);
    return json({ error: "outlook_oauth_failed" }, 500);
  }
});
