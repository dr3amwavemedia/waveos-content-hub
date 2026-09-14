import { useState } from "react";
import { toast } from "sonner";
import { documentDraftHtml, readDocumentDraft, type DocumentDraft } from "@/lib/document-draft";
import { ProjectNavigationGuard } from "@/components/production/project-navigation-guard";

export function DocumentDraftTools() {
  const [draft, setDraft] = useState<DocumentDraft>({
    kind: "Quote",
    recipient: "",
    reference: "",
    project: "",
    date: new Date().toLocaleDateString("en-CA"),
    currency: "USD",
    amount: "",
    content: "",
  });
  const [open, setOpen] = useState(false);
  const update = (key: keyof DocumentDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const invalidAmount =
    !!draft.amount && (!Number.isFinite(Number(draft.amount)) || Number(draft.amount) < 0);
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <ProjectNavigationGuard
        subject="your document draft"
        dirty={
          !!(draft.recipient || draft.reference || draft.project || draft.amount || draft.content)
        }
      />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between text-left font-semibold"
      >
        Prepare vendor or white-label documents
        <span className="ml-3 text-sm text-primary">{open ? "Close" : "Open"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-muted-foreground">
            Prepare a document for review and save a PDF. Your draft stays here while this page is
            open. It is not sent or added to client billing.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border px-3 text-sm"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "waveos-document-draft.json";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Save editable draft
            </button>
            <label className="text-sm">
              Open saved draft
              <input
                type="file"
                accept=".json,application/json"
                className="mt-1 block max-w-full text-sm"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  try {
                    if (file.size > 200000) throw new Error("Choose a draft smaller than 200 KB.");
                    const loaded = readDocumentDraft(JSON.parse(await file.text()));
                    if (
                      (draft.recipient || draft.content) &&
                      !window.confirm("Replace the current draft with this saved file?")
                    )
                      return;
                    setDraft(loaded);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not open draft.");
                  }
                }}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Document type
              <select
                value={draft.kind}
                onChange={(event) => update("kind", event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
              >
                {["Quote", "Invoice", "Receipt", "Contract"].map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            {(
              [
                ["recipient", "Recipient / vendor"],
                ["reference", "Reference number"],
                ["project", "Project / white-label job"],
                ["date", "Date"],
                ["amount", "Amount (optional)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                {label}
                <input
                  value={draft[key]}
                  onChange={(event) => update(key, event.target.value)}
                  type={key === "date" ? "date" : key === "amount" ? "number" : "text"}
                  min={key === "amount" ? "0" : undefined}
                  step={key === "amount" ? "0.01" : undefined}
                  maxLength={300}
                  className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base"
                />
              </label>
            ))}
            <label className="text-sm">
              Currency
              <select
                value={draft.currency}
                onChange={(event) => update("currency", event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
              >
                {["USD", "CAD", "EUR", "GBP", "AUD"].map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            {draft.kind === "Contract"
              ? "Your approved agreement text"
              : "Services, line items and notes"}
            <textarea
              value={draft.content}
              onChange={(event) => update("content", event.target.value)}
              rows={8}
              maxLength={40000}
              className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-base"
            />
          </label>
          {invalidAmount && (
            <p role="alert" className="text-sm text-destructive">
              Enter an amount of zero or more.
            </p>
          )}
          <button
            type="button"
            disabled={!draft.recipient.trim() || !draft.content.trim() || invalidAmount}
            onClick={() => {
              const win = window.open("", "_blank");
              if (!win) {
                toast.error("Allow the document window to open, then try again.");
                return;
              }
              win.opener = null;
              win.document.write(documentDraftHtml(draft));
              win.document.close();
              win.focus();
              win.print();
            }}
            className="min-h-11 rounded-xl bg-primary px-4 text-primary-foreground disabled:opacity-50"
          >
            Print draft / Save PDF
          </button>
        </div>
      )}
    </section>
  );
}
