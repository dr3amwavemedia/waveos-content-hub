export type DocumentDraft = {
  kind: "Invoice" | "Quote" | "Receipt" | "Contract";
  recipient: string;
  reference: string;
  project: string;
  date: string;
  currency: string;
  amount: string;
  content: string;
};
export function readDocumentDraft(value: unknown): DocumentDraft {
  if (!value || typeof value !== "object") throw new Error("Choose a WaveOS draft file.");
  const record = value as Record<string, unknown>;
  const keys = [
    "kind",
    "recipient",
    "reference",
    "project",
    "date",
    "currency",
    "amount",
    "content",
  ] as const;
  if (
    keys.some(
      (key) =>
        typeof record[key] !== "string" ||
        (record[key] as string).length > (key === "content" ? 40000 : 300),
    ) ||
    !["Invoice", "Quote", "Receipt", "Contract"].includes(record.kind as string) ||
    !["USD", "CAD", "EUR", "GBP", "AUD"].includes(record.currency as string)
  )
    throw new Error("This file is not a supported WaveOS document draft.");
  return Object.fromEntries(keys.map((key) => [key, record[key]])) as DocumentDraft;
}
export function documentDraftHtml(draft: DocumentDraft) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  const amount = Number(draft.amount);
  const formatted =
    draft.amount.trim() && Number.isFinite(amount) && amount >= 0
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: draft.currency }).format(
          amount,
        )
      : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(draft.kind)} draft</title><style>@page{margin:22mm}body{font:14px system-ui;color:#18232b;max-width:800px;margin:30px auto}header{border-bottom:3px solid #227b83;padding-bottom:20px}h1{font-size:34px}dt{color:#555;font-size:12px}dd{margin:4px 0 18px}section{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}footer{margin-top:40px;border-top:1px solid #ddd;padding-top:15px;color:#555;font-size:12px}</style></head><body><header><p>Dream Wave Media</p><h1>${escape(draft.kind)} · Draft</h1></header><dl>${[
    ["Recipient / vendor", draft.recipient],
    ["Reference", draft.reference],
    ["Project / white-label job", draft.project],
    ["Date", draft.date],
    ["Amount", formatted],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<dt>${label}</dt><dd>${escape(value)}</dd>`)
    .join(
      "",
    )}</dl><section>${escape(draft.content)}</section><footer>Draft for review. This document does not confirm payment, signature or acceptance.</footer></body></html>`;
}
