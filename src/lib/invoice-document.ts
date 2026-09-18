import { businessFooterLine, businessProfile, type BusinessProfile } from "@/lib/business-profile";
import { nextInvoicePaymentCents } from "@/lib/invoice-payment-schedule";

export interface InvoiceLineItem {
  title?: string;
  description: string;
  quantity: number;
  unitCents: number;
}

export interface InvoiceDocument {
  id: string;
  number: string | null;
  description: string | null;
  currency: string;
  amountCents: number | null;
  subtotalCents?: number | null;
  discountType?: string | null;
  discountValue?: number | null;
  serviceFeePercent?: number | null;
  serviceFeeCents?: number | null;
  amountPaidCents: number;
  status: string;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  paymentPlan?: string | null;
  checkoutPaymentType?: string | null;
  checkoutPaymentCents?: number | null;
  billTo?: { name: string | null; contact?: string | null } | null;
  projectReference?: string | null;
  lineItems?: InvoiceLineItem[] | null;
  notes?: string | null;
  /** True when the record is a draft and must never reach a client. */
  isDraft?: boolean;
}

const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function invoiceTotalsFor(invoice: InvoiceDocument) {
  const lineSubtotal = (invoice.lineItems ?? []).reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitCents),
    0,
  );
  const subtotal =
    invoice.subtotalCents ?? (invoice.lineItems?.length ? lineSubtotal : invoice.amountCents);
  const total = invoice.amountCents ?? subtotal;
  const serviceFee = Math.max(0, invoice.serviceFeeCents ?? 0);
  const discount =
    subtotal == null || total == null ? 0 : Math.max(0, subtotal - (total - serviceFee));
  const paid = invoice.amountPaidCents ?? 0;
  const balance = total == null ? null : Math.max(0, total - paid);
  return { subtotal, discount, serviceFee, total, paid, balance };
}

const planLabels: Record<string, string> = {
  one_time: "One-time payment",
  deposit_balance: "Deposit + balance",
  installments: "Installments",
  monthly_retainer: "Monthly retainer",
};

/**
 * Branded single-invoice document for admin preview, print and PDF. Contains no
 * secret, payment token or signed URL — the pay action is a normal
 * authenticated WaveOS route.
 */
