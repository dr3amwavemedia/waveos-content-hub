import { useState } from "react";
import { toast } from "sonner";
import type { ExportInvoice } from "@/lib/invoice-export";
import { invoiceDocumentHtml, formatMoney } from "@/lib/invoice-document";
import { missingBusinessProfileFields } from "@/lib/business-profile";
import { invoiceItemsFromJson } from "@/lib/invoice-items";

/**
 * Branded single-invoice preview / print. Uses the recorded invoice values
 * only — it does not change any record and sends nothing to the client.
 */
export function InvoiceDocumentTools({
  invoices,
  clientName,
  projectReference,
}: {
  invoices: ExportInvoice[];
  clientName?: string | null;
  projectReference?: string | null;
}) {
  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? "");
  const invoice = invoices.find((i) => i.id === selectedId) ?? invoices[0];
  const missing = missingBusinessProfileFields();

  if (!invoices.length) return null;

  const openDocument = () => {
    if (!invoice) return;
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Allow the invoice window to open, then try again.");
      return;
    }
    win.opener = null;
    win.document.write(
      invoiceDocumentHtml(
        {
          id: invoice.id,
          number: invoice.number,
          description: invoice.description,
          currency: invoice.currency,
          amountCents: invoice.amount_cents,
          subtotalCents: invoice.subtotal_cents,
          discountType: invoice.discount_type,
          discountValue: invoice.discount_value,
          serviceFeePercent: invoice.service_fee_percent,
          serviceFeeCents: invoice.service_fee_cents,
          amountPaidCents: invoice.amount_paid_cents,
          status: invoice.status,
          issuedAt: invoice.issued_at,
          dueAt: invoice.due_at,
          paidAt: invoice.paid_at,
          paymentPlan: invoice.payment_plan,
          checkoutPaymentType: invoice.checkout_payment_type,
          checkoutPaymentCents: invoice.checkout_payment_cents,
          billTo: clientName ? { name: clientName } : null,
          projectReference: projectReference ?? null,
          lineItems: invoiceItemsFromJson(invoice.line_items),
          isDraft: invoice.status === "draft",
        },
        { portalUrl: `${window.location.origin}/home` },
      ),
    );
    win.document.close();
    win.focus();
  };

  return (
    <details className="rounded-xl border border-border p-3 text-sm">
      <summary className="min-h-11 cursor-pointer font-medium">Branded invoice document</summary>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          Invoice
          <select
            value={invoice?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-2"
          >
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {(i.number ?? i.id.slice(0, 8).toUpperCase()) +
                  ` · ${formatMoney(i.amount_cents, i.currency)} · ${i.status}`}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={openDocument}
          className="min-h-11 rounded-lg border border-border px-3"
        >
          Preview / print
        </button>
      </div>
      {invoice?.status === "draft" && (
        <p className="mt-2 text-xs text-muted-foreground">
          This is a draft. It is marked as a draft on the document and is not visible to the client.
        </p>
      )}
      {missing.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Before sending a production invoice, add: {missing.join(", ")}.
        </p>
      )}
    </details>
  );
}
