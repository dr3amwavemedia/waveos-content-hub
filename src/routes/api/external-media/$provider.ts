import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/external-media/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const {
          externalMediaEnv,
          externalMediaRedirectUri,
          getExternalConnection,
          pkceChallenge,
          randomHex,
          requireExternalMediaWorkspace,
        } = await import("@/lib/external-media.server");
        const provider = params.provider;
        if (provider !== "google_drive" && provider !== "dropbox")
          return json({ error: "unsupported_provider" }, 404);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
        if (!workspaceId) return json({ error: "workspace_required" }, 400);
        const auth = await requireExternalMediaWorkspace(request, workspaceId);
        if (!auth) return json({ error: "not_authorized" }, 403);

        if (body.action === "status") {
          const connection = await getExternalConnection(workspaceId, provider);
          return json({
            configured:
              provider === "google_drive"
                ? Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET)
                : Boolean(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET),
            connected: Boolean(connection),
            account: connection
              ? {
                  email: connection.account_email,
                  updatedAt: connection.token_expires_at,
                }
              : null,
          });
        }

        if (body.action === "disconnect") {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("external_media_connections" as never)
            .delete()
            .eq("workspace_id", workspaceId)
            .eq("provider", provider);
          if (error) return json({ error: "disconnect_failed" }, 500);
          return json({ connected: false });
        }

        if (body.action !== "connect") return json({ error: "invalid_action" }, 400);

        const verifier = randomHex(48);
        const state = randomHex(32);
        const challenge = await pkceChallenge(verifier);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("external_media_oauth_states" as never)
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("provider", provider)
          .eq("user_id", auth.user.id);
        const { error: stateError } = await supabaseAdmin
          .from("external_media_oauth_states" as never)
          .insert({
            state,
            workspace_id: workspaceId,
            user_id: auth.user.id,
            provider,
            code_verifier: verifier,
            expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          } as never);
        if (stateError) return json({ error: "oauth_state_failed" }, 500);

        if (provider === "google_drive") {
          const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
          authorize.search = new URLSearchParams({
            client_id: externalMediaEnv("GOOGLE_DRIVE_CLIENT_ID"),
            redirect_uri: externalMediaRedirectUri(provider),
            response_type: "code",
            scope:
              "openid email profile https://www.googleapis.com/auth/drive.file",
            access_type: "offline",
            include_granted_scopes: "true",
            prompt: "consent select_account",
            state,
            code_challenge: challenge,
            code_challenge_method: "S256",
          }).toString();
          return json({ url: authorize.toString() });
        }

        const authorize = new URL("https://www.dropbox.com/oauth2/authorize");
        authorize.search = new URLSearchParams({
          client_id: externalMediaEnv("DROPBOX_APP_KEY"),
          redirect_uri: externalMediaRedirectUri(provider),
          response_type: "code",
          token_access_type: "offline",
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
        }).toString();
        return json({ url: authorize.toString() });
      },
    },
  },
});
