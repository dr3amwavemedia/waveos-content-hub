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
type SalesInvoice = Pick<
  Database["public"]["Tables"]["client_invoices"]["Row"],
  "id" | "amount_cents" | "currency" | "status" | "issued_at"
>;
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
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
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
    const allInvoices: SalesInvoice[] = [];
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
    for (let offset = 0; offset < 20000; offset += 1000) {
      const { data, error } = await supabase
        .from("client_invoices")
        .select("id,amount_cents,currency,status,issued_at")
        .order("issued_at", { ascending: false })
        .range(offset, offset + 999);
      if (error) {
        toast.error(`Could not load invoice sales: ${error.message}`);
        break;
      }
      allInvoices.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    setTruncated(all.length >= 20000 || allInvoices.length >= 20000);
    setEntries(all);
    setSalesInvoices(allInvoices);
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
  const issuedSales = salesInvoices
    .filter((invoice) => {
      if (invoice.currency !== "USD" || invoice.status === "draft" || invoice.status === "void")
        return false;
      const day = dateKey(invoice.issued_at);
      return day >= start && day <= today;
    })
    .reduce((sum, invoice) => sum + (invoice.amount_cents ?? 0), 0);
  const netSales = Math.max(0, issuedSales - refunded);
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
    setPlan(null);
    try {
      const result = parseBloomFile(await file.text());
      setParsed(result);
      setFileName(file.name);
      await runScan(result);
    } catch (error) {
      setParsed(null);
      toast.error(error instanceof Error ? error.message : "Could not read this CSV.");
    }
  }

  /** Read every row, find its invoice, and show what the import will change. */
  async function runScan(source: ParsedBloomFile) {
    setBusy(true);
    try {
      const [invoiceResult, workspaceResult, crmResult, ledgerResult] = await Promise.all([
        supabase
          .from("client_invoices")
          .select("id,workspace_id,number,amount_cents,amount_paid_cents,currency,status"),
        supabase.from("workspaces").select("id,name,client_name,business_name"),
        supabase.from("crm_accounts").select("linked_workspace_id,email,business_name"),
        supabase.from("payment_ledger").select("external_id").eq("source", "bloom_csv"),
      ]);
      const failure = invoiceResult.error ?? workspaceResult.error ?? ledgerResult.error;
      if (failure) throw failure;

      const names = new Map(
        (workspaceResult.data ?? []).map((workspace) => [
          workspace.id,
          workspace.client_name || workspace.business_name || workspace.name,
        ]),
      );
      const emails = new Map<string, string>();
      (crmResult.data ?? []).forEach((account) => {
        if (account.linked_workspace_id && account.email)
          emails.set(account.linked_workspace_id, account.email.toLowerCase());
      });
      const candidates: InvoiceCandidate[] = (invoiceResult.data ?? []).map((invoice) => ({
        ...invoice,
        amount_cents: invoice.amount_cents ?? 0,
        clientName: names.get(invoice.workspace_id) ?? null,
        clientEmail: emails.get(invoice.workspace_id) ?? null,
      }));
      const imported = new Set((ledgerResult.data ?? []).map((row) => row.external_id));

      setPlan(
        source.records.map((record) => {
          const match = matchInvoice(record, candidates);
          return {
            record,
            invoice: match.invoice,
            reason: match.reason,
            duplicate: imported.has(`bloom:${record.sourceId}`),
          };
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not scan this CSV.");
    } finally {
      setBusy(false);
    }
  }

  /** Save the scanned rows and roll matched payments onto their invoices. */
  async function applyScan() {
    if (!plan) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error("Session expired.");
      setBusy(false);
      return;
    }
    const batch = crypto.randomUUID();
    const fresh = plan.filter((row) => !row.duplicate);
    const rows: ImportRow[] = fresh.map((row) => ({
      source: "bloom_csv",
      external_id: `bloom:${row.record.sourceId}`,
      kind: row.record.kind,
      amount_cents: row.record.amountCents,
      currency: row.record.currency,
      occurred_at: row.record.occurredAt,
      description: row.record.description || null,
      invoice_id: row.invoice?.id ?? null,
      workspace_id: row.invoice?.workspace_id ?? null,
      import_batch_id: batch,
      created_by: auth.user.id,
      // Refunds and unmatched money always wait for the owner.
      status:
        row.record.kind === "refund" || (!row.invoice && row.record.kind === "payment")
          ? "unmatched"
          : "posted",
    }));

    for (let index = 0; index < rows.length; index += 100) {
      const { error } = await supabase.from("payment_ledger").insert(rows.slice(index, index + 100));
      if (error) {
        toast.error(`Import stopped after ${index} rows: ${error.message}`);
        setBusy(false);
        await reload();
        return;
      }
    }

    // Roll every matched payment in this file onto its invoice, once per invoice.
    const totals = new Map<string, { invoice: InvoiceCandidate; cents: number; at: string }>();
    fresh.forEach((row) => {
      if (row.record.kind !== "payment" || !row.invoice) return;
      const current = totals.get(row.invoice.id);
      totals.set(row.invoice.id, {
        invoice: row.invoice,
        cents: (current?.cents ?? 0) + row.record.amountCents,
        at:
          !current || row.record.occurredAt > current.at
            ? row.record.occurredAt
            : current.at,
      });
    });
    let updated = 0;
    for (const { invoice, cents, at } of totals.values()) {
      const patch = invoiceUpdate(invoice, cents, at);
      if (!patch) continue;
      const { error } = await supabase
        .from("client_invoices")
        .update(patch)
        .eq("id", invoice.id)
        .eq("amount_paid_cents", invoice.amount_paid_cents ?? 0);
      if (error) toast.error(`Invoice ${invoice.number ?? invoice.id}: ${error.message}`);
      else updated += 1;
    }

    toast.success(
      `Imported ${rows.length} rows, skipped ${plan.length - rows.length} already-imported rows, updated ${updated} invoices.`,
    );
    setPlan(null);
    setParsed(null);
    setFileName("");
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
            Booked sales, money received, refunds, Bloom imports, and invoice progress. USD totals
            use Sarasota dates.
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
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Net sales", money(netSales)],
              ["Cash collected", money(collected)],
              ["Refunds", money(refunded)],
              ["Net cash", money(collected - refunded)],
              ["Bloom invoices imported", money(invoiced)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{loading ? "Loading…" : value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Net sales includes every issued WaveOS invoice in this period, even when unpaid or only
            partially paid, and subtracts recorded refunds. Draft and void invoices are excluded.
            Cash collected only counts posted payments.
          </p>
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
            Drop in a full Bloom export. WaveOS reads the columns on its own, works out which rows
            are payments, refunds or invoices, finds the matching invoice, and updates what each
            client has paid. Rows already imported are skipped. Refunds and anything it cannot match
            wait for you below.
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
            {busy && !plan && <span className="text-sm text-muted-foreground">Scanning…</span>}
          </div>
          {parsed && plan && (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {[
                  ["Rows read", String(plan.length)],
                  ["Matched to an invoice", String(plan.filter((row) => row.invoice).length)],
                  [
                    "Already imported",
                    String(plan.filter((row) => row.duplicate).length),
                  ],
                  [
                    "Needs review",
                    String(plan.filter((row) => !row.invoice && !row.duplicate).length),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {fileName} · columns used:{" "}
                {Object.entries(parsed.columns)
                  .map(([field, header]) => `${field} → ${header}`)
                  .join(", ") || "none detected"}
                {parsed.skipped.length > 0 &&
                  ` · ${parsed.skipped.length} rows skipped (no readable amount or date)`}
              </p>
              <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Amount</th>
                      <th className="p-2">Client / invoice</th>
                      <th className="p-2">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.slice(0, 200).map((row) => (
                      <tr key={row.record.sourceId} className="border-t border-border">
                        <td className="p-2">{dateKey(row.record.occurredAt)}</td>
                        <td className="p-2 capitalize">{row.record.kind}</td>
                        <td className="p-2">{money(row.record.amountCents)}</td>
                        <td className="p-2">
                          {row.record.invoiceNumber ||
                            row.record.clientName ||
                            row.record.clientEmail ||
                            "—"}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {row.duplicate
                            ? "Already imported"
                            : (REASONS[row.reason] ?? "Needs review")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.length > 200 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing the first 200 of {plan.length} rows. All rows are imported.
                </p>
              )}
              <button
                type="button"
                disabled={busy || plan.every((row) => row.duplicate)}
                onClick={() => {
                  void applyScan();
                }}
                className="mt-5 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              >
                {busy
                  ? "Importing…"
                  : `Import ${plan.filter((row) => !row.duplicate).length} rows and update invoices`}
              </button>
            </>
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
