import { nextInvoicePaymentCents } from "@/lib/invoice-payment-schedule";
import { stripeModeMatches, type StripeCheckoutSession } from "@/lib/stripe.server";

type AdminClient = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type StripeInvoice = {
  id: string;
  workspace_id: string;
  number: string | null;
  amount_cents: number | null;
  amount_paid_cents: number;
  currency: string;
  status: string;
  provider_session_id: string | null;
  payment_plan: string | null;
  checkout_payment_type: string | null;
  checkout_payment_cents: number | null;
};

export type StripeInvoicePaymentResult = {
  kind: "applied" | "duplicate" | "invalid" | "review";
  paidNow: number;
  settled: boolean;
};

const payerEmailFromSession = (session: StripeCheckoutSession) => {
  const email = session.customer_details?.email;
  return typeof email === "string" ? email : null;
};

/**
 * Record one verified Stripe Checkout payment exactly once.
 *
 * Both the Stripe webhook and the authenticated return page use this function,
 * so the first request to see Stripe's paid session updates the invoice. The
 * payment ledger's unique provider id makes concurrent webhook/return requests
 * replay safe.
 */
export async function applyStripeCheckoutPayment(
  invoice: StripeInvoice,
  session: StripeCheckoutSession,
  occurredAt = new Date().toISOString(),
): Promise<StripeInvoicePaymentResult> {
  const total = invoice.amount_cents ?? 0;
  const alreadyPaid = invoice.amount_paid_cents ?? 0;
  const received = Number(session.amount_total ?? 0);
  const paymentId = String(session.payment_intent ?? session.id ?? "");
  const expectedDue = nextInvoicePaymentCents({
    amountCents: invoice.amount_cents,
    amountPaidCents: alreadyPaid,
    paymentPlan: invoice.payment_plan,
    checkoutPaymentType: invoice.checkout_payment_type,
    checkoutPaymentCents: invoice.checkout_payment_cents,
  });
  const matchesInvoice =
    session.payment_status === "paid" &&
    stripeModeMatches(session.livemode) &&
    session.id === invoice.provider_session_id &&
    session.client_reference_id === invoice.id &&
    session.metadata?.invoice_id === invoice.id &&
    String(session.currency ?? "").toUpperCase() === invoice.currency.toUpperCase() &&
    received === expectedDue;

  if (!paymentId || !Number.isSafeInteger(received) || received <= 0) {
    return { kind: "invalid", paidNow: alreadyPaid, settled: false };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ledger = await supabaseAdmin.from("payment_ledger").insert({
    source: "stripe",
    external_id: paymentId,
    invoice_id: invoice.id,
    workspace_id: invoice.workspace_id,
    kind: "payment",
    amount_cents: received,
    currency: String(session.currency ?? "usd").toUpperCase(),
    occurred_at: occurredAt,
    description: `Stripe payment for invoice ${invoice.id}`,
    status: matchesInvoice ? "posted" : "unmatched",
  });

  if (ledger.error?.code === "23505") {
    const { data: current } = await supabaseAdmin
      .from("client_invoices")
      .select("amount_cents,amount_paid_cents,status")
      .eq("id", invoice.id)
      .maybeSingle();
    const paidNow = current?.amount_paid_cents ?? alreadyPaid;
    const settled =
      current?.status === "paid" ||
      ((current?.amount_cents ?? total) > 0 && paidNow >= (current?.amount_cents ?? total));
    await releaseHolds(supabaseAdmin, invoice.workspace_id, settled);
    return { kind: "duplicate", paidNow, settled };
  }
  if (ledger.error) throw ledger.error;

  if (!matchesInvoice) {
    await supabaseAdmin
      .from("client_invoices")
      .update({ refund_flagged_at: new Date().toISOString() })
      .eq("id", invoice.id);
    return { kind: "review", paidNow: alreadyPaid, settled: false };
  }

  const paidNow = Math.min(alreadyPaid + received, Math.max(total, 0) || Number.MAX_SAFE_INTEGER);
  const settled = total > 0 && paidNow >= total;
  const { data: updated, error: invoiceError } = await supabaseAdmin
    .from("client_invoices")
    .update({
      amount_paid_cents: paidNow,
      status: settled ? "paid" : "deposit",
      paid_at: settled ? new Date().toISOString() : null,
      payment_provider: "stripe",
      provider_payment_id: session.payment_intent,
      provider_session_id: null,
    })
    .eq("id", invoice.id)
    .eq("amount_paid_cents", alreadyPaid)
    .eq("provider_session_id", session.id)
    .select("id");

  if (invoiceError || !updated?.length) {
    await supabaseAdmin
      .from("payment_ledger")
      .delete()
      .eq("source", "stripe")
      .eq("external_id", paymentId);
    if (invoiceError) throw invoiceError;
    throw new Error("invoice_changed_during_payment_confirmation");
  }

  await releaseHolds(supabaseAdmin, invoice.workspace_id, settled);

  try {
    const { sendPaymentReceiptEmail } = await import("@/lib/document-completion-email.server");
    await sendPaymentReceiptEmail(
      invoice.workspace_id,
      {
        invoiceNumber: invoice.number || `Invoice ${invoice.id.slice(0, 8).toUpperCase()}`,
        receivedCents: received,
        totalPaidCents: paidNow,
        balanceCents: Math.max(0, total - paidNow),
        currency: invoice.currency,
      },
      payerEmailFromSession(session),
    );
  } catch {
    console.error("[stripe] payment receipt email failed for invoice", invoice.id);
  }

  return { kind: "applied", paidNow, settled };
}

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
