import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, Loader2 } from "lucide-react";
import { createInvoiceCheckout } from "@/lib/payments.functions";
import { errorMessage } from "@/lib/error-message";

/** Opens a Stripe Checkout session for one invoice. Amounts are computed server-side. */
export function PayInvoiceButton({ invoiceId, label = "Pay now" }: { invoiceId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const startCheckout = useServerFn(createInvoiceCheckout);

  const pay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await startCheckout({ data: { invoiceId } });
      window.location.href = result.url;
    } catch (error) {
      toast.error(errorMessage(error, "We could not start the payment. Please try again."));
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={pay}
      disabled={busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60 sm:w-auto"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      {busy ? "Opening secure checkout…" : label}
    </button>
  );
}
