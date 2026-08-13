import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/frameio/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { encryptExternalToken, externalMediaEnv } = await import("@/lib/external-media.server");
        const { frameioEnv, frameioRedirectUri } = await import("@/lib/frameio.server");
        const appUrl = externalMediaEnv("WAVEOS_APP_URL").replace(/\/$/, "");
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("frameio_oauth_states" as never)
          .select("user_id")
          .eq("state", state)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        const oauthState = data as unknown as { user_id: string } | null;
        if (!oauthState || !code)
          return Response.redirect(`${appUrl}/settings?frameio_error=invalid_state`, 302);

        const tokenResponse = await fetch("https://ims-na1.adobelogin.com/ims/token/v3", {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${frameioEnv("FRAMEIO_CLIENT_ID")}:${frameioEnv("FRAMEIO_CLIENT_SECRET")}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            code,
            grant_type: "authorization_code",
            redirect_uri: frameioRedirectUri(),
          }),
        });
        const tokens = (await tokenResponse.json()) as Record<string, unknown>;
        if (
          !tokenResponse.ok ||
          typeof tokens.access_token !== "string" ||
          typeof tokens.refresh_token !== "string"
        ) {
          return Response.redirect(`${appUrl}/settings?frameio_error=token_exchange`, 302);
        }

        const profileResponse = await fetch("https://api.frame.io/v4/me", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const profileJson = (await profileResponse.json()) as Record<string, unknown>;
        const profile =
          profileJson.data && typeof profileJson.data === "object"
            ? (profileJson.data as Record<string, unknown>)
            : profileJson;
        const externalUserId = String(profile.id ?? profile.user_id ?? "");
        if (!profileResponse.ok || !externalUserId)
          return Response.redirect(`${appUrl}/settings?frameio_error=profile`, 302);

        const { error } = await supabaseAdmin
          .from("frameio_service_connections" as never)
          .upsert({
            id: true,
            external_user_id: externalUserId,
            account_email: typeof profile.email === "string" ? profile.email : null,
            access_token_encrypted: await encryptExternalToken(tokens.access_token),
            refresh_token_encrypted: await encryptExternalToken(tokens.refresh_token),
            token_expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
            scopes: typeof tokens.scope === "string" ? tokens.scope : "",
            connected_by: oauthState.user_id,
            updated_at: new Date().toISOString(),
          } as never, { onConflict: "id" });
        await supabaseAdmin.from("frameio_oauth_states" as never).delete().eq("state", state);
        if (error)
          return Response.redirect(`${appUrl}/settings?frameio_error=connection_save`, 302);
        return Response.redirect(`${appUrl}/settings?frameio_connected=true`, 302);
      },
    },
  },
});
