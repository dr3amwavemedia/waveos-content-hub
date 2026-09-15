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
    // Open the tab synchronously: popup blockers only trust a tab opened
    // during the click, and Stripe Checkout refuses to render inside an iframe
    // (the app preview), which shows up as a blank screen.
    const tab = window.open("", "_blank", "noopener,noreferrer");
    try {
      const result = await startCheckout({ data: { invoiceId } });
      if (tab && !tab.closed) {
        tab.location.href = result.url;
      } else {
        // Popup was blocked before we could use it. Opening a new tab now is
        // async so blockers may reject it; as a last resort navigate this tab
        // (never window.top — cross-origin frame navigation is forbidden).
        const fallback = window.open(result.url, "_blank", "noopener,noreferrer");
        if (!fallback || fallback.closed) {
          window.location.href = result.url;
        }
      }
      setBusy(false);
    } catch (error) {
      tab?.close();
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
