import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, Loader2 } from "lucide-react";
import { createInvoiceCheckout } from "@/lib/payments.functions";
import { errorMessage } from "@/lib/error-message";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Opens a Stripe Checkout session for one invoice. Amounts are computed server-side. */
export function PayInvoiceButton({
  invoiceId,
  scheduledLabel = "Pay scheduled amount",
  scheduledCents,
  remainingCents,
  currency,
}: {
  invoiceId: string;
  scheduledLabel?: string;
  scheduledCents: number;
  remainingCents: number;
  currency: string;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const startCheckout = useServerFn(createInvoiceCheckout);
  const hasChoice = scheduledCents > 0 && scheduledCents < remainingCents;
  const amount = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

  const pay = async (paymentChoice: "scheduled" | "full") => {
    if (busy) return;
    setBusy(true);
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const result = await startCheckout({ data: { invoiceId, paymentChoice } });
      if (tab && !tab.closed) {
        tab.location.href = result.url;
      } else {
        const fallback = window.open(result.url, "_blank");
        if (fallback) {
          fallback.opener = null;
        } else if (window.top === window.self) {
          window.location.href = result.url;
        } else {
          toast.error("Your browser blocked the payment tab. Please allow pop-ups and try again.");
        }
      }
      setOpen(false);
    } catch (error) {
      tab?.close();
      toast.error(errorMessage(error, "We could not start the payment. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (hasChoice ? setOpen(true) : void pay("full"))}
        disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60 sm:w-auto"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {busy ? "Opening secure checkout…" : "Pay invoice"}
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-md rounded-2xl p-5 sm:p-6">
          <DialogTitle>Choose how you’d like to pay</DialogTitle>
          <DialogDescription>
            Select the scheduled payment or pay the full remaining balance. Invoice fees are already
            included in the amounts shown.
          </DialogDescription>
          <div className="mt-2 grid gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void pay("scheduled")}
              className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-left transition hover:bg-primary/15 disabled:opacity-60"
            >
              <span className="font-semibold text-foreground">{scheduledLabel}</span>
              <strong className="shrink-0 text-primary">{amount(scheduledCents)}</strong>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void pay("full")}
              className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-border bg-elevated px-4 py-3 text-left transition hover:border-primary/40 disabled:opacity-60"
            >
              <span className="font-semibold text-foreground">Pay in full</span>
              <strong className="shrink-0 text-foreground">{amount(remainingCents)}</strong>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
