import { createFileRoute } from "@tanstack/react-router";
import { verifyStripeSignature, stripeModeMatches } from "@/lib/stripe.server";
import { nextInvoicePaymentCents } from "@/lib/invoice-payment-schedule";

/**
 * Stripe webhook receiver.
 * - Rejects unsigned / mis-signed / stale events.
 * - De-duplicates by Stripe event id (replay safe).
 * - Never trusts amounts from the client: reconciles against the invoice row.
 */
export const Route = createFileRoute("/api/public/hooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not configured; rejecting.");
          return new Response("webhook_not_configured", { status: 503 });
        }

        const raw = await request.text();
        const valid = await verifyStripeSignature(
          raw,
          request.headers.get("stripe-signature"),
          secret,
        );
        if (!valid) return new Response("invalid_signature", { status: 401 });

        let event: {
          id?: string;
          type?: string;
          created?: number;
          livemode?: boolean;
          data?: { object?: Record<string, unknown> };
        } = {};
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("invalid_payload", { status: 400 });
        }
        if (!stripeModeMatches(event.livemode)) {
          return new Response("stripe_mode_mismatch", { status: 403 });
        }
        const eventId = String(event.id ?? "");
        if (!eventId) return new Response("missing_event_id", { status: 400 });
        const eventType = String(event.type ?? "unknown");
        const object = (event.data?.object ?? {}) as Record<string, unknown>;
        const metadata = (object.metadata ?? {}) as Record<string, string>;
        let invoiceId: string | null =
          metadata.invoice_id ?? (object.client_reference_id as string | undefined) ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Replay / duplicate protection.
        if (eventId) {
          const { data: seen } = await supabaseAdmin
            .from("webhook_events")
            .select("id")
            .eq("source", "stripe")
            .eq("external_id", eventId)
            .maybeSingle();
          if (seen) return new Response("duplicate_ignored", { status: 200 });
        }

        const { error: eventError } = await supabaseAdmin.from("webhook_events").insert({
          source: "stripe",
          event_type: eventType,
          external_id: eventId,
          payload: event as never,
          processed_at: new Date().toISOString(),
        });
        if (eventError) return new Response("event_store_failed", { status: 503 });

        if (
          !invoiceId &&
          (eventType === "charge.refunded" || eventType === "charge.dispute.created")
        ) {
          const paymentIntentId = String(object.payment_intent ?? "");
          if (paymentIntentId) {
            const { data: linked } = await supabaseAdmin
              .from("client_invoices")
              .select("id")
              .eq("provider_payment_id", paymentIntentId)
              .maybeSingle();
            invoiceId = linked?.id ?? null;
          }
        }
        if (!invoiceId) return new Response("ok", { status: 200 });

        const { data: invoice } = await supabaseAdmin
          .from("client_invoices")
          .select(
            "id,workspace_id,number,amount_cents,amount_paid_cents,currency,status,provider_session_id,checkout_payment_type,checkout_payment_cents",
          )
          .eq("id", invoiceId)
          .maybeSingle();
        if (!invoice) return new Response("ok", { status: 200 });

        if (
          eventType === "checkout.session.expired" ||
          eventType === "checkout.session.async_payment_failed"
        ) {
          // Nothing is unlocked and nothing is marked paid; just clear the session pointer.
          await supabaseAdmin
            .from("client_invoices")
            .update({ provider_session_id: null })
            .eq("id", invoice.id)
            .eq("provider_session_id", String(object.id ?? ""));
          return new Response("ok", { status: 200 });
        }

        if (
          eventType === "checkout.session.completed" ||
          eventType === "checkout.session.async_payment_succeeded"
        ) {
          // Delayed payment methods complete the session while still "unpaid"/
          // "no_payment_required". Never unlock until Stripe says paid.
          if (String(object.payment_status ?? "") !== "paid")
            return new Response("ok", { status: 200 });

          const received = Number(object.amount_total ?? 0);
          const paymentId = String(object.payment_intent ?? object.id ?? "");
          if (!paymentId || !Number.isSafeInteger(received) || received <= 0) {
            return new Response("invalid_payment", { status: 400 });
          }
          const expectedDue = nextInvoicePaymentCents({
            amountCents: invoice.amount_cents,
            amountPaidCents: invoice.amount_paid_cents,
            checkoutPaymentType: invoice.checkout_payment_type,
            checkoutPaymentCents: invoice.checkout_payment_cents,
          });
          const matchesInvoice =
            String(object.id ?? "") === invoice.provider_session_id &&
            String(object.currency ?? "").toUpperCase() === invoice.currency.toUpperCase() &&
            received === expectedDue;
          const { error: ledgerError } = await supabaseAdmin.from("payment_ledger").insert({
            source: "stripe",
            external_id: paymentId,
            invoice_id: invoice.id,
            workspace_id: invoice.workspace_id,
            kind: "payment",
            amount_cents: received,
            currency: String(object.currency ?? "usd").toUpperCase(),
            occurred_at:
              Number.isFinite(event.created) && event.created! > 0
                ? new Date(event.created! * 1000).toISOString()
                : new Date().toISOString(),
            description: `Stripe payment for invoice ${invoice.id}`,
            status: matchesInvoice ? "posted" : "unmatched",
          });
          if (ledgerError?.code === "23505") {
            const { data: existingPayment } = await supabaseAdmin
              .from("payment_ledger")
              .select("invoice_id,status")
              .eq("source", "stripe")
              .eq("external_id", paymentId)
              .maybeSingle();
            if (
              existingPayment?.invoice_id === invoice.id &&
              existingPayment.status === "posted" &&
              invoice.amount_paid_cents > 0
            ) {
              try {
                await releaseHolds(supabaseAdmin, invoice.workspace_id, invoice.status === "paid");
              } catch {
                await supabaseAdmin
                  .from("webhook_events")
                  .delete()
                  .eq("source", "stripe")
                  .eq("external_id", eventId);
                return new Response("hold_release_failed", { status: 503 });
              }
            }
            return new Response("duplicate_ignored", { status: 200 });
          }
          if (ledgerError) {
            await supabaseAdmin
              .from("webhook_events")
              .delete()
              .eq("source", "stripe")
              .eq("external_id", eventId);
            return new Response("ledger_write_failed", { status: 503 });
          }
          if (!matchesInvoice) {
            await supabaseAdmin
              .from("client_invoices")
              .update({ refund_flagged_at: new Date().toISOString() })
              .eq("id", invoice.id);
            return new Response("payment_requires_review", { status: 200 });
          }
          const total = invoice.amount_cents ?? 0;
          const paidNow = Math.min(
            (invoice.amount_paid_cents ?? 0) + received,
            Math.max(total, 0) || Number.MAX_SAFE_INTEGER,
          );
          const settled = total > 0 && paidNow >= total;

          const { error: invoiceError } = await supabaseAdmin
            .from("client_invoices")
            .update({
              amount_paid_cents: paidNow,
              payment_provider: "stripe",
              provider_payment_id: (object.payment_intent as string | null) ?? null,
              ...(settled ? { status: "paid" as const, paid_at: new Date().toISOString() } : {}),
            })
            .eq("id", invoice.id);
          if (invoiceError) {
            await supabaseAdmin
              .from("payment_ledger")
              .delete()
              .eq("source", "stripe")
              .eq("external_id", paymentId);
            await supabaseAdmin
              .from("webhook_events")
              .delete()
              .eq("source", "stripe")
              .eq("external_id", eventId);
            return new Response("invoice_update_failed", { status: 503 });
          }

          try {
            await releaseHolds(supabaseAdmin, invoice.workspace_id, settled);
          } catch {
            await supabaseAdmin
              .from("webhook_events")
              .delete()
              .eq("source", "stripe")
              .eq("external_id", eventId);
            return new Response("hold_release_failed", { status: 503 });
          }

          try {
            const { sendPaymentReceiptEmail } =
              await import("@/lib/document-completion-email.server");
            const customerDetails = (object.customer_details ?? {}) as Record<string, unknown>;
            await sendPaymentReceiptEmail(
              invoice.workspace_id,
              {
                invoiceNumber: invoice.number || `Invoice ${invoice.id.slice(0, 8).toUpperCase()}`,
                receivedCents: received,
                totalPaidCents: paidNow,
                balanceCents: Math.max(0, total - paidNow),
                currency: invoice.currency,
              },
              typeof customerDetails.email === "string" ? customerDetails.email : null,
            );
          } catch {
            // Payment processing must remain successful if the email provider is unavailable.
            console.error("[stripe webhook] payment receipt email failed for invoice", invoice.id);
          }
        }

        if (eventType === "charge.refunded" || eventType === "charge.dispute.created") {
          // Flag for owner review only. Access is never revoked automatically.
          await supabaseAdmin
            .from("client_invoices")
            .update({ refund_flagged_at: new Date().toISOString() })
            .eq("id", invoice.id);
          if (eventType === "charge.refunded") {
            const amount = Number(object.amount_refunded ?? 0);
            if (Number.isSafeInteger(amount) && amount > 0) {
              const { error: refundError } = await supabaseAdmin.from("payment_ledger").insert({
                source: "stripe",
                external_id: eventId,
                invoice_id: invoice.id,
                workspace_id: invoice.workspace_id,
                kind: "refund",
                amount_cents: amount,
                currency: String(object.currency ?? "usd").toUpperCase(),
                occurred_at:
                  Number.isFinite(event.created) && event.created! > 0
                    ? new Date(event.created! * 1000).toISOString()
                    : new Date().toISOString(),
                description: `Stripe refund event for invoice ${invoice.id}; verify amount before posting`,
                status: "unmatched",
              });
              if (refundError && refundError.code !== "23505") {
                await supabaseAdmin
                  .from("webhook_events")
                  .delete()
                  .eq("source", "stripe")
                  .eq("external_id", eventId);
                return new Response("refund_ledger_failed", { status: 503 });
              }
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

type AdminClient = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Release payment holds whose condition is now satisfied. Never creates holds. */
async function releaseHolds(supabaseAdmin: AdminClient, workspaceId: string, paidInFull: boolean) {
  const conditions = paidInFull ? ["deposit_paid", "paid_in_full"] : ["deposit_paid"];
  const { error } = await supabaseAdmin
    .from("delivery_payment_holds")
    .update({ is_active: false, released_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .in("release_condition", conditions);
  if (error) throw error;
}
