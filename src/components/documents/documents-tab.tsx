import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FileStack, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { FormsPanel } from "./forms-panel";
import { ExpenseReceiptsPanel } from "./expense-receipts-panel";

type Section = "invoices" | "contracts" | "forms" | "receipts";

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: "invoices", label: "Invoices" },
  { key: "contracts", label: "Contracts" },
  { key: "forms", label: "Forms" },
  { key: "receipts", label: "Expense receipts" },
];

/**
 * One document home for a client: invoices, contracts, forms and expense
 * receipts, all bound to this client's workspace id. Invoices and contracts
 * reuse the existing admin panels, passed in as slots.
 */
export function DocumentsTab({
  workspaceId,
  clientName,
  invoicesSlot,
  contractsSlot,
}: {
  workspaceId: string;
  clientName: string;
  invoicesSlot: ReactNode;
  contractsSlot: ReactNode;
}) {
  const [section, setSection] = useState<Section>("invoices");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-surface/50 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 text-xs text-muted-foreground">
          Everything created here is assigned to{" "}
          <span className="font-medium text-foreground">{clientName}</span> (workspace{" "}
          <code className="rounded bg-elevated px-1">{workspaceId.slice(0, 8)}…</code>). The
          assignment is fixed at creation — switching clients later does not move a document.
          Drafts stay private; only the explicit Send action shows a document to the client.
        </div>
        <Link
          to="/templates"
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-elevated"
        >
          <FileStack className="h-3.5 w-3.5" /> Template Library
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-sm",
              section === s.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "invoices" && invoicesSlot}
      {section === "contracts" && contractsSlot}
      {section === "forms" && <FormsPanel workspaceId={workspaceId} clientName={clientName} />}
      {section === "receipts" && (
        <ExpenseReceiptsPanel workspaceId={workspaceId} clientName={clientName} />
      )}
    </div>
  );
}
