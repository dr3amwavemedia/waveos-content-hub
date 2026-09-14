export type ExportInvoice = {
  id: string;
  number: string | null;
  description: string | null;
  amount_cents: number | null;
  amount_paid_cents: number;
  currency: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
};
const columns = [
  "Record ID",
  "Invoice number",
  "Description",
  "Currency",
  "Amount (cents)",
  "Recorded paid (cents)",
  "Balance (cents)",
  "Status",
  "Issued (ISO)",
  "Due (ISO)",
  "Paid (ISO)",
];
export function invoiceExportRows(invoices: ExportInvoice[]) {
  return invoices.map((i) => [
    i.id,
    i.number,
    i.description,
    i.currency,
    i.amount_cents,
    i.amount_paid_cents,
    i.amount_cents == null ? null : i.amount_cents - i.amount_paid_cents,
    i.status,
    i.issued_at,
    i.due_at,
    i.paid_at,
  ]);
}
export function invoiceCsv(invoices: ExportInvoice[]): string {
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (typeof value !== "number" && /^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return (
    "\uFEFF" +
    [columns, ...invoiceExportRows(invoices)].map((row) => row.map(cell).join(",")).join("\r\n") +
    "\r\n"
  );
}
export function invoiceTotals(invoices: ExportInvoice[]) {
  const groups = new Map<
    string,
    { currency: string; billed: number; paid: number; balance: number; unknown: number }
  >();
  for (const invoice of invoices) {
    const group = groups.get(invoice.currency) ?? {
      currency: invoice.currency,
      billed: 0,
      paid: 0,
      balance: 0,
      unknown: 0,
    };
    group.paid += invoice.amount_paid_cents;
    if (invoice.amount_cents == null) group.unknown++;
    else {
      group.billed += invoice.amount_cents;
      group.balance += invoice.amount_cents - invoice.amount_paid_cents;
    }
    groups.set(invoice.currency, group);
  }
  return [...groups.values()];
}
export function invoiceReportHtml(invoices: ExportInvoice[]): string {
  const html = (value: unknown) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  const money = (cents: number | null, currency: string) => {
    if (cents == null) return "";
    try {
      return html(
        new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100),
      );
    } catch {
      return `${(cents / 100).toFixed(2)} ${html(currency)}`;
    }
  };
  const headings = [
    "Record ID",
    "Invoice number",
    "Description",
    "Currency",
    "Amount",
    "Recorded paid",
    "Balance",
    "Status",
    "Issued (ISO)",
    "Due (ISO)",
    "Paid (ISO)",
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><title>WaveOS invoice records</title><style>@page{size:landscape;margin:15mm}body{font:11px system-ui;color:#18232b}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}p{color:#555}</style></head><body><h1>Dream Wave Media · Invoice records</h1><p>Payment values reflect WaveOS records. This report is not a payment receipt or bank reconciliation. CSV exports retain cents.</p><h2>Totals by currency</h2><table><thead><tr><th>Currency</th><th>Known billed subtotal</th><th>Recorded paid total</th><th>Known balance subtotal</th><th>Unknown amounts</th></tr></thead><tbody>${invoiceTotals(
    invoices,
  )
    .map(
      (group) =>
        `<tr><td>${html(group.currency)}</td><td>${money(group.billed, group.currency)}</td><td>${money(group.paid, group.currency)}</td><td>${money(group.balance, group.currency)}</td><td>${group.unknown}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table><p>Unknown invoice amounts are excluded from billed and balance subtotals. Recorded paid totals include all exported records. Currencies are kept separate.</p><table><thead><tr>${headings.map((c) => `<th>${html(c)}</th>`).join("")}</tr></thead><tbody>${invoices
    .map((invoice) => {
      const row = invoiceExportRows([invoice])[0];
      return `<tr>${row.map((value, index) => `<td>${index >= 4 && index <= 6 ? money(value as number | null, invoice.currency) : html(value)}</td>`).join("")}</tr>`;
    })
    .join("")}</tbody></table></body></html>`;
}
