export type CheckoutPaymentType = "remaining" | "deposit" | "fixed";

export type InvoicePaymentSchedule = {
  amountCents: number | null | undefined;
  amountPaidCents: number | null | undefined;
  paymentPlan?: string | null;
  checkoutPaymentType?: string | null;
  checkoutPaymentCents?: number | null;
};

export function checkoutPaymentTypeForPlan(paymentPlan: string | null | undefined): CheckoutPaymentType {
  if (paymentPlan === "deposit_balance") return "deposit";
  if (paymentPlan === "installments") return "fixed";
  return "remaining";
}

export function effectiveCheckoutPaymentType(
  invoice: InvoicePaymentSchedule,
): CheckoutPaymentType {
  const planType = checkoutPaymentTypeForPlan(invoice.paymentPlan);
  if (planType !== "remaining") return planType;
  if (invoice.checkoutPaymentType === "deposit" || invoice.checkoutPaymentType === "fixed") {
    return invoice.checkoutPaymentType;
  }
  return "remaining";
}

export function nextInvoicePaymentCents(invoice: InvoicePaymentSchedule): number {
  const total = Math.max(0, invoice.amountCents ?? 0);
  const paid = Math.max(0, invoice.amountPaidCents ?? 0);
  const remaining = Math.max(0, total - paid);
  const paymentType = effectiveCheckoutPaymentType(invoice);
  const scheduled = Math.max(
    0,
    invoice.checkoutPaymentCents ??
      (paymentType === "deposit" && paid === 0 ? Math.round(total / 2) : 0),
  );

  if (paymentType === "fixed" && scheduled > 0) {
    return Math.min(scheduled, remaining);
  }
  if (paymentType === "deposit" && paid === 0 && scheduled > 0) {
    return Math.min(scheduled, remaining);
  }
  return remaining;
}

export function nextInvoicePaymentLabel(invoice: InvoicePaymentSchedule): string {
  const paymentType = effectiveCheckoutPaymentType(invoice);
  if (paymentType === "fixed") return "Pay installment";
  if (paymentType === "deposit" && (invoice.amountPaidCents ?? 0) === 0) {
    return "Pay deposit";
  }
  return (invoice.amountPaidCents ?? 0) > 0 ? "Pay remaining balance" : "Pay now";
}
