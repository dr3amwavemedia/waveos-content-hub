import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { stripeRequest, stripeIsTestMode, type StripeCheckoutSession } from "@/lib/stripe.server";

function originFromRequest(): string {
  const request = getRequest();
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Create a Stripe Checkout session for one invoice.
 * The caller must be able to read the invoice through RLS (staff or a member of
 * the invoice's workspace). Amount and currency always come from the database
 * row — never from the browser.
 */
export const createInvoiceCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { invoiceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: invoice, error } = await supabase
      .from("client_invoices")
      .select(
        "id,workspace_id,number,description,amount_cents,amount_paid_cents,currency,status,published_at,provider_session_id",
      )
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw error;
    if (!invoice) throw new Error("Invoice not found.");
    if (!invoice.published_at)
      throw new Error("This invoice is still a draft and cannot be paid yet.");
    if (invoice.status === "paid" || invoice.status === "void") {
      throw new Error("This invoice is already settled.");
    }

    const total = invoice.amount_cents ?? 0;
    const paid = invoice.amount_paid_cents ?? 0;
    const due = total - paid;
    if (due <= 0) throw new Error("This invoice has no balance due.");
    if (!stripeIsTestMode()) throw new Error("Payments are available in test mode only.");

    // A retry must leave the client with a new hosted session. Expire an old
    // open session before creating another; never recycle a fixed idempotency key.
    if (invoice.provider_session_id?.startsWith("cs_test_")) {
      try {
        const previous = await stripeRequest<StripeCheckoutSession>(
          `/checkout/sessions/${encodeURIComponent(invoice.provider_session_id)}`,
          { method: "GET" },
        );
        if (previous.status === "complete" || previous.payment_status === "paid") {
          throw new Error(
            "A payment is already processing. Refresh the invoice before trying again.",
          );
        }
        if (previous.status === "open") {
          await stripeRequest(`/checkout/sessions/${encodeURIComponent(previous.id)}/expire`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("A payment is already")) throw error;
        // Stripe may already have expired a session. The new session is still
        // safe because invoice balance is read above from the server.
        console.warn("[stripe] could not expire prior checkout session", invoice.id);
      }
    }

    const origin = originFromRequest();
    const session = await stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
      body: {
        mode: "payment",
        success_url: `${origin}/home?invoice=${invoice.id}&payment=success`,
        cancel_url: `${origin}/home?invoice=${invoice.id}&payment=cancelled`,
        client_reference_id: invoice.id,
        metadata: {
          invoice_id: invoice.id,
          workspace_id: invoice.workspace_id,
          invoice_number: invoice.number ?? "",
        },
        payment_intent_data: {
          metadata: { invoice_id: invoice.id, workspace_id: invoice.workspace_id },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: (invoice.currency ?? "usd").toLowerCase(),
              unit_amount: due,
              product_data: {
                name: invoice.number ? `Invoice ${invoice.number}` : "Invoice",
                ...(invoice.description ? { description: invoice.description } : {}),
              },
            },
          },
        ],
      },
      // Unique per attempt, so Stripe never returns an expired session from a
      // previous request. This key still protects transport-level retries.
      idempotencyKey: `invoice:${invoice.id}:${crypto.randomUUID()}`,
    });

    if (!session.url || session.status !== "open" || session.livemode !== false) {
      throw new Error("Stripe did not return an open test payment link.");
    }
    const checkoutUrl = new URL(session.url);
    if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com") {
      throw new Error("Stripe returned an invalid payment destination.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let claim = supabaseAdmin
      .from("client_invoices")
      .update({ payment_provider: "stripe", provider_session_id: session.id })
      .eq("id", invoice.id);
    claim = invoice.provider_session_id
      ? claim.eq("provider_session_id", invoice.provider_session_id)
      : claim.is("provider_session_id", null);
    const { data: claimed, error: updateError } = await claim.select("id");
    if (updateError || !claimed?.length) {
      await stripeRequest(`/checkout/sessions/${encodeURIComponent(session.id)}/expire`);
      throw new Error("Checkout changed while loading. Refresh the invoice and try again.");
    }

    return { url: session.url, testMode: stripeIsTestMode() };
  });
