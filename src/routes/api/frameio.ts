import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/frameio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { frameioEnv, frameioRedirectUri, requireDreamWaveOwner } = await import("@/lib/frameio.server");
        const owner = await requireDreamWaveOwner(request);
        if (!owner) return json({ error: "owner_required" }, 403);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (body.action === "status") {
          const { data } = await supabaseAdmin
            .from("frameio_service_connections" as never)
            .select("account_email")
            .eq("id", true)
            .maybeSingle();
          const connection = data as unknown as { account_email: string | null } | null;
          return json({
            configured: Boolean(process.env.FRAMEIO_CLIENT_ID && process.env.FRAMEIO_CLIENT_SECRET),
            connected: Boolean(connection),
            email: connection?.account_email ?? null,
          });
        }
        if (body.action === "disconnect") {
          const { error } = await supabaseAdmin
            .from("frameio_service_connections" as never)
            .delete()
            .eq("id", true);
          if (error) return json({ error: "disconnect_failed" }, 500);
          return json({ connected: false });
        }
        if (body.action !== "connect") return json({ error: "invalid_action" }, 400);
        const state = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
        const { error } = await supabaseAdmin.from("frameio_oauth_states" as never).insert({
          state,
          user_id: owner.user.id,
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        } as never);
        if (error) return json({ error: "oauth_state_failed" }, 500);
        const authorize = new URL("https://ims-na1.adobelogin.com/ims/authorize/v2");
        authorize.search = new URLSearchParams({
          client_id: frameioEnv("FRAMEIO_CLIENT_ID"),
          redirect_uri: frameioRedirectUri(),
          scope: "offline_access,openid,email,profile,additional_info.roles",
          response_type: "code",
          state,
        }).toString();
        return json({ url: authorize.toString() });
      },
    },
  },
});
