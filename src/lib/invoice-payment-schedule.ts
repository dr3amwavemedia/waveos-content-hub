export type CheckoutPaymentType = "remaining" | "deposit" | "fixed";

export type InvoicePaymentSchedule = {
  amountCents: number | null | undefined;
  amountPaidCents: number | null | undefined;
  checkoutPaymentType?: string | null;
  checkoutPaymentCents?: number | null;
};

export function nextInvoicePaymentCents(invoice: InvoicePaymentSchedule): number {
  const total = Math.max(0, invoice.amountCents ?? 0);
  const paid = Math.max(0, invoice.amountPaidCents ?? 0);
  const remaining = Math.max(0, total - paid);
  const scheduled = Math.max(0, invoice.checkoutPaymentCents ?? 0);

  if (invoice.checkoutPaymentType === "fixed" && scheduled > 0) {
    return Math.min(scheduled, remaining);
  }
  if (invoice.checkoutPaymentType === "deposit" && paid === 0 && scheduled > 0) {
    return Math.min(scheduled, remaining);
  }
  return remaining;
}

export function nextInvoicePaymentLabel(invoice: InvoicePaymentSchedule): string {
  if (invoice.checkoutPaymentType === "fixed") return "Pay installment";
  if (invoice.checkoutPaymentType === "deposit" && (invoice.amountPaidCents ?? 0) === 0) {
    return "Pay deposit";
  }
  return (invoice.amountPaidCents ?? 0) > 0 ? "Pay remaining balance" : "Pay now";
}
