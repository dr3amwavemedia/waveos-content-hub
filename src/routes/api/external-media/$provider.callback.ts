import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/external-media/$provider/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const provider = params.provider;
        const {
          encryptExternalToken,
          externalMediaEnv,
          externalMediaRedirectUri,
        } = await import("@/lib/external-media.server");
        const appUrl = externalMediaEnv("WAVEOS_APP_URL").replace(/\/$/, "");
        if (provider !== "google_drive" && provider !== "dropbox")
          return Response.redirect(`${appUrl}/settings?storage_error=unsupported_provider`, 302);
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: stateRow } = await supabaseAdmin
          .from("external_media_oauth_states" as never)
          .select("*")
          .eq("state", state)
          .eq("provider", provider)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        const oauthState = stateRow as unknown as {
          workspace_id: string;
          user_id: string;
          code_verifier: string;
        } | null;
        if (!oauthState || !code)
          return Response.redirect(`${appUrl}/settings?storage_error=invalid_state`, 302);

        let tokenResponse: Response;
        if (provider === "google_drive") {
          tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: externalMediaEnv("GOOGLE_DRIVE_CLIENT_ID"),
              client_secret: externalMediaEnv("GOOGLE_DRIVE_CLIENT_SECRET"),
              grant_type: "authorization_code",
              code,
              code_verifier: oauthState.code_verifier,
              redirect_uri: externalMediaRedirectUri(provider),
            }),
          });
        } else {
          tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(
                `${externalMediaEnv("DROPBOX_APP_KEY")}:${externalMediaEnv("DROPBOX_APP_SECRET")}`,
              ).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              code_verifier: oauthState.code_verifier,
              redirect_uri: externalMediaRedirectUri(provider),
            }),
          });
        }
        const tokens = (await tokenResponse.json()) as Record<string, unknown>;
        if (!tokenResponse.ok || typeof tokens.access_token !== "string") {
          return Response.redirect(`${appUrl}/settings?storage_error=token_exchange`, 302);
        }

        let externalAccountId = "";
        let accountEmail: string | null = null;
        if (provider === "google_drive") {
          const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          const profile = (await profileResponse.json()) as Record<string, unknown>;
          if (!profileResponse.ok || typeof profile.sub !== "string")
            return Response.redirect(`${appUrl}/settings?storage_error=profile`, 302);
          externalAccountId = profile.sub;
          accountEmail = typeof profile.email === "string" ? profile.email : null;
        } else {
          const profileResponse = await fetch(
            "https://api.dropboxapi.com/2/users/get_current_account",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            },
          );
          const profile = (await profileResponse.json()) as Record<string, unknown>;
          if (!profileResponse.ok || typeof profile.account_id !== "string")
            return Response.redirect(`${appUrl}/settings?storage_error=profile`, 302);
          externalAccountId = profile.account_id;
          accountEmail = typeof profile.email === "string" ? profile.email : null;
        }

        const existing = await supabaseAdmin
          .from("external_media_connections" as never)
          .select("refresh_token_encrypted")
          .eq("workspace_id", oauthState.workspace_id)
          .eq("provider", provider)
          .maybeSingle();
        const encryptedRefresh =
          typeof tokens.refresh_token === "string"
            ? await encryptExternalToken(tokens.refresh_token)
            : (existing.data as unknown as { refresh_token_encrypted?: string } | null)
                ?.refresh_token_encrypted ?? null;
        const { error: saveError } = await supabaseAdmin
          .from("external_media_connections" as never)
          .upsert(
            {
              workspace_id: oauthState.workspace_id,
              provider,
              external_account_id: externalAccountId,
              account_email: accountEmail,
              access_token_encrypted: await encryptExternalToken(tokens.access_token),
              refresh_token_encrypted: encryptedRefresh,
              token_expires_at: new Date(
                Date.now() + Number(tokens.expires_in ?? (provider === "dropbox" ? 14400 : 3600)) * 1000,
              ).toISOString(),
              scopes: typeof tokens.scope === "string" ? tokens.scope : "",
              created_by: oauthState.user_id,
              updated_at: new Date().toISOString(),
            } as never,
            { onConflict: "workspace_id,provider" },
          );
        await supabaseAdmin
          .from("external_media_oauth_states" as never)
          .delete()
          .eq("state", state);
        if (saveError)
          return Response.redirect(`${appUrl}/settings?storage_error=connection_save`, 302);
        return Response.redirect(`${appUrl}/settings?storage_connected=${provider}`, 302);
      },
    },
  },
});
