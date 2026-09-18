import { dollarsToCents, parseBloomCsv, type CsvTable } from "@/lib/bloom-payments-csv";

/**
 * Automatic Bloom CSV understanding.
 *
 * The owner exports a full Bloom report and drops it in. Nothing is mapped by
 * hand: columns are detected from their headers, every row's record type is
 * inferred from its own data, and rows are matched back to WaveOS invoices by
 * invoice number, then client e-mail, then client name plus amount.
 */

export type LedgerKind = "payment" | "refund" | "invoice" | "expense";

export interface ColumnMap {
  sourceId?: string;
  invoiceNumber?: string;
  clientName?: string;
  clientEmail?: string;
  amount?: string;
  amountPaid?: string;
  amountDue?: string;
  date?: string;
  paidDate?: string;
  status?: string;
  type?: string;
  description?: string;
  currency?: string;
}

const ALIASES: Array<[keyof ColumnMap, RegExp]> = [
  [
    "invoiceNumber",
    /^(invoice(\s|_|-)?(number|no|#|id)?|inv(\s|_|-)?(number|no|#)|document(\s|_|-)?number)$/i,
  ],
  [
    "sourceId",
    /^(id|source(\s|_|-)?id|transaction(\s|_|-)?id|payment(\s|_|-)?id|reference|ref(\s|_|-)?(number|no|#)?|receipt(\s|_|-)?(number|no|#)?)$/i,
  ],
  [
    "amountPaid",
    /(amount\s*paid|paid\s*amount|payment\s*amount|amount\s*received|received|^paid$|collected)/i,
  ],
  [
    "amountDue",
    /(amount\s*due|balance(\s*due)?|outstanding|remaining|unpaid\s*amount)/i,
  ],
  ["amount", /(^amount$|total|grand\s*total|invoice\s*total|subtotal|^price$|^value$)/i],
  ["paidDate", /(paid\s*(on|at|date)|payment\s*date|date\s*paid|settled)/i],
  ["date", /(^date$|issue|issued|created|invoice\s*date|transaction\s*date|due)/i],
  ["clientEmail", /(e-?mail)/i],
  ["clientName", /(client|customer|contact|payer|bill\s*to|business|company|account)\s*(name)?/i],
  ["status", /(status|state|paid\?)/i],
  ["type", /(type|kind|category|record|entry)/i],
  ["currency", /(currency|iso\s*code)/i],
  ["description", /(description|memo|note|item|service|title|summary|line)/i],
];

/** Guess which CSV column carries each known field. Later columns never win. */
export function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  for (const [field, pattern] of ALIASES) {
    if (map[field]) continue;
    const header = headers.find((candidate) => pattern.test(candidate.trim()));
    if (header && !Object.values(map).includes(header)) map[field] = header;
  }
  return map;
}

export interface BloomRecord {
  rowNumber: number;
  sourceId: string;
  kind: LedgerKind;
  amountCents: number;
  occurredAt: string;
  currency: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  description: string;
  /** Total billed on this row, when the export carries both billed and paid. */
  invoicedCents: number | null;
}

export interface ParsedBloomFile {
  columns: ColumnMap;
  records: BloomRecord[];
  skipped: Array<{ rowNumber: number; reason: string }>;
}

function cell(row: string[], headers: string[], header?: string): string {
  if (!header) return "";
  const index = headers.indexOf(header);
  return index < 0 ? "" : (row[index] ?? "").trim();
}

function toCents(raw: string): number | null {
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || raw.trim().startsWith("-");
  const cleaned = raw.replace(/[()\-]/g, "").trim();
  if (!cleaned) return null;
  try {
    const cents = dollarsToCents(cleaned);
    return negative ? -cents : cents;
  } catch {
    return null;
  }
}

function toIso(raw: string): string | null {
  if (!raw) return null;
  const plain = raw.trim();
  const usa = plain.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = usa
    ? `${usa[3]}-${usa[1].padStart(2, "0")}-${usa[2].padStart(2, "0")}T12:00:00Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(plain)
      ? `${plain}T12:00:00Z`
      : plain;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Decide what a single row represents from its own values. */
export function inferKind(
  values: { status: string; type: string; paidCents: number | null; amountCents: number | null },
): LedgerKind {
  const text = `${values.type} ${values.status}`.toLowerCase();
  if (/refund|credit|chargeback|reversal/.test(text)) return "refund";
  if (/expense|bill|cost|purchase/.test(text)) return "expense";
  if (/payment|paid|settled|succeeded|complete/.test(text)) return "payment";
  if ((values.paidCents ?? 0) > 0) return "payment";
  if ((values.amountCents ?? 0) < 0) return "refund";
  return "invoice";
}

export function parseBloomFile(text: string): ParsedBloomFile {
  const table: CsvTable = parseBloomCsv(text);
  const columns = detectColumns(table.headers);
  const records: BloomRecord[] = [];
  const skipped: Array<{ rowNumber: number; reason: string }> = [];
  const seen = new Set<string>();

  table.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const get = (field: keyof ColumnMap) => cell(row, table.headers, columns[field]);
    const invoiceNumber = get("invoiceNumber");
    const status = get("status");
    const type = get("type");
    const paidCents = toCents(get("amountPaid"));
    const totalCents = toCents(get("amount"));
    const kind = inferKind({ status, type, paidCents, amountCents: totalCents });
    const chosen =
      kind === "payment" || kind === "refund" ? (paidCents ?? totalCents) : (totalCents ?? paidCents);
    const amountCents = chosen == null ? null : Math.abs(chosen);
    if (!amountCents) {
      skipped.push({ rowNumber, reason: "No readable amount" });
      return;
    }
    const occurredAt = toIso(kind === "payment" ? get("paidDate") || get("date") : get("date") || get("paidDate"));
    if (!occurredAt) {
      skipped.push({ rowNumber, reason: "No readable date" });
      return;
    }
    const rawId = get("sourceId") || invoiceNumber;
    const base =
      rawId ||
      [get("clientEmail") || get("clientName"), occurredAt.slice(0, 10), amountCents].join("|");
    let sourceId = `${kind}:${base}`;
    let attempt = 2;
    while (seen.has(sourceId)) sourceId = `${kind}:${base}#${attempt++}`;
    seen.add(sourceId);

    records.push({
      rowNumber,
      sourceId,
      kind,
      amountCents,
      occurredAt,
      currency: (get("currency") || "USD").toUpperCase().slice(0, 3),
      invoiceNumber,
      clientName: get("clientName"),
      clientEmail: get("clientEmail").toLowerCase(),
      description: [invoiceNumber, get("description")].filter(Boolean).join(" · ").slice(0, 500),
      invoicedCents: kind === "payment" || kind === "refund" ? totalCents : null,
    });
  });

  if (!records.length) throw new Error("No usable payment rows were found in this CSV.");
  return { columns, records, skipped };
}

export interface InvoiceCandidate {
  id: string;
  workspace_id: string;
  number: string | null;
  amount_cents: number;
  amount_paid_cents: number | null;
  currency: string;
  status: string;
  clientName?: string | null;
  clientEmail?: string | null;
}

export interface MatchResult {
  invoice: InvoiceCandidate | null;
  reason: "number" | "email_amount" | "name_amount" | "none" | "ambiguous";
}

function normalizeNumber(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Find the one invoice a Bloom row belongs to, or nothing when unsure. */
export function matchInvoice(record: BloomRecord, invoices: InvoiceCandidate[]): MatchResult {
  if (record.invoiceNumber) {
    const key = normalizeNumber(record.invoiceNumber);
    const hits = invoices.filter(
      (invoice) => invoice.number && normalizeNumber(invoice.number) === key,
    );
    if (hits.length === 1) return { invoice: hits[0], reason: "number" };
    if (hits.length > 1) return { invoice: null, reason: "ambiguous" };
  }
  const payable = invoices.filter(
    (invoice) => invoice.status !== "void" && invoice.status !== "draft",
  );
  if (record.clientEmail) {
    const hits = payable.filter(
      (invoice) => (invoice.clientEmail ?? "").toLowerCase() === record.clientEmail,
    );
    const exact = hits.filter((invoice) => invoice.amount_cents === record.amountCents);
    if (exact.length === 1) return { invoice: exact[0], reason: "email_amount" };
    if (hits.length === 1 && record.kind === "payment")
      return { invoice: hits[0], reason: "email_amount" };
    if (hits.length > 1 && exact.length > 1) return { invoice: null, reason: "ambiguous" };
  }
  if (record.clientName) {
    const key = record.clientName.trim().toLowerCase();
    const hits = payable.filter(
      (invoice) =>
        (invoice.clientName ?? "").trim().toLowerCase() === key &&
        invoice.amount_cents === record.amountCents,
    );
    if (hits.length === 1) return { invoice: hits[0], reason: "name_amount" };
    if (hits.length > 1) return { invoice: null, reason: "ambiguous" };
  }
  return { invoice: null, reason: "none" };
}

/** What a matched payment should change on the invoice, if anything. */
export function invoiceUpdate(
  invoice: InvoiceCandidate,
  paidCents: number,
): { amount_paid_cents: number; status?: "paid"; paid_at?: string } | null {
  if (invoice.status === "void" || invoice.status === "draft") return null;
  const already = invoice.amount_paid_cents ?? 0;
  const next = Math.min(invoice.amount_cents, already + paidCents);
  if (next <= already) return null;
  return next >= invoice.amount_cents
    ? { amount_paid_cents: next, status: "paid", paid_at: new Date().toISOString() }
    : { amount_paid_cents: next };
}
