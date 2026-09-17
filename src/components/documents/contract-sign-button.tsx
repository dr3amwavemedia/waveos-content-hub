import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getContractSigningLink } from "@/lib/contracts.functions";
import { errorMessage } from "@/lib/error-message";

export function ContractSignButton({
  contractId,
  label = "Sign contract",
  className,
}: {
  contractId: string;
  label?: string;
  className?: string;
}) {
  const getLink = useServerFn(getContractSigningLink);
  const signing = useMutation({
    mutationFn: () => getLink({ data: { contractId } }),
  });

  const openSigning = () => {
    // Open synchronously from the click so Safari allows it even when WaveOS
    // is running inside Lovable's preview frame. Populate it only after the
    // server has authorized the signer and returned a fresh SignWell URL.
    const target = window.open("about:blank", "_blank");
    signing.mutate(undefined, {
      onSuccess: ({ url }) => {
        if (target && !target.closed) {
          target.opener = null;
          target.location.replace(url);
        } else {
          window.location.assign(url);
        }
      },
      onError: (error) => {
        target?.close();
        toast.error(errorMessage(error, "Could not open SignWell."));
      },
    });
  };

  return (
    <button type="button" onClick={openSigning} disabled={signing.isPending} className={className}>
      {signing.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ExternalLink className="h-4 w-4" />
      )}
      {signing.isPending ? "Opening SignWell…" : label}
    </button>
  );
}
