import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  stripeRequest,
  stripeIsTestMode,
  stripeModeMatches,
  type StripeCheckoutSession,
} from "@/lib/stripe.server";
import { publicReturnOrigin } from "@/lib/public-origin.server";
import { nextInvoicePaymentCents } from "@/lib/invoice-payment-schedule";

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
        "id,workspace_id,number,description,amount_cents,amount_paid_cents,currency,status,published_at,provider_session_id,checkout_payment_type,checkout_payment_cents",
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
    const balance = total - paid;
    if (balance <= 0) throw new Error("This invoice has no balance due.");
    const dueNow = nextInvoicePaymentCents({
      amountCents: total,
      amountPaidCents: paid,
      checkoutPaymentType: invoice.checkout_payment_type,
      checkoutPaymentCents: invoice.checkout_payment_cents,
    });
    if (dueNow <= 0) throw new Error("This invoice has no scheduled payment due.");
    // Validate the public return address BEFORE touching any Stripe session, so
    // a misconfigured setting can never expire a client's existing checkout.
    const origin = publicReturnOrigin();

    // A retry must leave the client with a new hosted session. Expire an old
    // open session before creating another; never recycle a fixed idempotency key.
    if (invoice.provider_session_id?.startsWith("cs_")) {
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

    const returnBase = `${origin}/payment-return?invoice=${invoice.id}`;
    const session = await stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
      body: {
        mode: "payment",
        // {CHECKOUT_SESSION_ID} is substituted by Stripe on redirect.
        success_url: `${returnBase}&status=submitted&session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${returnBase}&status=cancelled`,
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
              unit_amount: dueNow,
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

    if (!session.url || session.status !== "open" || !stripeModeMatches(session.livemode)) {
      throw new Error("Stripe did not return an open payment link for the configured mode.");
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

/**
 * Authorized read of one invoice's payment state, used by the return page while
 * it waits for the verified Stripe webhook. RLS scopes the read to the client
 * who owns the invoice (or Dream Wave staff); nothing here changes any state.
 */
export const getInvoicePaymentState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { invoiceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: invoice, error } = await context.supabase
      .from("client_invoices")
      .select("id,number,status,amount_cents,amount_paid_cents,currency,paid_at,published_at")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw error;
    if (!invoice) throw new Error("This invoice is not available on your account.");
    const total = invoice.amount_cents ?? 0;
    const paid = invoice.amount_paid_cents ?? 0;
    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      currency: invoice.currency ?? "usd",
      amountCents: total,
      paidCents: paid,
      dueCents: Math.max(total - paid, 0),
      paidAt: invoice.paid_at,
      confirmed: invoice.status === "paid" || paid > 0,
    };
  });
