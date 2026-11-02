export type ExistingInvoiceLedgerRow = {
  id: string;
  source: string;
  external_id: string;
};

/**
 * Decide where a manual invoice payment is written so one paid invoice keeps
 * one manual/backfill ledger entry. Invoices paid before the ledger existed
 * already have a backfill row keyed by the bare invoice id; that row is
 * updated in place instead of adding a second "manual:<id>" payment.
 */
export function manualPaymentLedgerTarget(
  invoiceId: string,
  existing: ExistingInvoiceLedgerRow[],
): { action: "update"; id: string } | { action: "upsert"; externalId: string } {
  const manualId = `manual:${invoiceId}`;
  const manual = existing.find(
    (row) => row.source === "invoice_backfill" && row.external_id === manualId,
  );
  if (manual) return { action: "upsert", externalId: manualId };
  const legacy = existing.find(
    (row) => row.source === "invoice_backfill" && row.external_id === invoiceId,
  );
  if (legacy) return { action: "update", id: legacy.id };
  return { action: "upsert", externalId: manualId };
}