export function invoiceDocumentHtml(
  invoice: InvoiceDocument,
  options: { portalUrl?: string | null; profile?: BusinessProfile } = {},
): string {
  const profile = options.profile ?? businessProfile;
  const { subtotal, discount, serviceFee, total, paid, balance } = invoiceTotalsFor(invoice);
  const nextPayment = nextInvoicePaymentCents({
    amountCents: total,
    amountPaidCents: paid,
    paymentPlan: invoice.paymentPlan,
    checkoutPaymentType: invoice.checkoutPaymentType,
    checkoutPaymentCents: invoice.checkoutPaymentCents,
  });
  const items = invoice.lineItems?.length
    ? invoice.lineItems
    : [
        {
          description: invoice.description ?? "Services",
          quantity: 1,
          unitCents: invoice.subtotalCents ?? invoice.amountCents ?? 0,
        },
      ];

  const rows = items
    .map(
      (item) =>
        `<tr><td>${item.title ? `<strong>${esc(item.title)}</strong><br>` : ""}${esc(item.description)}</td><td class="num">${esc(item.quantity)}</td><td class="num">${esc(
          formatMoney(item.unitCents, invoice.currency),
        )}</td><td class="num">${esc(formatMoney(Math.round(item.quantity * item.unitCents), invoice.currency))}</td></tr>`,
    )
    .join("");

  const summary = [
    ["Subtotal", formatMoney(subtotal, invoice.currency)],
    ...(discount > 0
      ? [
          [
            invoice.discountType === "percentage" && invoice.discountValue != null
              ? `Discount (${(invoice.discountValue / 100).toFixed(2).replace(/\.00$/, "")}%)`
              : "Discount",
            `−${formatMoney(discount, invoice.currency)}`,
          ],
        ]
      : []),
    ...(serviceFee > 0
      ? [
          [
            `Service fee (${((invoice.serviceFeePercent ?? 0) / 100).toFixed(2).replace(/\.00$/, "")}%)`,
            formatMoney(serviceFee, invoice.currency),
          ],
        ]
      : []),
    ["Total", formatMoney(total, invoice.currency)],
    ["Amount paid", formatMoney(paid, invoice.currency)],
    ["Balance due", formatMoney(balance, invoice.currency)],
    ...(nextPayment > 0 && nextPayment < (balance ?? 0)
      ? [["Next payment", formatMoney(nextPayment, invoice.currency)]]
      : []),
  ]
    .map(
      ([label, value]) =>
        `<tr class="${label === "Balance due" ? "total" : ""}"><th>${esc(label)}</th><td class="num">${esc(value)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(
    `Invoice ${invoice.number ?? invoice.id.slice(0, 8)} · ${profile.name}`,
  )}</title><style>
@page{size:letter;margin:16mm}
*{box-sizing:border-box}
body{font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#10191f;margin:0;padding:24px;background:#fff}
.sheet{max-width:820px;margin:0 auto}
header{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #10191f;padding-bottom:16px}
header img{max-height:72px;width:auto;height:auto}
.biz{font-size:12px;color:#40525c;text-align:right}
h1{font-size:26px;margin:20px 0 4px;letter-spacing:.02em}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.meta div span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5d6e78}
.status{display:inline-block;border:1px solid #10191f;border-radius:999px;padding:2px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.draft{background:#10191f;color:#fff}
table{width:100%;border-collapse:collapse;margin-top:12px}
thead{display:table-header-group}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #d9e0e4;overflow-wrap:anywhere}
tr{break-inside:avoid}
.num{text-align:right;white-space:nowrap}
.totals{max-width:320px;margin-left:auto}
.totals th{border-bottom:1px solid #d9e0e4;font-weight:500}
.totals .total th,.totals .total td{font-weight:700;border-bottom:none;border-top:2px solid #10191f}
.notes{margin-top:20px;font-size:12px;color:#40525c;white-space:pre-wrap}
.pay{margin-top:20px;padding:12px 14px;border:1px solid #10191f;border-radius:10px;font-size:12px}
.pay a{color:inherit}
footer{margin-top:28px;border-top:1px solid #d9e0e4;padding-top:10px;font-size:11px;color:#5d6e78;text-align:center}
@media print{body{padding:0}.pay{border-color:#888}}
</style></head><body><div class="sheet">
<header>
<img src="${esc(profile.logoUrl)}" alt="${esc(profile.name)}">
<div class="biz"><strong>${esc(profile.name)}</strong><br>${esc(profile.location)}<br>${esc(profile.phone)}<br>${esc(
    profile.website.replace(/^https?:\/\//, ""),
  )}</div>
</header>
<h1>Invoice</h1>
<p><span class="status${invoice.isDraft ? " draft" : ""}">${esc(invoice.isDraft ? "Draft — not sent" : invoice.status)}</span></p>
<div class="meta">
<div><span>Invoice number</span>${esc(invoice.number ?? invoice.id.slice(0, 8).toUpperCase())}</div>
<div><span>Issue date</span>${esc(formatDate(invoice.issuedAt))}</div>
<div><span>Due date</span>${esc(formatDate(invoice.dueAt))}</div>
<div><span>Currency</span>${esc(invoice.currency.toUpperCase())}</div>
<div><span>Bill to</span>${esc(invoice.billTo?.name ?? "—")}${invoice.billTo?.contact ? `<br>${esc(invoice.billTo.contact)}` : ""}</div>
<div><span>Project / event</span>${esc(invoice.projectReference ?? "—")}</div>
${invoice.paymentPlan ? `<div><span>Payment schedule</span>${esc(planLabels[invoice.paymentPlan] ?? invoice.paymentPlan)}</div>` : ""}
${invoice.paidAt ? `<div><span>Paid on</span>${esc(formatDate(invoice.paidAt))}</div>` : ""}
</div>
<table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<table class="totals"><tbody>${summary}</tbody></table>
${invoice.notes ? `<div class="notes">${esc(invoice.notes)}</div>` : ""}
${
  options.portalUrl && !invoice.isDraft
    ? `<div class="pay"><strong>Pay securely in WaveOS:</strong> <a href="${esc(options.portalUrl)}">${esc(options.portalUrl)}</a><br>Sign in to your client portal to view and pay this invoice.</div>`
    : ""
}
<footer>${esc(businessFooterLine)}</footer>
</div></body></html>`;
}
