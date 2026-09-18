export type PaymentReceiptEmailInput = {
  invoiceNumber: string;
  receivedCents: number;
  totalPaidCents: number;
  balanceCents: number;
  currency: string;
};

export type SignedContractEmailInput = {
  contractTitle: string;
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);

export function paymentReceiptEmail(input: PaymentReceiptEmailInput) {
  const received = money(input.receivedCents, input.currency);
  const paid = money(input.totalPaidCents, input.currency);
  const balance = money(input.balanceCents, input.currency);
  return {
    eventType: "payment_receipt",
    subject: `Payment receipt: ${input.invoiceNumber}`,
    heading: "Your payment receipt",
    message: `We received ${received} for ${input.invoiceNumber}. Total paid: ${paid}. Remaining balance: ${balance}.`,
    buttonLabel: "View or print receipt",
    portalHash: "invoices",
  } as const;
}

export function signedContractEmail(input: SignedContractEmailInput) {
  return {
    eventType: "signed_contract_copy",
    subject: `Signed contract received: ${input.contractTitle}`,
    heading: "Your signed contract is complete",
    message: `${input.contractTitle} has been completed. A readable copy is available in your secure WaveOS portal.`,
    buttonLabel: "View contract copy",
    portalHash: "contracts",
  } as const;
}
