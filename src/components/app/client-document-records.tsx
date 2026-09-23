import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FileCheck2, FileText } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  ClientContractCopyButton,
  ClientInvoiceCopyButton,
  SignedContractPdfButton,
} from "@/components/documents/client-document-copy-buttons";
import { isValidHttpsUrl } from "@/lib/url-validation";
import type { Database } from "@/integrations/supabase/types";

type Invoice = Database["public"]["Tables"]["client_invoices"]["Row"];
type ContractRecord = {
  id: string;
  title: string;
  description: string | null;
  hosted_url: string | null;
  status: "draft" | "sent" | "viewed" | "signed" | "declined" | "expired" | "void";
  signed_at: string | null;
  published_at: string | null;
  provider_document_id: string | null;
};

const externalDb = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        neq: (
          column: string,
          value: string,
        ) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => Promise<{ data: ContractRecord[] | null; error: Error | null }>;
        };
      };
    };
  };
};

function money(cents: number | null, currency: string) {
  if (cents == null) return "Amount not recorded";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** Client-owned archive. Current action items can still appear on Home. */
export function ClientDocumentRecords({
  workspaceId,
  clientName,
}: {
  workspaceId: string;
  clientName: string;
}) {
  const invoices = useQuery({
    queryKey: ["client-document-records", "invoices", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("workspace_id", workspaceId)
        .neq("status", "draft")
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });
  const contracts = useQuery({
    queryKey: ["client-document-records", "contracts", workspaceId],
    queryFn: async () => {
      const { data, error } = await externalDb
        .from("client_contracts")
        .select(
          "id,title,description,hosted_url,status,signed_at,published_at,provider_document_id",
        )
        .eq("workspace_id", workspaceId)
        .neq("status", "draft")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <section className="space-y-4" aria-labelledby="document-records-heading">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Records</p>
        <h2 id="document-records-heading" className="mt-1 text-xl font-semibold text-foreground">
          Your documents
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Contracts and invoices stay organized here for viewing, printing, or downloading.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DocumentGroup
          title="Contracts"
          icon={FileCheck2}
          loading={contracts.isLoading}
          empty={!contracts.data?.length}
          error={contracts.isError}
        >
          {contracts.data?.map((contract) => (
            <article key={contract.id} className="rounded-xl border border-border/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-foreground">{contract.title}</h3>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {contract.status}
                    {contract.signed_at
                      ? ` · Completed ${new Date(contract.signed_at).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {contract.status === "signed" && contract.provider_document_id && (
                  <SignedContractPdfButton contractId={contract.id} />
                )}
                <ClientContractCopyButton
                  title={contract.title}
                  description={contract.description}
                  signedAt={contract.signed_at}
                />
                {isValidHttpsUrl(contract.hosted_url) && (
                  <a
                    href={contract.hosted_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold text-foreground"
                  >
                    Open original link
                  </a>
                )}
              </div>
            </article>
          ))}
        </DocumentGroup>

        <DocumentGroup
          title="Invoices & receipts"
          icon={FileText}
          loading={invoices.isLoading}
          empty={!invoices.data?.length}
          error={invoices.isError}
        >
          {invoices.data?.map((invoice) => (
            <article key={invoice.id} className="rounded-xl border border-border/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {invoice.number ? `Invoice ${invoice.number}` : "Invoice"}
                  </h3>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {invoice.status.replaceAll("_", " ")} ·{" "}
                    {new Date(invoice.issued_at).toLocaleDateString()}
                  </p>
                </div>
                <strong className="text-sm text-foreground">
                  {money(invoice.amount_cents, invoice.currency)}
                </strong>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <ClientInvoiceCopyButton invoice={invoice} clientName={clientName} />
                {isValidHttpsUrl(invoice.hosted_url) && (
                  <a
                    href={invoice.hosted_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold text-foreground"
                  >
                    Open original payment link
                  </a>
                )}
              </div>
            </article>
          ))}
        </DocumentGroup>
      </div>
    </section>
  );
}

function DocumentGroup({
  title,
  icon: Icon,
  loading,
  empty,
  error,
  children,
}: {
  title: string;
  icon: typeof FileText;
  loading: boolean;
  empty: boolean;
  error: boolean;
  children: ReactNode;
}) {
  return (
    <div className="surface-card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="py-5 text-sm text-muted-foreground">Loading records…</p>
        ) : error ? (
          <p className="py-5 text-sm text-destructive">These records could not be loaded.</p>
        ) : empty ? (
          <p className="py-5 text-sm text-muted-foreground">No records in this category yet.</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
