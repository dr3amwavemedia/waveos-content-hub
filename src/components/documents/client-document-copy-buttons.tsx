import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { businessFooterLine, businessProfile } from "@/lib/business-profile";
import { invoiceDocumentHtml } from "@/lib/invoice-document";
import { invoiceItemsFromJson } from "@/lib/invoice-items";
import type { Database } from "@/integrations/supabase/types";
import { getSignedContractArchiveLink } from "@/lib/contracts.functions";

type Invoice = Database["public"]["Tables"]["client_invoices"]["Row"];

const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

function openCopy(html: string) {
  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Allow the document window to open, then try again.");
    return;
  }
  win.opener = null;
  win.document.write(html);
  win.document.close();
  win.focus();
}

export function ClientInvoiceCopyButton({
  invoice,
  clientName,
}: {
  invoice: Invoice;
  clientName: string;
}) {
  const isPaid = invoice.status === "paid";
  return (
    <button
      type="button"
      onClick={() =>
        openCopy(
          invoiceDocumentHtml({
            id: invoice.id,
            number: invoice.number,
            description: invoice.description,
            currency: invoice.currency,
            amountCents: invoice.amount_cents,
            subtotalCents: invoice.subtotal_cents,
            discountType: invoice.discount_type,
            discountValue: invoice.discount_value,
            amountPaidCents: invoice.amount_paid_cents ?? 0,
            status: invoice.status,
            issuedAt: invoice.issued_at,
            dueAt: invoice.due_at,
            paidAt: invoice.paid_at,
            paymentPlan: invoice.payment_plan,
            checkoutPaymentType: invoice.checkout_payment_type,
            checkoutPaymentCents: invoice.checkout_payment_cents,
            billTo: { name: clientName },
            lineItems: invoiceItemsFromJson(invoice.line_items),
            isDraft: false,
          }),
        )
      }
      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted sm:w-auto"
    >
      <Printer className="h-4 w-4" />
      {isPaid ? "View / print receipt" : "View / print invoice"}
    </button>
  );
}

export function ClientContractCopyButton({
  title,
  description,
  signedAt,
}: {
  title: string;
  description: string | null;
  signedAt: string | null;
}) {
  const signedDate = signedAt
    ? new Date(signedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>@page{size:letter;margin:18mm}body{font:14px/1.65 Georgia,serif;color:#18232b;max-width:800px;margin:32px auto;padding:0 24px}header{border-bottom:2px solid #18232b;padding-bottom:18px}header img{max-height:64px}h1{font:700 25px system-ui;margin:24px 0 8px}.status{font:700 12px system-ui;color:#176b48;text-transform:uppercase}.body{white-space:pre-wrap;overflow-wrap:anywhere}footer{border-top:1px solid #ccc;margin-top:48px;padding-top:14px;font:12px system-ui;color:#566}</style></head><body><header><img src="${esc(businessProfile.logoUrl)}" alt="${esc(businessProfile.name)}"></header><h1>${esc(title)}</h1>${signedDate ? `<p class="status">Completed ${esc(signedDate)}</p>` : ""}<div class="body">${esc(description ?? "Contract copy unavailable.")}</div><footer>${esc(businessFooterLine)}</footer></body></html>`;
  return (
    <button
      type="button"
      onClick={() => openCopy(html)}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted sm:w-auto"
    >
      <FileText className="h-4 w-4" /> View / print contract copy
    </button>
  );
}

export function SignedContractPdfButton({ contractId }: { contractId: string }) {
  const getLink = useServerFn(getSignedContractArchiveLink);
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const { url } = await getLink({ data: { contractId } });
          window.open(url, "_blank", "noopener,noreferrer");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not open the signed PDF.");
        } finally {
          setLoading(false);
        }
      }}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Certified signed PDF
    </button>
  );
}
