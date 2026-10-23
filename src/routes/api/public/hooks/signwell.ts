import { createFileRoute } from "@tanstack/react-router";
import { claimWebhookEvent } from "@/lib/webhook-claim.server";
import {
  isTerminalSignwellContractStatus,
  minimalSignwellEventPayload,
  signwellEventExternalId,
  verifySignwellEvent,
} from "@/lib/signwell-webhook";

const lifecycleEvents = new Set([
  "document_sent",
  "document_viewed",
  "document_in_progress",
  "document_signed",
  "document_completed",
  "document_declined",
  "document_expired",
  "document_canceled",
]);

/**
 * SignWell signs only `event.type@event.time`; the document body is not covered
 * by the HMAC. Use the body ID solely to find an existing WaveOS mapping, then
 * queue an authenticated API status check. The five-minute reconciler applies
 * the authoritative provider state and enqueues slow archive/email work.
 */
export const Route = createFileRoute("/api/public/hooks/signwell")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookId = process.env.SIGNWELL_WEBHOOK_ID;
        if (!webhookId) {
          console.error("[signwell webhook] SIGNWELL_WEBHOOK_ID is not configured; rejecting.");
          return new Response("webhook_not_configured", { status: 503 });
        }

        let event: {
          event?: { type?: string; time?: string; hash?: string };
          data?: { object?: Record<string, unknown> };
        } = {};
        try {
          event = JSON.parse(await request.text());
        } catch {
          return new Response("invalid_payload", { status: 400 });
        }

        const eventType = String(event.event?.type ?? "");
        const eventTime = String(event.event?.time ?? "");
        const verification = verifySignwellEvent({
          eventType,
          eventTime,
          providedHash: String(event.event?.hash ?? ""),
          webhookId,
        });
        if (verification === "invalid_signature") {
          return new Response("invalid_signature", { status: 401 });
        }
        if (verification === "stale_event") {
          // Acknowledge authenticated historical retries; periodic
          // reconciliation recovers provider state without replaying them.
          return new Response("stale_ignored", { status: 200 });
        }
        if (!lifecycleEvents.has(eventType)) {
          return new Response("event_ignored", { status: 200 });
        }

        const object = (event.data?.object ?? {}) as Record<string, unknown>;
        const documentId = String(object.id ?? "").trim();
        if (!documentId) return new Response("document_ignored", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const contractResult = await supabaseAdmin
          .from("client_contracts")
          .select("id,status")
          .eq("provider", "signwell")
          .eq("provider_document_id", documentId)
          .maybeSingle();
        if (contractResult.error) {
          console.error("[signwell webhook] contract lookup failed", contractResult.error.code);
          return new Response("contract_lookup_failed", { status: 503 });
        }
        const contract = contractResult.data;
        if (!contract) {
          // Account-level hooks include documents created outside WaveOS. They
          // are expected traffic and must not poison the provider retry queue.
          console.info("[signwell webhook] verified non-WaveOS document ignored", {
            eventType,
            documentId,
          });
          return new Response("document_ignored", { status: 200 });
        }
        if (isTerminalSignwellContractStatus(contract.status)) {
          return new Response("terminal_ignored", { status: 200 });
        }

        const eventId = signwellEventExternalId({ eventType, eventTime, documentId });
        const claim = await claimWebhookEvent(supabaseAdmin, {
          source: "signwell",
          eventType,
          externalId: eventId,
          // The body ID is only a scheduling hint. Never persist unsigned
          // recipient, metadata, or status fields from the webhook payload.
          payload: minimalSignwellEventPayload({ eventType, eventTime, documentId }),
        });
        if (claim.error) return new Response("event_store_failed", { status: 503 });

        const retryableFailure = async (message: string) => {
          if (claim.claimed) {
            const released = await supabaseAdmin
              .from("webhook_events")
              .delete()
              .eq("source", "signwell")
              .eq("external_id", eventId);
            if (released.error) {
              console.error(
                "[signwell webhook] failed to release event claim",
                released.error.code,
              );
            }
          }
          return new Response(message, { status: 503 });
        };

        // NULL sorts first in the reconciler, so a current webhook gets the
        // next available authenticated provider check without doing network,
        // Storage, or email work on SignWell's request.
        const queued = await supabaseAdmin
          .from("client_contracts")
          .update({ provider_status_checked_at: null })
          .eq("id", contract.id)
          .eq("provider", "signwell")
          .eq("provider_document_id", documentId)
          .in("status", ["draft", "sent", "viewed"])
          .select("id");
        if (queued.error) return retryableFailure("status_check_queue_failed");
        if (!queued.data?.length) return new Response("state_changed", { status: 200 });

        return new Response(claim.claimed ? "queued" : "duplicate_queued", { status: 200 });
      },
    },
  },
});
