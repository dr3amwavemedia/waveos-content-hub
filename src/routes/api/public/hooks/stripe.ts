import { createFileRoute } from "@tanstack/react-router";
import { verifyStripeSignature } from "@/lib/stripe.server";

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
        const valid = await verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret);
        if (!valid) return new Response("invalid_signature", { status: 401 });

        let event: {
          id?: string;
          type?: string;
          data?: { object?: Record<string, unknown> };
        } = {};
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("invalid_payload", { status: 400 });
        }
        const eventId = String(event.id ?? "");
        const eventType = String(event.type ?? "unknown");
        const object = (event.data?.object ?? {}) as Record<string, unknown>;
        const metadata = (object.metadata ?? {}) as Record<string, string>;
        const invoiceId = metadata.invoice_id ?? (object.client_reference_id as string | undefined) ?? null;

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

        await supabaseAdmin.from("webhook_events").insert({
          source: "stripe",
          event_type: eventType,
          external_id: eventId,
          payload: event as never,
          processed_at: new Date().toISOString(),
        });

        if (!invoiceId) return new Response("ok", { status: 200 });

        const { data: invoice } = await supabaseAdmin
          .from("client_invoices")
          .select("id,workspace_id,amount_cents,amount_paid_cents,status")
          .eq("id", invoiceId)
          .maybeSingle();
        if (!invoice) return new Response("ok", { status: 200 });

        if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
          if (String(object.payment_status ?? "") !== "paid") return new Response("ok", { status: 200 });

          const received = Number(object.amount_total ?? 0);
          const total = invoice.amount_cents ?? 0;
          const paidNow = Math.min((invoice.amount_paid_cents ?? 0) + (Number.isFinite(received) ? received : 0), Math.max(total, 0) || Number.MAX_SAFE_INTEGER);
          const settled = total > 0 && paidNow >= total;

          await supabaseAdmin
            .from("client_invoices")
            .update({
              amount_paid_cents: paidNow,
              payment_provider: "stripe",
              provider_payment_id: (object.payment_intent as string | null) ?? null,
              ...(settled ? { status: "paid" as const, paid_at: new Date().toISOString() } : {}),
            })
            .eq("id", invoice.id);

          await releaseHolds(supabaseAdmin, invoice.workspace_id, settled);
        }

        if (eventType === "charge.refunded" || eventType === "charge.dispute.created") {
          // Flag for owner review only. Access is never revoked automatically.
          await supabaseAdmin
            .from("client_invoices")
            .update({ refund_flagged_at: new Date().toISOString() })
            .eq("id", invoice.id);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

type AdminClient = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

/** Release payment holds whose condition is now satisfied. Never creates holds. */
async function releaseHolds(supabaseAdmin: AdminClient, workspaceId: string, paidInFull: boolean) {
  const conditions = paidInFull ? ["deposit_paid", "paid_in_full"] : ["deposit_paid"];
  await supabaseAdmin
    .from("delivery_payment_holds")
    .update({ is_active: false, released_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .in("release_condition", conditions);
}
