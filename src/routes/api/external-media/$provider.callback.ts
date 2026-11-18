import { createFileRoute } from "@tanstack/react-router";

function oauthResult(
  appUrl: string,
  provider: string,
  result: { connected?: boolean; error?: string },
  destinationPath = "/settings",
) {
  const destination = new URL(destinationPath, appUrl);
  if (destinationPath === "/settings") {
    if (result.connected) destination.searchParams.set("storage_connected", provider);
    if (result.error) destination.searchParams.set("storage_error", result.error);
  }
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
          getExternalConnection,
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
          flow_kind: "connect" | "mobile_picker";
          return_path: string | null;
        } | null;
        if (!oauthState) return oauthResult(appUrl, provider, { error: "invalid_state" });
        const mobilePicker = provider === "google_drive" && oauthState.flow_kind === "mobile_picker";
        const mobileResult = async (result: { mediaIds?: string[]; error?: string }) => {
          await supabaseAdmin
            .from("external_media_oauth_states" as never)
            .delete()
            .eq("state", state);
          const { driveMobilePickerResultPath } = await import("@/lib/drive-picker-return");
          const path = driveMobilePickerResultPath(oauthState.return_path ?? "", result);
          return oauthResult(appUrl, provider, {}, path);
        };
        if (!code) {
          return mobilePicker
            ? mobileResult({ error: url.searchParams.get("error") ?? "picker_cancelled" })
            : oauthResult(appUrl, provider, { error: "invalid_state" });
        }

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
          return mobilePicker
            ? mobileResult({ error: "token_exchange" })
            : oauthResult(appUrl, provider, { error: "token_exchange" });
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
          return mobilePicker
            ? mobileResult({ error: "google_scope_required" })
            : oauthResult(appUrl, provider, { error: "google_scope_required" });
        }

        if (mobilePicker) {
          const pickedIds = [...new Set((url.searchParams.get("picked_file_ids") ?? "").split(","))]
            .map((id) => id.trim())
            .filter((id) => /^[A-Za-z0-9_-]{10,200}$/.test(id))
            .slice(0, 20);
          if (!pickedIds.length) return mobileResult({ error: "picker_cancelled" });

          const connection = await getExternalConnection(oauthState.workspace_id, "google_drive");
          if (!connection?.account_email)
            return mobileResult({ error: "google_drive_reconnect_required" });
          const aboutResponse = await fetch(
            "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
            { headers: { Authorization: `Bearer ${tokens.access_token}` } },
          );
          const about = (await aboutResponse.json().catch(() => null)) as {
            user?: { emailAddress?: string };
          } | null;
          if (
            !aboutResponse.ok ||
            !about?.user?.emailAddress ||
            about.user.emailAddress.toLowerCase() !== connection.account_email.toLowerCase()
          ) {
            return mobileResult({ error: "google_account_mismatch" });
          }

          const supported = new Set([
            "image/jpeg",
            "image/png",
            "video/mp4",
            "video/quicktime",
          ]);
          const files = await Promise.all(
            pickedIds.map(async (id) => {
              const endpoint = new URL(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`,
              );
              endpoint.search = new URLSearchParams({
                supportsAllDrives: "true",
                fields:
                  "id,name,mimeType,size,thumbnailLink,webViewLink,parents,modifiedTime,videoMediaMetadata,imageMediaMetadata",
              }).toString();
              const response = await fetch(endpoint, {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
              });
              const file = (await response.json().catch(() => null)) as Record<string, unknown> | null;
              if (!response.ok || !file || file.id !== id) return null;
              return file;
            }),
          );
          const importedIds: string[] = [];
          for (const file of files) {
            const mimeType = typeof file?.mimeType === "string" ? file.mimeType.toLowerCase() : "";
            if (!file || !supported.has(mimeType) || typeof file.id !== "string") continue;
            const parents = Array.isArray(file.parents) ? file.parents : [];
            const image =
              file.imageMediaMetadata && typeof file.imageMediaMetadata === "object"
                ? (file.imageMediaMetadata as Record<string, unknown>)
                : {};
            const video =
              file.videoMediaMetadata && typeof file.videoMediaMetadata === "object"
                ? (file.videoMediaMetadata as Record<string, unknown>)
                : {};
            const positive = (value: unknown) => {
              const parsed = Number(value);
              return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
            };
            const row = {
              workspace_id: oauthState.workspace_id,
              name: typeof file.name === "string" ? file.name : "Untitled",
              storage_path: null,
              mime_type: mimeType,
              size_bytes: Number(file.size ?? 0),
              tags: [],
              uploaded_by: oauthState.user_id,
              source_provider: "google_drive",
              external_file_id: file.id,
              external_parent_id: typeof parents[0] === "string" ? parents[0] : null,
              source_web_url: typeof file.webViewLink === "string" ? file.webViewLink : null,
              thumbnail_url: typeof file.thumbnailLink === "string" ? file.thumbnailLink : null,
              width: positive(image.width ?? video.width),
              height: positive(image.height ?? video.height),
              duration_seconds: positive(video.durationMillis)
                ? positive(video.durationMillis)! / 1000
                : null,
              source_metadata: {
                imported_at: new Date().toISOString(),
                source_modified_at:
                  typeof file.modifiedTime === "string" ? file.modifiedTime : null,
                selection_flow: "google_mobile_picker",
              },
            };
            const { data: existing } = await supabaseAdmin
              .from("media_assets")
              .select("id")
              .eq("workspace_id", oauthState.workspace_id)
              .eq("source_provider", "google_drive")
              .eq("external_file_id", file.id)
              .maybeSingle();
            const query = existing?.id
              ? supabaseAdmin.from("media_assets").update(row as never).eq("id", existing.id)
              : supabaseAdmin.from("media_assets").insert(row as never);
            const { data: saved, error: saveError } = await query.select("id").single();
            if (saveError) return mobileResult({ error: "file_import_failed" });
            importedIds.push(saved.id);
          }
          return importedIds.length
            ? mobileResult({ mediaIds: importedIds })
            : mobileResult({ error: "no_supported_files" });
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
