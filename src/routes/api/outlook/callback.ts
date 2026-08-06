import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/outlook/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { encryptOutlook, outlookDb, outlookEnv, outlookRedirectUri } =
          await import("@/lib/outlook.server");
        const appUrl = outlookEnv("WAVEOS_APP_URL").replace(/\/$/, "");
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const { data: stateRow } = await outlookDb
          .from("outlook_oauth_states")
          .select("*")
          .eq("state", state)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        if (!stateRow || !code)
          return Response.redirect(`${appUrl}/outlook?error=invalid_state`, 302);
        await outlookDb.from("outlook_oauth_states").delete().eq("state", state);

        const tokenResponse = await fetch(
          `https://login.microsoftonline.com/${outlookEnv("OUTLOOK_TENANT_ID")}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: outlookEnv("OUTLOOK_CLIENT_ID"),
              client_secret: outlookEnv("OUTLOOK_CLIENT_SECRET"),
              grant_type: "authorization_code",
              code,
              code_verifier: stateRow.code_verifier,
              redirect_uri: outlookRedirectUri(),
              scope: "openid profile email offline_access User.Read Calendars.ReadWrite Mail.Send",
            }),
          },
        );
        const tokens = await tokenResponse.json();
        if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
          return Response.redirect(`${appUrl}/outlook?error=token_exchange`, 302);
        }
        const meResponse = await fetch(
          "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        );
        const me = await meResponse.json();
        if (!meResponse.ok || !me.id)
          return Response.redirect(`${appUrl}/outlook?error=profile`, 302);
        await outlookDb.from("outlook_connections").upsert({
          user_id: stateRow.user_id,
          microsoft_user_id: me.id,
          email: me.mail ?? me.userPrincipalName,
          access_token_encrypted: await encryptOutlook(tokens.access_token),
          refresh_token_encrypted: await encryptOutlook(tokens.refresh_token),
          token_expires_at: new Date(
            Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
          ).toISOString(),
          scopes: tokens.scope ?? "",
          updated_at: new Date().toISOString(),
        });
        return Response.redirect(`${appUrl}/outlook?connected=1`, 302);
      },
    },
  },
});
