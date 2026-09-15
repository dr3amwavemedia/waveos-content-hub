import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * SignWell webhook receiver.
 * Verifies the HMAC-SHA256 signature SignWell sends in X-SignWell-Signature,
 * de-duplicates by event id, and records signature progress on the contract.
 */
export const Route = createFileRoute("/api/public/hooks/signwell")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SIGNWELL_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[signwell webhook] SIGNWELL_WEBHOOK_SECRET is not configured; rejecting.");
          return new Response("webhook_not_configured", { status: 503 });
        }

        const raw = await request.text();
        const provided = (request.headers.get("x-signwell-signature") ?? "").replace(/^sha256=/, "");
        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        const a = Buffer.from(provided, "utf8");
        const b = Buffer.from(expected, "utf8");
        if (!provided || a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("invalid_signature", { status: 401 });
        }

        let event: { event?: { type?: string; id?: string }; data?: { object?: Record<string, unknown> } } = {};
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("invalid_payload", { status: 400 });
        }

        const eventType = String(event.event?.type ?? "unknown");
        const eventId = String(event.event?.id ?? "");
        const object = (event.data?.object ?? {}) as Record<string, unknown>;
        const metadata = (object.metadata ?? {}) as Record<string, string>;
        const documentId = String(object.id ?? "");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (eventId) {
          const { data: seen } = await supabaseAdmin
            .from("webhook_events")
            .select("id")
            .eq("source", "signwell")
            .eq("external_id", eventId)
            .maybeSingle();
          if (seen) return new Response("duplicate_ignored", { status: 200 });
        }

        await supabaseAdmin.from("webhook_events").insert({
          source: "signwell",
          event_type: eventType,
          external_id: eventId,
          payload: event as never,
          processed_at: new Date().toISOString(),
        });

        const status =
          eventType === "document_completed" || eventType === "document_signed"
            ? "signed"
            : eventType === "document_viewed"
              ? "viewed"
              : eventType === "document_declined"
                ? "declined"
                : eventType === "document_expired"
                  ? "expired"
                  : null;
        if (!status) return new Response("ok", { status: 200 });

        const query = supabaseAdmin
          .from("client_contracts")
          .update({ status, ...(status === "signed" ? { signed_at: new Date().toISOString() } : {}) });
        if (metadata.contract_id) {
          await query.eq("id", metadata.contract_id);
        } else if (documentId) {
          await query.eq("provider_document_id", documentId);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
