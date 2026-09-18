import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { sendContractForSignature } from "@/lib/contracts.functions";
import { errorMessage } from "@/lib/error-message";
import { ContractSignButton } from "./contract-sign-button";
import { ContractAdminEditButton } from "./contract-admin-edit-button";

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
    if (contract.status === "draft") return "signwell_draft" as const;
    return contract.status === "viewed" ? ("viewed" as const) : ("with_client" as const);
  }
  if (!contract.signer_name || !contract.signer_email) return "missing_info" as const;
  return "ready_for_signwell" as const;
}

const LABELS: Record<ReturnType<typeof signingState>, string> = {
  external: "External contract",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  with_client: "With client",
  viewed: "Viewed by client",
  signwell_draft: "SignWell draft",
  missing_info: "Missing signer details",
  ready_for_signwell: "Ready for SignWell",
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
  const createLink = useServerFn(sendContractForSignature);

  const linkMutation = useMutation({
    mutationFn: () => createLink({ data: { contractId: contract.id } }),
    onSuccess: async (result) => {
      toast.success(
        result.testMode
          ? "Test SignWell draft created. Open it to review and send."
          : "SignWell draft created. Open it to review and send.",
      );
      await onChanged();
    },
    onError: (error) =>
      toast.error(errorMessage(error, "SignWell could not create the editable draft.")),
  });

  // Legacy externally hosted contracts keep their existing provider and link.
  if (state === "external") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-surface/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-inset ring-border">
        {LABELS[state]}
      </span>

      {state === "ready_for_signwell" && (
        <button
          type="button"
          onClick={() => linkMutation.mutate()}
          disabled={linkMutation.isPending}
          className={`${btn} border-primary/50 text-primary`}
        >
          {linkMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Create SignWell draft"
          )}
        </button>
      )}

      {state === "signwell_draft" && (
        <ContractAdminEditButton
          contractId={contract.id}
          onChanged={onChanged}
          className={`${btn} inline-flex items-center gap-1 border-primary/50 text-primary`}
        />
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
    </div>
  );
}
