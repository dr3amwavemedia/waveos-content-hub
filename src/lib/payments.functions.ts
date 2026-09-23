import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  stripeRequest,
  stripeIsTestMode,
  stripeModeMatches,
  type StripeCheckoutSession,
} from "@/lib/stripe.server";
import { publicReturnOrigin } from "@/lib/public-origin.server";
import {
  effectiveCheckoutPaymentType,
  nextInvoicePaymentCents,
  nextInvoicePaymentLabel,
} from "@/lib/invoice-payment-schedule";
import { applyStripeCheckoutPayment } from "@/lib/stripe-invoice-payment.server";

/**
 * Create a Stripe Checkout session for one invoice.
 * The caller must be able to read the invoice through RLS (staff or a member of
 * the invoice's workspace). Amount and currency always come from the database
 * row — never from the browser.
 */
export const createInvoiceCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { invoiceId: string; paymentAmountCents?: number }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: invoice, error } = await supabase
      .from("client_invoices")
      .select(
        "id,workspace_id,number,description,amount_cents,amount_paid_cents,currency,status,published_at,provider_session_id,payment_plan,checkout_payment_type,checkout_payment_cents",
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
    const paymentSchedule = {
      amountCents: total,
      amountPaidCents: paid,
      paymentPlan: invoice.payment_plan,
      checkoutPaymentType: invoice.checkout_payment_type,
      checkoutPaymentCents: invoice.checkout_payment_cents,
    };
    const minimumDue = nextInvoicePaymentCents(paymentSchedule);
    if (minimumDue <= 0) throw new Error("This invoice has no scheduled payment due.");
    const requestedAmount = data.paymentAmountCents;
    if (
      requestedAmount !== undefined &&
      (!Number.isSafeInteger(requestedAmount) || requestedAmount <= 0)
    ) {
      throw new Error("Enter a valid payment amount.");
    }
    // The browser may suggest an amount, but the server always enforces the
    // invoice's current balance and the admin-defined minimum/deposit.
    const dueNow = requestedAmount ?? minimumDue;
    if (dueNow < minimumDue) {
      throw new Error(`The minimum payment due is ${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: invoice.currency ?? "USD",
      }).format(minimumDue / 100)}.`);
    }
    if (dueNow > balance) {
      throw new Error("Payment cannot be greater than the remaining balance.");
    }
    const paymentType = effectiveCheckoutPaymentType(paymentSchedule);
    const paymentLabel = nextInvoicePaymentLabel(paymentSchedule).replace(/^Pay /, "");
    const checkoutItemLabel =
      dueNow === balance
        ? "Remaining balance"
        : dueNow === minimumDue
          ? (paymentLabel === "now" ? "Invoice payment" : paymentLabel)
          : "Partial payment";
    const invoiceLabel = invoice.number ?? "Invoice";
    const remainingAfterPayment = Math.max(0, balance - dueNow);
    const money = (cents: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: invoice.currency ?? "USD",
      }).format(cents / 100);
    const checkoutDescription =
      paymentType === "deposit" && paid === 0
        ? `Deposit toward a ${money(total)} invoice. ${money(remainingAfterPayment)} remains after this payment.`
        : paymentType === "fixed"
          ? `Installment toward a ${money(total)} invoice. ${money(remainingAfterPayment)} remains after this payment.`
          : invoice.description;
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
          payment_type: paymentType,
          payment_amount_cents: String(dueNow),
        },
        payment_intent_data: {
          metadata: {
            invoice_id: invoice.id,
            workspace_id: invoice.workspace_id,
            payment_type: paymentType,
          },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: (invoice.currency ?? "usd").toLowerCase(),
              unit_amount: dueNow,
              product_data: {
                name: `${checkoutItemLabel.charAt(0).toUpperCase()}${checkoutItemLabel.slice(1)} · ${invoiceLabel}`,
                ...(checkoutDescription ? { description: checkoutDescription } : {}),
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
  .validator((d: { invoiceId: string; sessionId?: string }) => d)
  .handler(async ({ data, context }) => {
    const invoiceColumns =
      "id,workspace_id,number,status,amount_cents,amount_paid_cents,currency,paid_at,published_at,provider_session_id,payment_plan,checkout_payment_type,checkout_payment_cents";
    const { data: initialInvoice, error } = await context.supabase
      .from("client_invoices")
      .select(invoiceColumns)
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw error;
    if (!initialInvoice) throw new Error("This invoice is not available on your account.");

    let invoice = initialInvoice;
    let outcome: "processed" | "declined" | "processing" =
      invoice.status === "paid" || invoice.amount_paid_cents > 0 ? "processed" : "processing";

    // Stripe substitutes the Checkout Session id into the signed-in return URL.
    // Verify it belongs to this RLS-authorized invoice, then reconcile directly
    // with Stripe. The webhook uses the same idempotent recorder, so whichever
    // request arrives first updates the invoice exactly once.
    if (
      outcome !== "processed" &&
      data.sessionId?.startsWith("cs_") &&
      data.sessionId === invoice.provider_session_id
    ) {
      const session = await stripeRequest<StripeCheckoutSession>(
        `/checkout/sessions/${encodeURIComponent(data.sessionId)}`,
        { method: "GET" },
      );
      if (!stripeModeMatches(session.livemode)) {
        throw new Error("Stripe returned a payment from the wrong mode.");
      }
      if (session.status === "expired") {
        outcome = "declined";
      } else if (session.status === "complete" && session.payment_status === "paid") {
        const result = await applyStripeCheckoutPayment(invoice, session);
        if (result.kind === "invalid" || result.kind === "review") {
          throw new Error("This payment needs review before the invoice can be updated.");
        }
        const { data: refreshed, error: refreshError } = await context.supabase
          .from("client_invoices")
          .select(invoiceColumns)
          .eq("id", data.invoiceId)
          .maybeSingle();
        if (refreshError) throw refreshError;
        if (refreshed) invoice = refreshed;
        outcome = "processed";
      }
    }

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
      outcome,
    };
  });
