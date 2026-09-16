import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

import { getContractSigningState } from "@/lib/contracts.functions";
import { errorMessage } from "@/lib/error-message";

type Search = { contract?: string };

export const Route = createFileRoute("/_authenticated/contract-return")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    contract: typeof search['contract'] === "string" ? search['contract'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Contract signing status | WaveOS" },
      { name: "description", content: "Confirmation of your Dream Wave Media contract signature." },
      { property: "og:title", content: "Contract signing status | WaveOS" },
      {
        property: "og:description",
        content: "Confirmation of your Dream Wave Media contract signature.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContractReturn,
});

function ContractReturn() {
  const { contract: contractId } = Route.useSearch();
  const fetchState = useServerFn(getContractSigningState);
  const [waitedOut, setWaitedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedOut(true), 90_000);
    return () => clearTimeout(timer);
  }, []);

  const query = useQuery({
    queryKey: ["contract-return", contractId],
    enabled: Boolean(contractId),
    retry: false,
    queryFn: () => fetchState({ data: { contractId: contractId! } }),
    // Only the verified document_completed webhook flips this to signed.
    refetchInterval: (q) => (q.state.data?.signed || waitedOut ? false : 3000),
  });

  const view = useMemo(() => {
    if (!contractId) return "missing" as const;
    if (query.isError) return "error" as const;
    if (query.data?.signed) return "signed" as const;
    if (query.data?.declined) return "declined" as const;
    if (waitedOut) return "pending" as const;
    return "submitted" as const;
  }, [contractId, query.isError, query.data?.signed, query.data?.declined, waitedOut]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <div className="surface-card space-y-5 p-6 text-center sm:p-8">
        {view === "signed" ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        ) : view === "declined" || view === "error" || view === "missing" ? (
          <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        ) : view === "pending" ? (
          <Clock className="mx-auto h-12 w-12 text-primary" />
        ) : (
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
        )}

        <h1 className="text-2xl font-semibold text-foreground">
          {view === "signed"
            ? "Contract signed"
            : view === "declined"
              ? "Signing was not completed"
              : view === "missing"
                ? "Contract status unavailable"
                : view === "error"
                  ? "We could not load this contract"
                  : view === "pending"
                    ? "Still finishing up"
                    : "Signature submitted"}
        </h1>

        <p className="text-sm text-muted-foreground">
          {view === "signed"
            ? "Everyone has signed and your agreement is complete. A copy stays in your portal."
            : view === "declined"
              ? "This agreement was not signed. Nothing has changed — reach out to us if that wasn't intended."
              : view === "missing"
                ? "We didn't receive a contract reference. Open your contracts to check the current status."
                : view === "error"
                  ? errorMessage(query.error, "Please open your contracts to check the current status.")
                  : view === "pending"
                    ? "Your signature is with the signing service. The status here will update on its own once it's finalised."
                    : "We're confirming your signature with the signing service. This usually takes a few seconds."}
        </p>

        {query.data?.title && (
          <p className="text-sm font-semibold text-foreground">{query.data.title}</p>
        )}

        <Link
          to="/home"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:brightness-110 sm:w-auto"
        >
          Back to my contracts
        </Link>
      </div>
    </main>
  );
}
