import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createAutopayAuthorization } from "@/lib/autopay.functions";
import { errorMessage } from "@/lib/error-message";

export function AuthorizeAutopayButton({ scheduleId }: { scheduleId: string }) {
  const start = useServerFn(createAutopayAuthorization);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const tab = window.open("", "_blank");
        if (tab) tab.opener = null;
        try {
          const result = await start({ data: { scheduleId } });
          if (tab && !tab.closed) tab.location.href = result.url;
          else window.location.href = result.url;
        } catch (error) {
          tab?.close();
          toast.error(errorMessage(error, "Could not open automatic payment authorization."));
          setBusy(false);
        }
      }}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      {busy ? "Opening Stripe…" : "Authorize automatic payments"}
    </button>
  );
}
