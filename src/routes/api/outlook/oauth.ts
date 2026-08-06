import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/outlook/oauth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { outlookDb, outlookEnv, outlookRedirectUri, requireOutlookStaff } =
          await import("@/lib/outlook.server");
        const user = await requireOutlookStaff(request);
        if (!user) return json({ error: "not_authenticated" }, 401);
        const body = await request.json().catch(() => ({}));
        if (body.action === "disconnect") {
          await outlookDb.from("outlook_connections").delete().eq("user_id", user.id);
          return json({ connected: false });
        }
        if (body.action === "status") {
          const { data } = await outlookDb
            .from("outlook_connections")
            .select("email,updated_at")
            .eq("user_id", user.id)
            .maybeSingle();
          return json({ connected: Boolean(data), connection: data ?? null });
        }
        if (body.action !== "connect") return json({ error: "invalid_action" }, 400);

        const randomValue = (length: number) =>
          crypto
            .getRandomValues(new Uint8Array(length))
            .reduce((value, byte) => value + byte.toString(16).padStart(2, "0"), "");
        const verifier = randomValue(64);
        const state = randomValue(32);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        const challenge = Buffer.from(digest).toString("base64url");
        await outlookDb.from("outlook_oauth_states").delete().eq("user_id", user.id);
        await outlookDb.from("outlook_oauth_states").insert({
          state,
          user_id: user.id,
          code_verifier: verifier,
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        });
        const authorize = new URL(
          `https://login.microsoftonline.com/${outlookEnv("OUTLOOK_TENANT_ID")}/oauth2/v2.0/authorize`,
        );
        authorize.search = new URLSearchParams({
          client_id: outlookEnv("OUTLOOK_CLIENT_ID"),
          response_type: "code",
          redirect_uri: outlookRedirectUri(),
          response_mode: "query",
          scope:
            "openid profile email offline_access User.Read Calendars.ReadWrite Mail.ReadWrite Mail.Send",
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          prompt: "select_account",
        }).toString();
        return json({ url: authorize.toString() });
      },
    },
  },
});
