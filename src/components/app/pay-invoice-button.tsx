import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, Loader2, X } from "lucide-react";
import { createInvoiceCheckout } from "@/lib/payments.functions";
import { errorMessage } from "@/lib/error-message";

type Props = {
  invoiceId: string;
  label?: string;
  minimumCents?: number;
  remainingCents?: number;
  currency?: string;
};

/** Opens a Stripe Checkout session after the client chooses a valid payment amount. */
export function PayInvoiceButton({
  invoiceId,
  label = "Pay now",
  minimumCents,
  remainingCents,
  currency = "USD",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const startCheckout = useServerFn(createInvoiceCheckout);

  const money = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

  const canChoose =
    typeof minimumCents === "number" &&
    typeof remainingCents === "number" &&
    minimumCents > 0 &&
    remainingCents >= minimumCents;

  const pay = async (paymentAmountCents?: number) => {
    if (busy) return;
    setBusy(true);
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const result = await startCheckout({ data: { invoiceId, paymentAmountCents } });
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
      setChoosing(false);
    } catch (error) {
      tab?.close();
      toast.error(errorMessage(error, "We could not start the payment. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const submitCustom = () => {
    const dollars = Number(customAmount);
    const cents = Math.round(dollars * 100);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      toast.error("Enter a valid payment amount.");
      return;
    }
    if (minimumCents != null && cents < minimumCents) {
      toast.error(`The minimum payment is ${money(minimumCents)}.`);
      return;
    }
    if (remainingCents != null && cents > remainingCents) {
      toast.error(`The most you can pay is the remaining balance of ${money(remainingCents)}.`);
      return;
    }
    void pay(cents);
  };

  if (choosing && canChoose) {
    const minimumIsFullBalance = minimumCents === remainingCents;
    return (
      <div className="w-full max-w-md space-y-3 rounded-xl border border-border bg-surface/80 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Choose payment amount</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {minimumIsFullBalance
                ? `${money(remainingCents)} remaining`
                : `Minimum ${money(minimumCents)} · ${money(remainingCents)} remaining`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setChoosing(false)}
            disabled={busy}
            aria-label="Close payment options"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {!minimumIsFullBalance && (
            <button
              type="button"
              onClick={() => void pay(minimumCents)}
              disabled={busy}
              className="rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              Pay minimum · {money(minimumCents)}
            </button>
          )}
          <button
            type="button"
            onClick={() => void pay(remainingCents)}
            disabled={busy}
            className="rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
          >
            Pay in full · {money(remainingCents)}
          </button>
        </div>

        {!minimumIsFullBalance && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`custom-payment-${invoiceId}`}>
              Or enter a custom amount
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input
                  id={`custom-payment-${invoiceId}`}
                  type="number"
                  inputMode="decimal"
                  min={(minimumCents / 100).toFixed(2)}
                  max={(remainingCents / 100).toFixed(2)}
                  step="0.01"
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
                  placeholder={(minimumCents / 100).toFixed(2)}
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-7 pr-3 text-sm text-foreground"
                />
              </div>
              <button
                type="button"
                onClick={submitCustom}
                disabled={busy || !customAmount}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 px-3 py-2.5 text-sm font-semibold text-primary disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (canChoose) setChoosing(true);
        else void pay();
      }}
      disabled={busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60 sm:w-auto"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      {busy ? "Opening secure checkout…" : label}
    </button>
  );
}
