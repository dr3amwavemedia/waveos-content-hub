import { createFileRoute } from "@tanstack/react-router";

function oauthResult(
  appUrl: string,
  provider: string,
  result: { connected?: boolean; error?: string },
) {
  const destination = new URL("/settings", appUrl);
  if (result.connected) destination.searchParams.set("storage_connected", provider);
  if (result.error) destination.searchParams.set("storage_error", result.error);
  const message = JSON.stringify({
    type: "waveos:external-media-oauth",
    provider,
    ...result,
  }).replaceAll("<", "\\u003c");
  const destinationJson = JSON.stringify(destination.toString()).replaceAll("<", "\\u003c");
  const originJson = JSON.stringify(new URL(appUrl).origin);
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Returning to WaveOS</title></head><body><p>Returning to WaveOS…</p><script>(function(){var message=${message};var destination=${destinationJson};var origin=${originJson};if(window.opener&&!window.opener.closed){window.opener.postMessage(message,origin);window.close();setTimeout(function(){location.replace(destination)},500)}else{location.replace(destination)}})();</script></body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'",
      },
    },
  );
}

export const Route = createFileRoute("/api/external-media/$provider/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const provider = params.provider;
        const {
          encryptExternalToken,
          externalMediaEnv,
          externalMediaRequestOrigin,
          externalMediaRedirectUri,
          hasGoogleDriveScope,
        } = await import("@/lib/external-media.server");
        const appUrl = externalMediaRequestOrigin(request);
        if (provider !== "google_drive" && provider !== "dropbox")
          return oauthResult(appUrl, provider, { error: "unsupported_provider" });
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
        if (!oauthState || !code) return oauthResult(appUrl, provider, { error: "invalid_state" });

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
              redirect_uri: externalMediaRedirectUri(provider, appUrl),
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
              redirect_uri: externalMediaRedirectUri(provider, appUrl),
            }),
          });
        }
        const tokens = (await tokenResponse.json()) as Record<string, unknown>;
        if (!tokenResponse.ok || typeof tokens.access_token !== "string") {
          return oauthResult(appUrl, provider, { error: "token_exchange" });
        }

        if (
          provider === "google_drive" &&
          !hasGoogleDriveScope(typeof tokens.scope === "string" ? tokens.scope : "")
        ) {
          await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: tokens.access_token as string }),
          }).catch(() => undefined);
          await supabaseAdmin
            .from("external_media_oauth_states" as never)
            .delete()
            .eq("state", state);
          return oauthResult(appUrl, provider, { error: "google_scope_required" });
        }

        let externalAccountId = "";
        let accountEmail: string | null = null;
        if (provider === "google_drive") {
          const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          const profile = (await profileResponse.json()) as Record<string, unknown>;
          if (!profileResponse.ok || typeof profile.sub !== "string")
            return oauthResult(appUrl, provider, { error: "profile" });
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
            return oauthResult(appUrl, provider, { error: "profile" });
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
            : ((existing.data as unknown as { refresh_token_encrypted?: string } | null)
                ?.refresh_token_encrypted ?? null);
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
                Date.now() +
                  Number(tokens.expires_in ?? (provider === "dropbox" ? 14400 : 3600)) * 1000,
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
        if (saveError) return oauthResult(appUrl, provider, { error: "connection_save" });
        return oauthResult(appUrl, provider, { connected: true });
      },
    },
  },
});
