export type DocumentDraft = {
  kind: "Invoice" | "Quote" | "Receipt" | "Contract";
  recipient: string;
  reference: string;
  project: string;
  date: string;
  currency: string;
  amount: string;
  content: string;
  items?: { description: string; quantity: string; rate: string }[];
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
  const items = record.items ?? [];
  if (
    !Array.isArray(items) ||
    items.length > 100 ||
    items.some(
      (item) =>
        !item ||
        ["description", "quantity", "rate"].some(
          (key) => typeof item[key] !== "string" || item[key].length > 300,
        ),
    )
  )
    throw new Error("Invalid service line items.");
  const result = Object.fromEntries(keys.map((key) => [key, record[key]])) as DocumentDraft;
  if (record.items !== undefined)
    result.items = items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
    }));
  if (result.date && !/^\d{4}-\d{2}-\d{2}$/.test(result.date))
    throw new Error("Invalid document date.");
  return result;
}
export function moneyCents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
export function lineItemCents(item: { quantity: string; rate: string }): number | null {
  const rate = moneyCents(item.rate);
  if (!/^\d+(\.\d{1,3})?$/.test(item.quantity.trim()) || rate === null) return null;
  const [whole, fraction = ""] = item.quantity.trim().split(".");
  const quantity = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(quantity * rate))
    return null;
  const cents = Math.round((quantity * rate) / 1000);
  return Number.isSafeInteger(cents) ? cents : null;
}
export function draftTotalCents(draft: DocumentDraft): number | null {
  if (!draft.items?.length) return draft.amount.trim() ? moneyCents(draft.amount) : null;
  const totals = draft.items.map(lineItemCents);
  if (totals.some((total) => total === null)) return null;
  const sum = totals.reduce<number>((total, value) => total + value!, 0);
  return Number.isSafeInteger(sum) ? sum : null;
}
export function draftFilename(draft: DocumentDraft) {
  return [draft.kind, draft.recipient || "vendor", draft.reference || "draft"]
    .map(
      (value) =>
        value
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) || "draft",
    )
    .join("-")
    .toLowerCase();
}
export function documentDraftHtml(draft: DocumentDraft) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  const amount = draftTotalCents(draft);
  const formatted =
    amount !== null
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: draft.currency }).format(
          amount / 100,
        )
      : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(draftFilename(draft))}</title><style>@page{margin:22mm}body{font:14px system-ui;color:#18232b;max-width:800px;margin:30px auto;padding:12px}header{border-bottom:3px solid #227b83;padding-bottom:20px}h1{font-size:34px}dt{color:#555;font-size:12px}dd{margin:4px 0 18px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}section{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}footer{margin-top:40px;border-top:1px solid #ddd;padding-top:15px;color:#555;font-size:12px}</style></head><body><header><p>Dream Wave Media</p><h1>${escape(draft.kind)} · Draft</h1></header><dl>${[
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
    )}</dl>${draft.items?.length ? `<table><thead><tr><th>Service</th><th>Quantity</th><th>Rate (${escape(draft.currency)})</th><th>Total (${escape(draft.currency)})</th></tr></thead><tbody>${draft.items.map((item) => `<tr><td>${escape(item.description)}</td><td>${escape(item.quantity)}</td><td>${escape(item.rate)}</td><td>${lineItemCents(item) === null ? "" : (lineItemCents(item)! / 100).toFixed(2)}</td></tr>`).join("")}</tbody></table>` : ""}<section>${escape(draft.content)}</section><footer>Draft for review. This document does not confirm payment, signature or acceptance.</footer></body></html>`;
}
