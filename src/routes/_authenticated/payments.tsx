import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  parseBloomFile,
  matchInvoice,
  invoiceUpdate,
  type BloomRecord,
  type InvoiceCandidate,
  type ParsedBloomFile,
} from "@/lib/bloom-import";

type Entry = Database["public"]["Tables"]["payment_ledger"]["Row"];
type ImportRow = Database["public"]["Tables"]["payment_ledger"]["Insert"];
type PlanRow = {
  record: BloomRecord;
  invoice: InvoiceCandidate | null;
  reason: string;
  duplicate: boolean;
};
const ZONE = "America/New_York";
const REASONS: Record<string, string> = {
  number: "Matched by invoice number",
  email_amount: "Matched by client e-mail",
  name_amount: "Matched by client name and amount",
  ambiguous: "Several invoices match — needs review",
  none: "No matching invoice — needs review",
};

export const Route = createFileRoute("/_authenticated/payments")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    if (!(roles ?? []).some((role) => role.role === "dream_wave_owner"))
      throw redirect({ to: "/home" });
  },
  component: PaymentsPage,
  head: () => ({ meta: [{ title: "Payments — WaveOS" }, { name: "robots", content: "noindex" }] }),
});

function dateKey(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function periodStart(period: "day" | "week" | "month" | "year"): string {
  const today = new Date();
  const local = dateKey(today.toISOString());
  const start = new Date(`${local}T12:00:00Z`);
  if (period === "week") start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (period === "month") start.setUTCDate(1);
  if (period === "year") {
    start.setUTCMonth(0);
    start.setUTCDate(1);
  }
  return dateKey(start.toISOString());
}
function PaymentsPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedBloomFile | null>(null);
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    const all: Entry[] = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
      const { data, error } = await supabase
        .from("payment_ledger")
        .select("*")
        .order("occurred_at", { ascending: false })
        .range(offset, offset + 999);
      if (error) {
        toast.error(error.message);
        break;
      }
      all.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    setTruncated(all.length >= 20000);
    setEntries(all);
    setLoading(false);
  }
  useEffect(() => {
    void reload();
  }, []);

  const posted = entries.filter((entry) => entry.status === "posted" && entry.currency === "USD");
  const start = periodStart(period);
  const today = dateKey(new Date().toISOString());
  const selected = posted.filter((entry) => {
    const day = dateKey(entry.occurred_at);
    return day >= start && day <= today;
  });
  const collected = selected
    .filter((entry) => entry.kind === "payment")
    .reduce((sum, entry) => sum + entry.amount_cents, 0);
  const refunded = selected
    .filter((entry) => entry.kind === "refund")
    .reduce((sum, entry) => sum + entry.amount_cents, 0);
  const invoiced = selected
    .filter((entry) => entry.kind === "invoice")
    .reduce((sum, entry) => sum + entry.amount_cents, 0);
  const progress =
    invoiced > 0
      ? Math.min(100, Math.round((Math.max(0, collected - refunded) / invoiced) * 100))
      : 0;
  const pending = entries.filter((entry) => entry.status === "unmatched");

  const bars = useMemo(() => {
    const grouped = new Map<string, number>();
    selected.forEach((entry) => {
      if (entry.kind !== "payment" && entry.kind !== "refund") return;
      const day = dateKey(entry.occurred_at);
      const key = period === "year" ? day.slice(0, 7) : period === "month" ? day.slice(5) : day;
      grouped.set(
        key,
        (grouped.get(key) ?? 0) +
          (entry.kind === "refund" ? -entry.amount_cents : entry.amount_cents),
      );
    });
    return [...grouped].sort(([a], [b]) => a.localeCompare(b)).slice(-31);
  }, [selected, period]);
  const maxBar = Math.max(1, ...bars.map(([, amount]) => Math.abs(amount)));

  async function pickFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 5_000_000) {
      toast.error("Choose a CSV file under 5 MB.");
      return;
    }
    try {
      const table = parseBloomCsv(await file.text());
      const suggest = (pattern: RegExp) =>
        table.headers.find((header) => pattern.test(header)) ?? "";
      setCsv(table);
      setFileName(file.name);
      setPreview([]);
      setMap({
        id: suggest(/^(id|invoice.?number|transaction.?id)$/i),
        amount: suggest(/amount|total|paid/i),
        date: suggest(/date|issued|paid/i),
        invoice: suggest(/invoice.?number/i),
        description: suggest(/description|title|service/i),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read CSV.");
    }
  }
  function mapped(row: string[], header: string): string {
    return header && csv ? (row[csv.headers.indexOf(header)] ?? "") : "";
  }
  function makePreview() {
    if (!csv || !map.id || !map.amount || !map.date) {
      toast.error("Map an ID, amount, and date column first.");
      return;
    }
    try {
      const ids = new Set<string>();
      const rows = csv.rows.map((row, index): ImportRow => {
        const id = mapped(row, map.id).trim();
        if (!id || ids.has(id))
          throw new Error(`Missing or repeated source ID at CSV row ${index + 2}.`);
        ids.add(id);
        const rawDate = mapped(row, map.date).trim();
        const date = new Date(rawDate);
        if (!rawDate || Number.isNaN(date.getTime()))
          throw new Error(`Invalid date at CSV row ${index + 2}. Use ISO or a clear date format.`);
        return {
          source: "bloom_csv",
          external_id: `bloom:${kind}:${id}`,
          kind,
          amount_cents: dollarsToCents(mapped(row, map.amount)),
          currency: "USD",
          occurred_at: date.toISOString(),
          description: [mapped(row, map.invoice).trim(), mapped(row, map.description).trim()]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 500),
          status: kind === "invoice" || kind === "expense" ? "posted" : "unmatched",
        };
      });
      setPreview(rows);
      toast.success(`Preview ready: ${rows.length} rows. Review before saving.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CSV mapping failed.");
    }
  }
  async function saveImport() {
    if (!preview.length) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error("Session expired.");
      setBusy(false);
      return;
    }
    const batch = crypto.randomUUID();
    const existing = new Set<string>();
    for (let i = 0; i < preview.length; i += 100) {
      const { data, error } = await supabase
        .from("payment_ledger")
        .select("external_id")
        .eq("source", "bloom_csv")
        .in(
          "external_id",
          preview.slice(i, i + 100).map((row) => row.external_id),
        );
      if (error) {
        toast.error(error.message);
        setBusy(false);
        return;
      }
      data?.forEach((row) => existing.add(row.external_id));
    }
    const fresh = preview.filter((row) => !existing.has(row.external_id));
    const sourceNumbers = new Map(
      (csv?.rows ?? []).map((row) => [
        `bloom:${kind}:${mapped(row, map.id).trim()}`,
        mapped(row, map.invoice).trim() || (kind === "invoice" ? mapped(row, map.id).trim() : ""),
      ]),
    );
    const numbers = [...new Set([...sourceNumbers.values()].filter(Boolean))];
    const matches = new Map<string, { id: string; workspace_id: string }[]>();
    for (let i = 0; i < numbers.length; i += 100) {
      const { data, error } = await supabase
        .from("client_invoices")
        .select("id,workspace_id,number")
        .in("number", numbers.slice(i, i + 100));
      if (error) {
        toast.error(`Could not match invoice numbers: ${error.message}`);
        setBusy(false);
        return;
      }
      data?.forEach((invoice) => {
        if (!invoice.number) return;
        matches.set(invoice.number, [...(matches.get(invoice.number) ?? []), invoice]);
      });
    }
    for (let i = 0; i < fresh.length; i += 100) {
      const { error } = await supabase.from("payment_ledger").insert(
        fresh.slice(i, i + 100).map((row) => {
          const linked = matches.get(sourceNumbers.get(row.external_id) ?? "") ?? [];
          return {
            ...row,
            ...(linked.length === 1
              ? { invoice_id: linked[0].id, workspace_id: linked[0].workspace_id }
              : {}),
            import_batch_id: batch,
            created_by: auth.user!.id,
          };
        }),
      );
      if (error) {
        toast.error(`Import stopped after ${i} rows: ${error.message}`);
        setBusy(false);
        await reload();
        return;
      }
    }
    toast.success(
      `Saved ${fresh.length} rows; skipped ${existing.size} already imported. Payment rows await review.`,
    );
    setPreview([]);
    setCsv(null);
    setBusy(false);
    await reload();
  }
  async function postRow(entry: Entry) {
    const { error } = await supabase
      .from("payment_ledger")
      .update({ status: "posted" })
      .eq("id", entry.id)
      .eq("status", "unmatched");
    if (error) toast.error(error.message);
    else {
      toast.success("Posted to payment overview.");
      await reload();
    }
  }

  return (
    <AppShell>
      <main className="w-full space-y-8 pb-12">
        <header>
          <h1 className="text-3xl font-semibold">Payments</h1>
          <p className="mt-2 text-muted-foreground">
            Money received, refunds, Bloom imports, and invoice progress. USD totals use Sarasota
            dates.
          </p>
        </header>
        {truncated && (
          <p className="rounded-xl border border-amber-500/40 p-4 text-sm">
            More than 20,000 ledger rows exist. Totals on this screen are incomplete; export or
            aggregate the full ledger before using them for reporting.
          </p>
        )}
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap gap-2">
            {(["day", "week", "month", "year"] as const).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setPeriod(name)}
                className={`rounded-lg border px-4 py-2 capitalize ${period === name ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              ["Collected", money(collected)],
              ["Refunds", money(refunded)],
              ["Net received", money(collected - refunded)],
              ["Bloom invoiced", money(invoiced)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{loading ? "Loading…" : value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="flex justify-between text-sm">
              <span>Collected against imported Bloom invoices</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Invoice imports are billed amounts, not earnings. Stripe and Bloom payment rows count
              only after posting. Unmatched rows are excluded.
            </p>
          </div>
          <div className="mt-6 flex h-32 items-end gap-2 overflow-x-auto">
            {bars.length ? (
              bars.map(([label, amount]) => (
                <div key={label} className="flex min-w-10 flex-1 flex-col items-center gap-1">
                  <div
                    title={`${label}: ${money(amount)}`}
                    className={`w-full rounded-t ${amount < 0 ? "bg-amber-500" : "bg-primary"}`}
                    style={{ height: `${Math.max(4, (Math.abs(amount) / maxBar) * 96)}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))
            ) : (
              <p className="self-center text-sm text-muted-foreground">
                No posted payments in this period.
              </p>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">Import Bloom CSV</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a CSV export, map its columns, preview every row, then save. Existing records are
            skipped by source ID. This never edits client invoices.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <input
              aria-label="Bloom CSV file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                void pickFile(event.target.files?.[0]);
              }}
            />
            <label className="text-sm">
              Record type{" "}
              <select
                className="ml-2 rounded-lg border border-border bg-background p-2"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as Kind);
                  setPreview([]);
                }}
              >
                {KINDS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {csv && (
            <>
              <p className="mt-4 text-sm">
                {fileName}: {csv.rows.length} rows
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-5">
                {(["id", "amount", "date", "invoice", "description"] as const).map((field) => (
                  <label key={field} className="text-sm capitalize">
                    {field}
                    {["id", "amount", "date"].includes(field) && " *"}
                    <select
                      value={map[field]}
                      onChange={(event) => {
                        setMap({ ...map, [field]: event.target.value });
                        setPreview([]);
                      }}
                      className="mt-1 w-full rounded-lg border border-border bg-background p-2"
                    >
                      <option value="">Select column</option>
                      {csv.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={makePreview}
                className="mt-5 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
              >
                Preview import
              </button>
            </>
          )}
          {preview.length > 0 && (
            <div className="mt-5">
              <p className="text-sm">
                Review: {preview.length} {kind} rows. Payments and refunds will be pending until
                posted. First five:
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 5).map((row) => (
                      <tr key={row.external_id} className="border-t border-border">
                        <td>{row.external_id}</td>
                        <td>{dateKey(row.occurred_at)}</td>
                        <td>{money(row.amount_cents)}</td>
                        <td>{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void saveImport();
                }}
                className="mt-5 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Saving…" : `Save ${preview.length} reviewed rows`}
              </button>
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">Pending payments and refunds ({pending.length})</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check Bloom imports against Stripe records and verify Stripe refund or mismatched
            payment events before posting. Posting changes this overview; invoice and delivery
            status stay unchanged.
          </p>
          <div className="mt-4 space-y-2">
            {pending.slice(0, 100).map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
              >
                <span>
                  {dateKey(entry.occurred_at)} · {entry.source} · {entry.kind} ·{" "}
                  {money(entry.amount_cents)} · {entry.description || entry.external_id}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void postRow(entry);
                  }}
                  className="rounded-lg border border-primary px-3 py-1 text-primary"
                >
                  Post
                </button>
              </div>
            ))}
            {pending.length > 100 && (
              <p className="text-xs text-muted-foreground">Showing the first 100 pending rows.</p>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
