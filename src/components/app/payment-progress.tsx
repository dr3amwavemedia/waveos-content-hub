import type { Database } from "@/integrations/supabase/types";

type PaymentInvoice = Pick<Database["public"]["Tables"]["client_invoices"]["Row"], "amount_cents" | "amount_paid_cents" | "currency" | "status" | "payment_plan" | "billing_month">;

export function PaymentProgress({ invoice }: { invoice: PaymentInvoice }) {
  if (invoice.status === "void" || invoice.status === "draft") return null;
  const total = invoice.amount_cents;
  const received = invoice.status === "paid" ? total : invoice.amount_paid_cents;
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency }).format(value / 100);
  const labels: Record<string, string> = { one_time: "One-time payment", deposit_balance: "Deposit + balance", installments: "Installments", monthly_retainer: "Monthly retainer" };
  const percent = total != null && total > 0 && received != null ? Math.min(100, Math.max(0, Math.round(received / total * 100))) : null;
  return <div className="my-3 space-y-2 rounded-lg bg-primary/5 p-3 text-sm">
    <p className="font-medium">{labels[invoice.payment_plan] ?? "Payment progress"}{invoice.billing_month && ` · ${new Date(`${invoice.billing_month}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`}</p>
    {received == null || total == null ? <p className="text-xs text-muted-foreground">Payment amounts have not been recorded yet.</p> : <>
      <div className="flex flex-wrap justify-between gap-2"><span>{money(received)} paid</span><span>{money(Math.max(0, total - received))} remaining</span></div>
      {percent != null && <><div role="progressbar" aria-label="Payment progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-primary/15"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div><p className="text-xs text-muted-foreground">{percent}% paid{received > 0 && received < total ? " · Partially paid" : received >= total ? " · Paid in full" : " · Awaiting payment"}</p></>}
    </>}
  </div>;
}
