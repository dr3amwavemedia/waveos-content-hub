import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, Loader2 } from "lucide-react";
import { createInvoiceCheckout } from "@/lib/payments.functions";
import { errorMessage } from "@/lib/error-message";

/** Opens a Stripe Checkout session for one invoice. Amounts are computed server-side. */
export function PayInvoiceButton({
  invoiceId,
  label = "Pay now",
}: {
  invoiceId: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const startCheckout = useServerFn(createInvoiceCheckout);

  const pay = async () => {
    if (busy) return;
    setCheckoutUrl(null);
    // Lovable's preview is framed and cannot redirect itself to Stripe. Open a
    // top-level tab during the click so the browser permits navigation after
    // the asynchronous session request finishes.
    const framed = window.self !== window.top;
    const checkoutTab = framed ? window.open("", "_blank") : null;
    if (checkoutTab) checkoutTab.opener = null;
    setBusy(true);
    try {
      const result = await startCheckout({ data: { invoiceId } });
      if (framed) {
        if (checkoutTab) {
          try {
            checkoutTab.location.replace(result.url);
            checkoutTab.focus();
          } catch {
            checkoutTab.close();
            setCheckoutUrl(result.url);
            toast.error("Use the checkout link below to open Stripe in a new tab.");
          }
        } else {
          setCheckoutUrl(result.url);
          toast.error("Use the checkout link below to open Stripe in a new tab.");
        }
        setBusy(false);
      } else {
        window.location.assign(result.url);
      }
    } catch (error) {
      checkoutTab?.close();
      toast.error(errorMessage(error, "We could not start the payment. Please try again."));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60 sm:w-auto"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {busy ? "Opening secure checkout…" : label}
      </button>
      {checkoutUrl && (
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline"
        >
          Open secure checkout in a new tab
        </a>
      )}
    </div>
  );
}
