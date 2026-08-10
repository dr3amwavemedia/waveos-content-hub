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

        if (!secret) {
          console.error("[ayrshare webhook] AYRSHARE_WEBHOOK_SECRET is not configured; rejecting.");
          return new Response("webhook_not_configured", { status: 503 });
        }

        const sig = request.headers.get("x-authorization-content-sha256")
          ?? request.headers.get("x-ayrshare-signature")
          ?? request.headers.get("x-hub-signature-256")
          ?? "";
        const sigV2 = request.headers.get("x-authorization-content-sha256-v2") ?? "";
        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        const candidates = [sig.replace(/^sha256=/, ""), ...sigV2.split(",").map((value) => value.trim().replace(/^v1=/, ""))]
          .filter(Boolean);
        const signatureValid = candidates.some((candidate) => {
          const a = Buffer.from(candidate, "utf8");
          const b = Buffer.from(expected, "utf8");
          return a.length === b.length && timingSafeEqual(a, b);
        });
        if (!signatureValid) {
          return new Response("invalid_signature", { status: 401 });
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

        // Best-effort: reconcile asynchronous platform completion (notably TikTok).
        const postId = payload.id ?? payload.postId;
        if (postId) {
          const status = String(payload.status ?? "").toLowerCase();
          const success = status === "success" || status === "posted";
          const postIds = Array.isArray(payload.postIds)
            ? payload.postIds as Array<{ platform?: string; postUrl?: string; status?: string }>
            : [];
          const platform = String(payload.platform ?? postIds[0]?.platform ?? "");
          const postUrl = (payload.postUrl as string | undefined) ?? postIds[0]?.postUrl ?? null;
          const errors = Array.isArray(payload.errors)
            ? payload.errors as Array<{ code?: string | number; message?: string; details?: string }>
            : [];
          const firstError = errors[0];
          let update = supabaseAdmin
            .from("publish_attempts")
            .update({
              status: success ? "success" : "failed",
              response_snapshot: payload as never,
              completed_at: new Date().toISOString(),
              post_url: postUrl,
              error_code: success || firstError?.code == null ? null : String(firstError.code),
              error_message: success
                ? null
                : firstError?.message
                  ? `${firstError.message}${firstError.details ? ` ${firstError.details}` : ""}`
                  : "Ayrshare reported an asynchronous publishing failure.",
            })
            .eq("ayrshare_post_id", String(postId));
          if (platform) update = update.eq("platform", platform as never);
          const { data: updated } = await update.select("content_item_id");

          for (const row of updated ?? []) {
            const { data: itemAttempts } = await supabaseAdmin
              .from("publish_attempts")
              .select("status")
              .eq("content_item_id", row.content_item_id);
            const statuses = (itemAttempts ?? []).map((attempt) => attempt.status);
            const itemStatus = statuses.some((value) => value === "failed")
              ? "failed"
              : statuses.some((value) => value === "sending" || value === "queued")
                ? "publishing"
                : "published";
            await supabaseAdmin.from("content_items").update({ status: itemStatus }).eq("id", row.content_item_id);
          }
        }

        return new Response("ok");
      },
    },
  },
});
