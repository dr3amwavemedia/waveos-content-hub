import { useState } from "react";
import { toast } from "sonner";
import { invoiceCsv, invoiceReportHtml, type ExportInvoice } from "@/lib/invoice-export";

export function InvoiceExportTools({ invoices }: { invoices: ExportInvoice[] }) {
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [status, setStatus] = useState("");
  const invalid = !!from && !!through && from > through;
  const filtered = invoices.filter(
    (i) =>
      (!from || i.issued_at.slice(0, 10) >= from) &&
      (!through || i.issued_at.slice(0, 10) <= through) &&
      (!status || status === i.status),
  );
  return (
    <details className="rounded-xl border border-border p-3 text-sm">
      <summary className="min-h-11 cursor-pointer font-medium">Download invoice records</summary>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          Issued from (UTC)
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-2"
          />
        </label>
        <label>
          Through (UTC)
          <input
            type="date"
            value={through}
            onChange={(e) => setThrough(e.target.value)}
            className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-2"
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-2"
          >
            <option value="">All statuses</option>
            {[...new Set(invoices.map((i) => i.status))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {invalid && <p role="alert">The end date must be on or after the start date.</p>}
      <p className="my-2 text-xs text-muted-foreground">
        {filtered.length} records. Payment amounts reflect the values recorded in WaveOS.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={invalid || !filtered.length}
          className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([invoiceCsv(filtered)], { type: "text/csv;charset=utf-8" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "waveos-invoice-records.csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download CSV
        </button>
        <button
          type="button"
          disabled={invalid || !filtered.length}
          className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50"
          onClick={() => {
            const win = window.open("", "_blank");
            if (!win) {
              toast.error("Allow the report window to open, then try again.");
              return;
            }
            win.opener = null;
            win.document.write(invoiceReportHtml(filtered));
            win.document.close();
            win.focus();
            win.print();
          }}
        >
          Print / Save PDF
        </button>
      </div>
    </details>
  );
}
