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
      .select("id,workspace_id,number,description,amount_cents,amount_paid_cents,currency,status,published_at,provider_session_id")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw error;
    if (!invoice) throw new Error("Invoice not found.");
    if (!invoice.published_at) throw new Error("This invoice is still a draft and cannot be paid yet.");
    if (invoice.status === "paid" || invoice.status === "void") {
      throw new Error("This invoice is already settled.");
    }

    const total = invoice.amount_cents ?? 0;
    const paid = invoice.amount_paid_cents ?? 0;
    const due = total - paid;
    if (due <= 0) throw new Error("This invoice has no balance due.");

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
      // Same balance + same invoice => same session, so double clicks cannot double charge.
      idempotencyKey: `invoice:${invoice.id}:${due}`,
    });

    if (!session.url) throw new Error("Stripe did not return a payment link.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("client_invoices")
      .update({ payment_provider: "stripe", provider_session_id: session.id })
      .eq("id", invoice.id);

    return { url: session.url, testMode: stripeIsTestMode() };
  });
