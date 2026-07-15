import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Ayrshare webhook receiver. Verifies HMAC signature (if AYRSHARE_WEBHOOK_SECRET is set),
 * then records the event and marks any related publish attempt as complete.
 */
export const Route = createFileRoute("/api/public/hooks/ayrshare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const secret = process.env.AYRSHARE_WEBHOOK_SECRET;

        if (secret) {
          const sig = request.headers.get("x-ayrshare-signature") ?? request.headers.get("x-hub-signature-256") ?? "";
          const expected = createHmac("sha256", secret).update(raw).digest("hex");
          const a = Buffer.from(sig.replace(/^sha256=/, ""), "utf8");
          const b = Buffer.from(expected, "utf8");
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("invalid_signature", { status: 401 });
          }
        }

        let payload: Record<string, unknown> = {};
        try { payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}; } catch { /* keep empty */ }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("webhook_events").insert({
          source: "ayrshare",
          event_type: String(payload.action ?? payload.type ?? "unknown"),
          external_id: String(payload.id ?? payload.postId ?? ""),
          payload: payload as never,
          processed_at: new Date().toISOString(),
        });

        // Best-effort: mark matching publish_attempt as success/failed
        const postId = payload.id ?? payload.postId;
        if (postId) {
          const status = String(payload.status ?? "").toLowerCase();
          const success = status === "success" || status === "posted";
          await supabaseAdmin
            .from("publish_attempts")
            .update({
              status: success ? "success" : "failed",
              response_snapshot: payload as never,
              completed_at: new Date().toISOString(),
              post_url: (payload.postUrl as string) ?? null,
            })
            .eq("ayrshare_post_id", String(postId));
        }

        return new Response("ok");
      },
    },
  },
});
