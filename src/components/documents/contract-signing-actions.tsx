import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { publishContractForSigning, sendContractForSignature } from "@/lib/contracts.functions";
import { errorMessage } from "@/lib/error-message";
import { ContractSignButton } from "./contract-sign-button";

export type SigningContract = {
  id: string;
  status: string;
  provider: string;
  hosted_url: string | null;
  published_at: string | null;
  provider_document_id: string | null;
  signer_name: string | null;
  signer_email: string | null;
};

/** Staff-visible signing state for one contract. */
export function signingState(contract: SigningContract) {
  if (contract.provider !== "signwell" && contract.hosted_url) return "external" as const;
  if (contract.status === "signed") return "signed" as const;
  if (contract.status === "declined") return "declined" as const;
  if (contract.status === "expired" || contract.status === "void") return "expired" as const;
  if (contract.provider_document_id) {
    return contract.status === "viewed" ? ("viewed" as const) : ("with_client" as const);
  }
  if (contract.provider_document_id) return "provider_error" as const;
  if (!contract.signer_name || !contract.signer_email) return "missing_info" as const;
  if (!contract.published_at) return "ready_to_publish" as const;
  return "ready_for_link" as const;
}

const LABELS: Record<ReturnType<typeof signingState>, string> = {
  external: "External contract",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  with_client: "With client",
  viewed: "Viewed by client",
  provider_error: "Provider error",
  missing_info: "Missing signer details",
  ready_to_publish: "Ready to publish",
  ready_for_link: "Ready to create signing link",
};

const btn =
  "min-h-10 rounded-lg border border-border px-3 text-xs font-semibold hover:border-primary/40 disabled:opacity-50";

export function ContractSigningActions({
  contract,
  onChanged,
}: {
  contract: SigningContract;
  onChanged: () => void | Promise<unknown>;
}) {
  const state = signingState(contract);
  const missingSignerFields = [
    !contract.signer_name ? "signer name" : null,
    !contract.signer_email ? "signer email" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const publish = useServerFn(publishContractForSigning);
  const createLink = useServerFn(sendContractForSignature);

  const publishMutation = useMutation({
    mutationFn: () => publish({ data: { contractId: contract.id } }),
    onSuccess: async () => {
      toast.success("Contract published. You can now create the signing link.");
      await onChanged();
    },
    onError: (error) => toast.error(errorMessage(error, "Could not publish this contract.")),
  });

  const linkMutation = useMutation({
    mutationFn: () => createLink({ data: { contractId: contract.id } }),
    onSuccess: async (result) => {
      toast.success(
        result.testMode
          ? "Test signing link created. No email was sent to the signer."
          : "Signing link created.",
      );
      await onChanged();
    },
    onError: (error) =>
      toast.error(errorMessage(error, "The signing service did not accept this contract.")),
  });

  // Legacy externally hosted contracts keep their existing provider and link.
  if (state === "external") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-surface/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-border">
        {LABELS[state]}
      </span>

      {state === "ready_to_publish" && (
        <button
          type="button"
          onClick={() => publishMutation.mutate()}
          disabled={publishMutation.isPending}
          className={btn}
        >
          {publishMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Publish for signing"
          )}
        </button>
      )}

      {state === "ready_for_link" && (
        <button
          type="button"
          onClick={() => linkMutation.mutate()}
          disabled={linkMutation.isPending}
          className={`${btn} border-primary/50 text-primary`}
        >
          {linkMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Create SignWell signing link"
          )}
        </button>
      )}

      {(state === "with_client" || state === "viewed") && (
        <ContractSignButton
          contractId={contract.id}
          label="Open SignWell"
          className={`${btn} inline-flex items-center gap-1`}
        />
      )}

      {state === "missing_info" && (
        <span className="text-[11px] text-muted-foreground">
          Open “Add signer details,” enter {missingSignerFields}, and save the draft.
        </span>
      )}

      {state === "provider_error" && (
        <span className="text-[11px] text-destructive">
          The signing service accepted the document but returned no link. Create a new contract
          revision.
        </span>
      )}
    </div>
  );
}
