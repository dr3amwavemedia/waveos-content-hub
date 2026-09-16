import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * SignWell webhook receiver.
 *
 * SignWell signs events with the registered webhook's ID (not a secret we
 * choose): hash = HMAC-SHA256(webhook_id, `${event.type}@${event.time}`).
 * See https://www.signwell.com/resources/?p=4887
 *
 * A document is only treated as fully signed on `document_completed`; a
 * single `document_signed` event just means one recipient finished.
 */
const REPLAY_TOLERANCE_SECONDS = 300;

export const Route = createFileRoute("/api/public/hooks/signwell")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookId = process.env.SIGNWELL_WEBHOOK_ID;
        if (!webhookId) {
          console.error("[signwell webhook] SIGNWELL_WEBHOOK_ID is not configured; rejecting.");
          return new Response("webhook_not_configured", { status: 503 });
        }

        const raw = await request.text();
        let event: {
          event?: { type?: string; time?: string; hash?: string; id?: string };
          data?: { object?: Record<string, unknown> };
        } = {};
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("invalid_payload", { status: 400 });
        }

        const eventType = String(event.event?.type ?? "");
        const eventTime = String(event.event?.time ?? "");
        const provided = String(event.event?.hash ?? "");
        if (!eventType || !eventTime || !provided) {
          return new Response("invalid_signature", { status: 401 });
        }

        const expected = createHmac("sha256", webhookId)
          .update(`${eventType}@${eventTime}`)
          .digest("hex");
        const a = Buffer.from(provided, "utf8");
        const b = Buffer.from(expected, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("invalid_signature", { status: 401 });
        }

        // Replay safety: reject stale timestamps as well as repeated ids.
        const sentAt = Number.isFinite(Number(eventTime))
          ? Number(eventTime) * 1000
          : Date.parse(eventTime);
        if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > REPLAY_TOLERANCE_SECONDS * 1000) {
          return new Response("stale_event", { status: 400 });
        }

        const object = (event.data?.object ?? {}) as Record<string, unknown>;
        const metadata = (object.metadata ?? {}) as Record<string, string>;
        const documentId = String(object.id ?? "");
        const eventId = String(event.event?.id ?? `${eventType}@${eventTime}:${documentId}`);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: seen } = await supabaseAdmin
          .from("webhook_events")
          .select("id")
          .eq("source", "signwell")
          .eq("external_id", eventId)
          .maybeSingle();
        if (seen) return new Response("duplicate_ignored", { status: 200 });

        await supabaseAdmin.from("webhook_events").insert({
          source: "signwell",
          event_type: eventType,
          external_id: eventId,
          payload: event as never,
          processed_at: new Date().toISOString(),
        });

        const status =
          eventType === "document_completed"
            ? "signed"
            : eventType === "document_signed"
              ? "sent" // one recipient signed; the document is not complete yet
              : eventType === "document_viewed"
                ? "viewed"
                : eventType === "document_declined"
                  ? "declined"
                  : eventType === "document_expired"
                    ? "expired"
                    : null;
        if (!status) return new Response("ok", { status: 200 });

        const completedAt = new Date().toISOString();
        const patch = {
          status,
          ...(status === "signed" ? { signed_at: completedAt } : {}),
        };

        const locate = supabaseAdmin
          .from("client_contracts")
          .select("id,workspace_id,description,contract_data,source_template_version,provider_document_id");
        const { data: contract } = metadata.contract_id
          ? await locate.eq("id", metadata.contract_id).maybeSingle()
          : documentId
            ? await locate.eq("provider_document_id", documentId).maybeSingle()
            : { data: null };

        if (!contract) return new Response("ok", { status: 200 });

        await supabaseAdmin.from("client_contracts").update(patch).eq("id", contract.id);

        // Only a verified completion produces the private signed archive.
        if (status === "signed") {
          const providerDocumentId = contract.provider_document_id ?? documentId;
          if (providerDocumentId) {
            try {
              const { archiveCompletedContract } = await import("@/lib/signwell-archive.server");
              const outcome = await archiveCompletedContract({
                contractId: contract.id,
                workspaceId: contract.workspace_id,
                providerDocumentId,
                completedAt,
                templateVersion: contract.source_template_version ?? null,
                contractData: contract.contract_data ?? {},
                renderedText: contract.description ?? null,
                auditEvidence: {
                  event_type: eventType,
                  event_id: eventId,
                  event_time: eventTime,
                  provider: "signwell",
                  recipients: Array.isArray(object.recipients)
                    ? (object.recipients as Array<Record<string, unknown>>).map((r) => ({
                        id: r.id ?? null,
                        status: r.status ?? null,
                        completed_at: r.completed_at ?? null,
                      }))
                    : [],
                },
              });
              // Reason codes only — never document contents or links.
              if (!outcome.archived) {
                console.error("[signwell webhook] archive skipped:", outcome.reason);
              }
            } catch {
              console.error("[signwell webhook] archive failed for contract", contract.id);
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
