import { useState } from "react";
import { contractRecordsCsv, type ExportContract } from "@/lib/contract-export";

export function ContractExportTools({ contracts }: { contracts: ExportContract[] }) {
  const [status, setStatus] = useState("");
  const records = contracts.filter((c) => !status || c.status === status);
  return (
    <details className="rounded-xl border border-border bg-surface p-3 text-sm text-foreground">
      <summary className="min-h-11 cursor-pointer font-medium">Download contract records</summary>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          Recorded status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
          >
            <option value="">All statuses</option>
            {[...new Set(contracts.map((c) => c.status))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!records.length}
          className="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([contractRecordsCsv(records)], { type: "text/csv;charset=utf-8" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "waveos-contract-records.csv";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download CSV ({records.length})
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Exports recorded dates and statuses. For the agreement itself, open its document link.
      </p>
    </details>
  );
}
