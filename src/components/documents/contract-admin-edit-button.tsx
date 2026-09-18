import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getContractAdminEditLink } from "@/lib/contracts.functions";
import { errorMessage } from "@/lib/error-message";
import { loadSignWellEmbed } from "./contract-sign-button";

export function ContractAdminEditButton({
  contractId,
  onChanged,
  className,
}: {
  contractId: string;
  onChanged: () => void | Promise<unknown>;
  className?: string;
}) {
  const getEditLink = useServerFn(getContractAdminEditLink);
  const opening = useMutation({
    mutationFn: async () => {
      const [link, SignWellEmbed] = await Promise.all([
        getEditLink({ data: { contractId } }),
        loadSignWellEmbed(),
      ]);
      return { ...link, SignWellEmbed };
    },
  });

  return (
    <button
      type="button"
      disabled={opening.isPending}
      className={className}
      onClick={() =>
        opening.mutate(undefined, {
          onSuccess: ({ url, SignWellEmbed }) => {
            const editor = new SignWellEmbed({
              url,
              start: "document_view",
              showHeader: true,
              showSendButton: true,
              allowDownload: true,
              allowAddContacts: true,
              allowCC: true,
              events: {
                completed: async () => {
                  toast.success("SignWell updated the contract and sent the signature request.");
                  await onChanged();
                },
                closed: async () => {
                  await onChanged();
                },
                error: () => toast.error("SignWell could not open the admin editor."),
              },
            });
            editor.open();
          },
          onError: (error) =>
            toast.error(errorMessage(error, "Could not open the SignWell admin editor.")),
        })
      }
    >
      {opening.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ExternalLink className="h-4 w-4" />
      )}
      {opening.isPending ? "Opening SignWell…" : "Edit & send in SignWell"}
    </button>
  );
}
