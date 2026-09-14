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
export function invoiceReportHtml(invoices: ExportInvoice[]): string {
  const html = (value: unknown) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  return `<!doctype html><html><head><meta charset="utf-8"><title>WaveOS invoice records</title><style>@page{size:landscape;margin:15mm}body{font:11px system-ui;color:#18232b}h1{font-size:24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}p{color:#555}</style></head><body><h1>Dream Wave Media · Invoice records</h1><p>Amounts are in cents in the currency shown. Recorded payment values reflect WaveOS records. This report is not a payment receipt or bank reconciliation.</p><table><thead><tr>${columns.map((c) => `<th>${html(c)}</th>`).join("")}</tr></thead><tbody>${invoiceExportRows(
    invoices,
  )
    .map((row) => `<tr>${row.map((c) => `<td>${html(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></body></html>`;
}
