import { createFileRoute } from "@tanstack/react-router";
import {
  verifyStripeSignature,
  stripeModeMatches,
  stripeRequest,
  type StripeCheckoutSession,
  type StripeSetupIntent,
} from "@/lib/stripe.server";
import { applyStripeCheckoutPayment } from "@/lib/stripe-invoice-payment.server";

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

        const autopayScheduleId = metadata.autopay_schedule_id;
        if (
          autopayScheduleId &&
          eventType === "checkout.session.completed" &&
          object.setup_intent
        ) {
          const setup = await stripeRequest<StripeSetupIntent>(
            `/setup_intents/${encodeURIComponent(String(object.setup_intent))}`,
            { method: "GET" },
          );
          if (
            setup.status !== "succeeded" ||
            !setup.payment_method ||
            !stripeModeMatches(setup.livemode)
          ) {
            return new Response("autopay_setup_incomplete", { status: 400 });
          }
          await supabaseAdmin
            .from("invoice_autopay_schedules")
            .update({
              stripe_payment_method_id: setup.payment_method,
              status: "active",
              authorized_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", autopayScheduleId)
            .eq("stripe_setup_session_id", String(object.id ?? ""));
          return new Response("ok", { status: 200 });
        }

        if (autopayScheduleId && eventType === "payment_intent.succeeded") {
          const { data: schedule } = await supabaseAdmin
            .from("invoice_autopay_schedules")
            .select("*")
            .eq("id", autopayScheduleId)
            .maybeSingle();
          const targetInvoiceId = metadata.invoice_id;
          if (!schedule || !targetInvoiceId)
            return new Response("autopay_schedule_missing", { status: 400 });
          const received = Number(object.amount_received ?? object.amount ?? 0);
          if (
            received !== schedule.amount_cents ||
            String(object.currency ?? "").toUpperCase() !== schedule.currency.toUpperCase()
          ) {
            await supabaseAdmin
              .from("invoice_autopay_schedules")
              .update({ status: "failed", last_error: "amount_or_currency_mismatch" })
              .eq("id", schedule.id);
            return new Response("payment_requires_review", { status: 200 });
          }
          const { data: target } = await supabaseAdmin
            .from("client_invoices")
            .select("id,number,amount_cents,amount_paid_cents,currency,workspace_id")
            .eq("id", targetInvoiceId)
            .eq("workspace_id", schedule.workspace_id)
            .maybeSingle();
          if (!target) return new Response("invoice_missing", { status: 400 });
          const paymentId = String(object.id ?? "");
          const ledger = await supabaseAdmin.from("payment_ledger").insert({
            source: "stripe",
            external_id: paymentId,
            invoice_id: target.id,
            workspace_id: target.workspace_id,
            kind: "payment",
            amount_cents: received,
            currency: target.currency,
            occurred_at: new Date().toISOString(),
            description: `Automatic Stripe charge for invoice ${target.id}`,
            status: "posted",
          });
          if (ledger.error?.code === "23505")
            return new Response("duplicate_ignored", { status: 200 });
          if (ledger.error) return new Response("ledger_write_failed", { status: 503 });
          const paidNow = Math.min(
            (target.amount_paid_cents ?? 0) + received,
            target.amount_cents ?? received,
          );
          await supabaseAdmin
            .from("client_invoices")
            .update({
              amount_paid_cents: paidNow,
              status: "paid",
              paid_at: new Date().toISOString(),
              payment_provider: "stripe",
              provider_payment_id: paymentId,
            })
            .eq("id", target.id);
          if (schedule.frequency === "monthly") {
            const next = new Date(schedule.charge_at);
            next.setUTCMonth(next.getUTCMonth() + 1);
            await supabaseAdmin
              .from("invoice_autopay_schedules")
              .update({
                status: "active",
                charge_at: next.toISOString(),
                current_invoice_id: null,
                last_succeeded_at: new Date().toISOString(),
                last_error: null,
              })
              .eq("id", schedule.id);
          } else {
            await supabaseAdmin
              .from("invoice_autopay_schedules")
              .update({
                status: "completed",
                enabled: false,
                last_succeeded_at: new Date().toISOString(),
                last_error: null,
              })
              .eq("id", schedule.id);
          }
          try {
            const { sendPaymentReceiptEmail } =
              await import("@/lib/document-completion-email.server");
            await sendPaymentReceiptEmail(
              target.workspace_id,
              {
                invoiceNumber: target.number || `Invoice ${target.id.slice(0, 8).toUpperCase()}`,
                receivedCents: received,
                totalPaidCents: paidNow,
                balanceCents: Math.max(0, (target.amount_cents ?? received) - paidNow),
                currency: target.currency,
              },
              null,
            );
          } catch {
            console.error("[stripe webhook] automatic payment receipt email failed", target.id);
          }
          return new Response("ok", { status: 200 });
        }

        if (autopayScheduleId && eventType === "payment_intent.payment_failed") {
          const failureMessage =
            typeof object.last_payment_error === "object" && object.last_payment_error
              ? String(
                  (object.last_payment_error as Record<string, unknown>).message ??
                    "The automatic card charge failed.",
                )
              : "The automatic card charge failed.";
          await supabaseAdmin
            .from("invoice_autopay_schedules")
            .update({ status: "action_required", last_error: failureMessage.slice(0, 200) })
            .eq("id", autopayScheduleId);
          return new Response("ok", { status: 200 });
        }

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
            "id,workspace_id,number,amount_cents,amount_paid_cents,currency,status,provider_session_id,payment_plan,checkout_payment_type,checkout_payment_cents",
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
          try {
            const result = await applyStripeCheckoutPayment(
              invoice,
              object as unknown as StripeCheckoutSession,
              Number.isFinite(event.created) && event.created! > 0
                ? new Date(event.created! * 1000).toISOString()
                : new Date().toISOString(),
            );
            if (result.kind === "invalid") return new Response("invalid_payment", { status: 400 });
            if (result.kind === "review")
              return new Response("payment_requires_review", { status: 200 });
            if (result.kind === "duplicate")
              return new Response("duplicate_ignored", { status: 200 });
          } catch {
            await supabaseAdmin
              .from("webhook_events")
              .delete()
              .eq("source", "stripe")
              .eq("external_id", eventId);
            return new Response("payment_processing_failed", { status: 503 });
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
