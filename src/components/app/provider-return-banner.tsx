import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReturnSearch = {
  invoice?: string;
  payment?: "success" | "cancelled";
  session_id?: string;
  contract?: string;
  signing?: "completed" | "declined";
};

/** The return URL is a navigation hint. Only the user's visible database row confirms status. */
export function ProviderReturnBanner({
  search,
  weddingClient,
}: {
  search: ReturnSearch;
  weddingClient: boolean;
}) {
  const [pollUntil] = useState(() => Date.now() + 60_000);
  const paymentReturn = !!search.invoice && !!search.payment;
  const signingReturn = !!search.contract && !!search.signing;

  const invoiceQ = useQuery({
    queryKey: ["provider-return", "invoice", search.invoice],
    enabled: paymentReturn,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invoices")
        .select("id,status,provider_session_id")
        .eq("id", search.invoice!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
    refetchInterval: (query) =>
      search.payment === "success" && query.state.data?.status !== "paid" && Date.now() < pollUntil
        ? 3_000
        : false,
  });

  const contractQ = useQuery({
    queryKey: ["provider-return", "contract", search.contract],
    enabled: signingReturn,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contracts")
        .select("id,status")
        .eq("id", search.contract!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
    refetchInterval: (query) =>
      search.signing === "completed" &&
      query.state.data?.status !== "signed" &&
      Date.now() < pollUntil
        ? 3_000
        : false,
  });

  if (!paymentReturn && !signingReturn) return null;

  let title = "Returning to WaveOS";
  let detail = "Checking your account…";
  let section = "contracts";

  if (paymentReturn) {
    section = weddingClient ? "wedding-invoices" : "invoices";
    if (search.payment === "cancelled") {
      title = "Checkout closed";
      detail = "Review your invoice below to see its current payment status.";
    } else if (invoiceQ.isError || (!invoiceQ.isLoading && !invoiceQ.data)) {
      title = "Invoice unavailable";
      detail =
        "We could not find this invoice in your account. Contact Dream Wave Media if you need help.";
    } else if (
      invoiceQ.data?.status === "paid" &&
      search.session_id &&
      invoiceQ.data.provider_session_id === search.session_id
    ) {
      title = "Payment confirmed";
      detail = "Your invoice is paid. You can review it below.";
    } else if (invoiceQ.data?.status === "paid") {
      title = "Invoice paid";
      detail = "Your invoice is marked paid. You can review it below.";
    } else if (invoiceQ.isLoading) {
      title = "Checking payment";
      detail = "We are loading your invoice status.";
    } else {
      title = "Payment submitted";
      detail =
        Date.now() < pollUntil
          ? "We are waiting for Stripe's confirmation. This page will update automatically."
          : "Your payment is still processing. Check the invoice below again later.";
    }
  } else if (signingReturn) {
    section = weddingClient ? "wedding-contracts" : "contracts";
    if (contractQ.isError || (!contractQ.isLoading && !contractQ.data)) {
      title = "Contract unavailable";
      detail =
        "We could not find this contract in your account. Contact Dream Wave Media if you need help.";
    } else if (contractQ.data?.status === "signed") {
      title = "Contract signed";
      detail = "Your completed signature has been verified. You can review your contract below.";
    } else if (contractQ.data?.status === "declined") {
      title = "Contract declined";
      detail = "Your contract status has been updated. You can review it below.";
    } else if (search.signing === "declined") {
      title = "Signing closed";
      detail = "Review your contract below for its current status.";
    } else if (contractQ.isLoading) {
      title = "Checking signature";
      detail = "We are loading your contract status.";
    } else {
      title = "Signature submitted";
      detail =
        Date.now() < pollUntil
          ? "We are waiting for SignWell's confirmation. This page will update automatically."
          : "Your signature is still being verified. Check the contract below again later.";
    }
  }

  return (
    <div role="status" className="surface-card mb-5 rounded-xl border border-primary/20 p-5">
      <h2 className="font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      <a
        href={`#${section}`}
        className="mt-3 inline-block text-sm font-medium text-primary underline"
      >
        {paymentReturn ? "View invoice" : "View contract"}
      </a>
    </div>
  );
}
