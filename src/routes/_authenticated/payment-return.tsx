import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

import { getInvoicePaymentState } from "@/lib/payments.functions";
import { errorMessage } from "@/lib/error-message";

type Search = { invoice?: string; status?: string; session?: string };

export const Route = createFileRoute("/_authenticated/payment-return")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    invoice: typeof search["invoice"] === "string" ? search["invoice"] : undefined,
    status: typeof search["status"] === "string" ? search["status"] : undefined,
    session: typeof search["session"] === "string" ? search["session"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Payment status | WaveOS" },
      { name: "description", content: "Confirmation of your WaveOS invoice payment." },
      { property: "og:title", content: "Payment status | WaveOS" },
      { property: "og:description", content: "Confirmation of your WaveOS invoice payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentReturn,
});

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
    cents / 100,
  );

function PaymentReturn() {
  const { invoice: invoiceId, status, session: sessionId } = Route.useSearch();
  const fetchState = useServerFn(getInvoicePaymentState);
  const queryClient = useQueryClient();
  const cancelled = status === "cancelled";
  const [waitedOut, setWaitedOut] = useState(false);

  // Card payments normally reconcile on the first request by verifying the
  // Checkout Session directly with Stripe. Brief polling covers a simultaneous
  // webhook without making the client stare at an indefinite waiting screen.
  useEffect(() => {
    if (cancelled) return;
    const timer = setTimeout(() => setWaitedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [cancelled]);

  const query = useQuery({
    queryKey: ["payment-return", invoiceId],
    enabled: Boolean(invoiceId) && !cancelled,
    retry: false,
    queryFn: () => fetchState({ data: { invoiceId: invoiceId!, sessionId } }),
    refetchInterval: (q) =>
      q.state.data?.confirmed || q.state.data?.outcome === "declined" || waitedOut ? false : 1000,
  });

  useEffect(() => {
    if (!query.data?.confirmed) return;
    void queryClient.invalidateQueries({ queryKey: ["layer1", "invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["client-invoices"] });
  }, [query.data?.confirmed, queryClient]);

  const view = useMemo(() => {
    if (!invoiceId) return "missing" as const;
    if (cancelled) return "cancelled" as const;
    if (query.isError) return "error" as const;
    if (query.data?.confirmed) return "confirmed" as const;
    if (query.data?.outcome === "declined") return "declined" as const;
    if (waitedOut) return "processing" as const;
    return "submitted" as const;
  }, [invoiceId, cancelled, query.isError, query.data?.confirmed, query.data?.outcome, waitedOut]);

  const data = query.data;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div className="surface-card space-y-5 p-6 text-center sm:p-8">
        {view === "confirmed" ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        ) : view === "cancelled" ||
          view === "declined" ||
          view === "error" ||
          view === "missing" ? (
          <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        ) : view === "processing" ? (
          <Clock className="mx-auto h-12 w-12 text-primary" />
        ) : (
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
        )}

        <h1 className="text-2xl font-semibold text-foreground">
          {view === "confirmed"
            ? "Payment processed"
            : view === "cancelled"
              ? "Payment cancelled"
              : view === "declined"
                ? "Payment declined"
                : view === "missing"
                  ? "Payment status unavailable"
                  : view === "error"
                    ? "We could not load this invoice"
                    : view === "processing"
                      ? "Payment not completed"
                      : "Confirming payment"}
        </h1>

        <p className="text-sm text-muted-foreground">
          {view === "confirmed"
            ? "Your payment was recorded and the invoice has been updated."
            : view === "cancelled"
              ? "Nothing was charged. Your invoice is unchanged and you can pay it whenever you're ready."
              : view === "declined"
                ? "Stripe did not complete the charge. Your invoice remains unpaid and you can try again from your portal."
                : view === "missing"
                  ? "We didn't receive an invoice reference. Open your invoices to check the current status."
                  : view === "error"
                    ? errorMessage(
                        query.error,
                        "Please open your invoices to check the current status.",
                      )
                    : view === "processing"
                      ? "Stripe has not marked this payment successful, so the invoice remains unpaid. Return to your invoices to try again or choose another card."
                      : "Checking the completed checkout directly with Stripe."}
        </p>

        {data && (
          <dl className="mx-auto grid w-full max-w-sm gap-2 rounded-xl border border-border/60 bg-surface/40 p-4 text-left text-sm">
            {data.number && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Invoice</dt>
                <dd className="font-semibold">{data.number}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Invoice total</dt>
              <dd className="font-semibold">{money(data.amountCents, data.currency)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Recorded as paid</dt>
              <dd className="font-semibold">{money(data.paidCents, data.currency)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Remaining balance</dt>
              <dd className="font-semibold">{money(data.dueCents, data.currency)}</dd>
            </div>
          </dl>
        )}

        <Link
          to="/home"
          search={invoiceId ? { invoice: invoiceId } : undefined}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:brightness-110 sm:w-auto"
        >
          Back to my invoices
        </Link>
      </div>
    </main>
  );
}
