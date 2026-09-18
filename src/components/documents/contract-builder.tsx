import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  businessContractValues,
  businessFooterLine,
  businessProfile,
} from "@/lib/business-profile";
import { formatMoney } from "@/lib/invoice-document";
import { invoiceItemsFromJson } from "@/lib/invoice-items";
import { errorMessage } from "@/lib/error-message";
import {
  contractFieldsForTemplate,
  contractGuidancePrompts,
  contractValuesFromClientProfile,
  contractValuesFromJson,
  fillMissingContractValues,
  renderContract,
  todayLocalDate,
  type ContractField,
  type ContractValues,
} from "@/lib/contract-variables";
import { TemplatePicker, type TemplateRow } from "./template-picker";

type ContractRow = Database["public"]["Tables"]["client_contracts"]["Row"];
type Draft = Pick<
  ContractRow,
  | "id"
  | "title"
  | "description"
  | "status"
  | "contract_data"
  | "signer_name"
  | "signer_email"
  | "source_template_id"
  | "source_template_version"
>;

type Snapshot = {
  templateText?: string;
  values?: unknown;
  sourceInvoiceId?: string | null;
  sourceProjectId?: string | null;
};

const fieldCls =
  "mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

function draftHtml(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)} · Draft</title>
<style>@page{size:letter;margin:18mm}body{font:14px/1.65 Georgia,serif;color:#18232b;max-width:800px;margin:32px auto;padding:0 24px}
header{border-bottom:2px solid #18232b;padding-bottom:20px}img{max-height:64px}h1{font:700 25px system-ui;margin:24px 0}
.body{white-space:pre-wrap;overflow-wrap:anywhere}.draft{font:700 12px system-ui;color:#685400;text-transform:uppercase}
footer{border-top:1px solid #ccc;margin-top:48px;padding-top:14px;font:12px system-ui;color:#566}</style></head><body>
<header><img src="${escapeHtml(businessProfile.logoUrl)}" alt="${escapeHtml(businessProfile.name)}"></header>
<h1>${escapeHtml(title)}</h1><p class="draft">Private draft · review before sending</p>
<div class="body">${escapeHtml(content)}</div><footer>${escapeHtml(businessFooterLine)}</footer></body></html>`;
}

function invoiceServiceText(invoice: {
  line_items: unknown;
  description: string | null;
  amount_cents: number | null;
  currency: string;
}): string {
  const items = invoiceItemsFromJson(invoice.line_items);
  if (!items.length)
    return invoice.description
      ? `${invoice.description} — ${formatMoney(invoice.amount_cents, invoice.currency)}`
      : "";
  return items
    .map(
      (item) =>
        `${item.title ?? item.description}: ${item.description} — ${item.quantity} × ${formatMoney(item.unitCents, invoice.currency)} = ${formatMoney(item.quantity * item.unitCents, invoice.currency)}`,
    )
    .join("\n");
}

export function ContractBuilder({
  workspaceId,
  clientLabel,
  draft,
  onDone,
}: {
  workspaceId: string;
  clientLabel: string;
  draft?: Draft | null;
  onDone: () => void;
}) {
  const snapshot = (draft?.contract_data ?? {}) as Snapshot;
  const [title, setTitle] = useState(draft?.title ?? "");
  const [templateText, setTemplateText] = useState(
    snapshot.templateText ?? draft?.description ?? "",
  );
  const [values, setValues] = useState<ContractValues>(() => {
    const initial = contractValuesFromJson(snapshot.values);
    if (draft?.signer_name && !initial.signer_name) initial.signer_name = draft.signer_name;
    if (draft?.signer_email && !initial.signer_email) initial.signer_email = draft.signer_email;
    if (!draft) initial.today_date = todayLocalDate();
    return initial;
  });
  const [signerName, setSignerName] = useState(draft?.signer_name ?? values.client_name ?? "");
  const [signerEmail, setSignerEmail] = useState(draft?.signer_email ?? "");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [sourceInvoiceId, setSourceInvoiceId] = useState(snapshot.sourceInvoiceId ?? "");
  const [sourceProjectId, setSourceProjectId] = useState(snapshot.sourceProjectId ?? "");
  const contextApplied = useRef(Boolean(draft));

  const context = useQuery({
    queryKey: ["contract-builder-context", workspaceId],
    queryFn: async () => {
      const [workspace, account, projects, productions, invoices] = await Promise.all([
        supabase
          .from("workspaces")
          .select("id,name,client_name,business_name,wedding_date,wedding_location,service_area")
          .eq("id", workspaceId)
          .single(),
        supabase
          .from("crm_accounts")
          .select(
            "id,business_name,email,phone,website,address_line1,address_line2,city,state,postal_code,country",
          )
          .eq("linked_workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("projects")
          .select("id,name,event_date,start_date,client_name,business_name")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false }),
        supabase
          .from("production_projects")
          .select("id,title,location,scheduled_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("client_invoices")
          .select("id,number,description,amount_cents,currency,line_items,status")
          .eq("workspace_id", workspaceId)
          .order("issued_at", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      if (workspace.error) throw workspace.error;
      const contact = account.data?.id
        ? await supabase
            .from("crm_contacts")
            .select("first_name,last_name,job_title,email,phone")
            .eq("account_id", account.data.id)
            .eq("is_primary", true)
            .limit(1)
            .maybeSingle()
        : null;
      return {
        workspace: workspace.data,
        account: account.error ? null : account.data,
        contact: contact?.error ? null : (contact?.data ?? null),
        projects: projects.data ?? [],
        production: productions.error ? null : (productions.data?.[0] ?? null),
        invoices: invoices.data ?? [],
      };
    },
  });

  useEffect(() => {
    if (!context.data || contextApplied.current) return;
    const { workspace, account, contact, projects, production, invoices } = context.data;
    const project = projects[0];
    const invoice = invoices.find(
      (row) =>
        row.status !== "draft" &&
        row.status !== "void" &&
        invoiceItemsFromJson(row.line_items).length > 0,
    );
    const profileValues = contractValuesFromClientProfile({
      clientName:
        workspace.client_name ||
        (contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "") ||
        project?.client_name ||
        workspace.name,
      businessName:
        workspace.business_name || account?.business_name || project?.business_name || "",
      businessEmail: account?.email,
      businessPhone: account?.phone,
      website: account?.website,
      addressLine1: account?.address_line1,
      addressLine2: account?.address_line2,
      city: account?.city,
      state: account?.state,
      postalCode: account?.postal_code,
      country: account?.country,
      contactFirstName: contact?.first_name,
      contactLastName: contact?.last_name,
      contactTitle: contact?.job_title,
      contactEmail: contact?.email,
      contactPhone: contact?.phone,
    });
    setValues((current) => ({
      ...fillMissingContractValues(current, profileValues),
      project_name: current.project_name || project?.name || production?.title || "",
      project_date:
        current.project_date ||
        project?.event_date ||
        project?.start_date ||
        workspace.wedding_date ||
        production?.scheduled_at?.slice(0, 10) ||
        "",
      location:
        current.location ||
        workspace.wedding_location ||
        production?.location ||
        workspace.service_area ||
        "",
      services: current.services || (invoice ? invoiceServiceText(invoice) : ""),
    }));
    if (project && !values.project_name) setSourceProjectId(project.id);
    if (invoice && !values.services) setSourceInvoiceId(invoice.id);
    setSignerName(
      (current) =>
        current ||
        (contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "") ||
        workspace.client_name ||
        project?.client_name ||
        workspace.name,
    );
    if (contact?.email || account?.email)
      setSignerEmail((current) => current || contact?.email || account?.email || "");
    contextApplied.current = true;
  }, [context.data, values.project_name, values.services]);

  const updateValue = (key: ContractField, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const refreshFromClient = () => {
    if (!context.data) return;
    const { workspace, account, contact, projects, production, invoices } = context.data;
    const project = projects.find((row) => row.id === sourceProjectId) ?? projects[0];
    const invoice =
      invoices.find((row) => row.id === sourceInvoiceId) ??
      invoices.find(
        (row) =>
          row.status !== "draft" &&
          row.status !== "void" &&
          invoiceItemsFromJson(row.line_items).length > 0,
      );
    const profileValues = contractValuesFromClientProfile({
      clientName:
        workspace.client_name ||
        (contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "") ||
        project?.client_name ||
        workspace.name,
      businessName:
        workspace.business_name || account?.business_name || project?.business_name || "",
      businessEmail: account?.email,
      businessPhone: account?.phone,
      website: account?.website,
      addressLine1: account?.address_line1,
      addressLine2: account?.address_line2,
      city: account?.city,
      state: account?.state,
      postalCode: account?.postal_code,
      country: account?.country,
      contactFirstName: contact?.first_name,
      contactLastName: contact?.last_name,
      contactTitle: contact?.job_title,
      contactEmail: contact?.email,
      contactPhone: contact?.phone,
    });
    setValues((current) => ({
      ...current,
      ...Object.fromEntries(Object.entries(profileValues).filter(([, value]) => value.trim())),
      project_name: project?.name || production?.title || "",
      project_date:
        project?.event_date ||
        project?.start_date ||
        workspace.wedding_date ||
        production?.scheduled_at?.slice(0, 10) ||
        "",
      today_date: todayLocalDate(),
      location: workspace.wedding_location || production?.location || workspace.service_area || "",
      services: invoice ? invoiceServiceText(invoice) : current.services,
    }));
    if (project) setSourceProjectId(project.id);
    if (invoice) setSourceInvoiceId(invoice.id);
    setSignerName(
      profileValues.signer_name || workspace.client_name || project?.client_name || workspace.name,
    );
    if (profileValues.signer_email) setSignerEmail(profileValues.signer_email);
  };
  const chooseTemplate = (template: TemplateRow) => {
    const body = (template.body ?? {}) as { title?: string; content?: string };
    setSelectedTemplate(template);
    setTitle(body.title ?? template.name);
    setTemplateText(body.content ?? "");
  };
  const chooseProject = (id: string) => {
    setSourceProjectId(id);
    const project = context.data?.projects.find((row) => row.id === id);
    if (!project) return;
    setValues((current) => ({
      ...current,
      project_name: project.name,
      project_date: project.event_date ?? project.start_date ?? "",
    }));
  };
  const chooseInvoice = (id: string) => {
    setSourceInvoiceId(id);
    const invoice = context.data?.invoices.find((row) => row.id === id);
    if (invoice) updateValue("services", invoiceServiceText(invoice));
  };
  const rendered = renderContract(templateText, { ...values, ...businessContractValues });
  const requiredFields = useMemo(() => contractFieldsForTemplate(templateText), [templateText]);
  const guidancePrompts = contractGuidancePrompts(templateText);
  const canSave =
    title.trim().length >= 2 &&
    templateText.trim().length > 0 &&
    rendered.unknown.length === 0 &&
    rendered.missing.length === 0 &&
    guidancePrompts.length === 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!canSave) throw new Error("Complete every contract variable before saving.");
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Your session expired. Please sign in again.");
      const contractData = {
        templateText,
        values,
        sourceInvoiceId: sourceInvoiceId || null,
        sourceProjectId: sourceProjectId || null,
      };
      const fields = {
        title: title.trim(),
        description: rendered.content,
        contract_data: contractData as never,
        signer_name: signerName.trim() || null,
        signer_email: signerEmail.trim() || null,
        source_template_id: selectedTemplate?.id ?? draft?.source_template_id ?? null,
        source_template_version:
          selectedTemplate?.version ?? draft?.source_template_version ?? null,
      };
      const result = draft
        ? await supabase
            .from("client_contracts")
            .update(fields)
            .eq("id", draft.id)
            .eq("workspace_id", workspaceId)
            .eq("status", "draft")
            .is("published_at", null)
            .select("id")
            .single()
        : await supabase
            .from("client_contracts")
            .insert({
              ...fields,
              workspace_id: workspaceId,
              provider: "other",
              hosted_url: null,
              status: "draft",
              sent_at: null,
              published_at: null,
              created_by: auth.user.id,
            })
            .select("id")
            .single();
      if (result.error) {
        if (
          result.error.message.includes("contract_data") &&
          (result.error.code === "PGRST204" ||
            result.error.code === "42703" ||
            result.error.message.includes("schema cache"))
        ) {
          throw new Error(
            "Contract variables cannot be saved until the contract snapshot migration is applied. Your draft is still on this screen.",
          );
        }
        throw result.error;
      }
      if (!result.data?.id) throw new Error("The contract draft was not saved.");
    },
    onSuccess: () => {
      toast.success(draft ? "Contract draft updated." : "Private contract draft created.");
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error, "Could not save contract draft.")),
  });

  const openPreview = () => {
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Allow the contract preview window, then try again.");
      return;
    }
    win.opener = null;
    win.document.write(draftHtml(title, rendered.content));
    win.document.close();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      className="space-y-6 rounded-2xl border border-primary/25 bg-surface/40 p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">
            {draft ? "Edit private contract draft" : "Create contract"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Assigned to {clientLabel}. Review the filled details before saving. Nothing is sent.
          </p>
        </div>
        <TemplatePicker
          kind="contract"
          label={selectedTemplate || draft ? "Change template" : "Choose contract template"}
          onPick={chooseTemplate}
        />
      </div>
      {context.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading this client's details…
        </p>
      )}
      {context.isError && (
        <p className="text-xs text-destructive">
          Client details could not load: {errorMessage(context.error, "Try again.")}
        </p>
      )}
      {!templateText ? (
        <div className="rounded-xl border border-dashed border-primary/35 bg-primary/5 p-8 text-center">
          <h4 className="text-base font-semibold">Choose a contract template to begin</h4>
          <p className="mt-2 text-sm text-muted-foreground">
            The exact details needed for that agreement will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-5 rounded-xl border border-border bg-background/60 p-4 sm:p-6">
          <div>
            <h4 className="text-base font-semibold">Contract details</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Only client, signer, project, and agreement details appear here. Dream Wave branding
              and business information is added automatically.
            </p>
            <button
              type="button"
              disabled={!context.data}
              onClick={refreshFromClient}
              className="mt-3 min-h-10 rounded-lg border border-border px-3 text-xs font-semibold hover:border-primary/40 disabled:opacity-50"
            >
              Refresh from client profile
            </button>
          </div>
          <label className="block text-xs font-medium">
            Contract title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={fieldCls}
            />
          </label>
          {context.data?.projects.length ? (
            <label className="block text-xs font-medium">
              Copy from project
              <select
                value={sourceProjectId}
                onChange={(event) => chooseProject(event.target.value)}
                className={fieldCls}
              >
                <option value="">Choose project</option>
                {context.data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {requiredFields
              .filter(({ key }) => !["services", "signer_name", "signer_email"].includes(key))
              .map(({ key, label, input }) => (
                <label key={key} className="block text-xs font-medium">
                  {label}
                  {input === "textarea" ? (
                    <textarea
                      value={values[key] ?? ""}
                      onChange={(event) => updateValue(key, event.target.value)}
                      className="mt-1 min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
                    />
                  ) : (
                    <input
                      type={input}
                      value={values[key] ?? ""}
                      onChange={(event) => updateValue(key, event.target.value)}
                      className={fieldCls}
                    />
                  )}
                </label>
              ))}
          </div>
          {context.data?.invoices.length ? (
            <label className="block text-xs font-medium">
              Copy purchased items from invoice
              <select
                value={sourceInvoiceId}
                onChange={(event) => chooseInvoice(event.target.value)}
                className={fieldCls}
              >
                <option value="">Choose invoice</option>
                {context.data.invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number || invoice.id.slice(0, 8)} ·{" "}
                    {formatMoney(invoice.amount_cents, invoice.currency)} · {invoice.status}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {requiredFields.some(({ key }) => key === "services") && (
            <label className="block text-xs font-medium">
              Services / purchased items
              <textarea
                value={values.services ?? ""}
                onChange={(event) => updateValue("services", event.target.value)}
                placeholder="Paste the agreed items or copy them from an invoice above"
                className="mt-1 min-h-36 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
              />
            </label>
          )}
          <fieldset className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <legend className="px-1 text-sm font-semibold">Signing recipient</legend>
            <p className="text-xs text-muted-foreground">
              Required before a SignWell draft can be created. Saving these fields does not send an
              email or create a SignWell request.
            </p>
            <label className="block text-xs font-medium">
              Signer name
              <input
                type="text"
                autoComplete="name"
                value={signerName}
                onChange={(event) => {
                  setSignerName(event.target.value);
                  updateValue("signer_name", event.target.value);
                }}
                placeholder="Client's full name"
                className={fieldCls}
              />
            </label>
            <label className="block text-xs font-medium">
              Signer email
              <input
                type="email"
                autoComplete="email"
                value={signerEmail}
                onChange={(event) => {
                  setSignerEmail(event.target.value);
                  updateValue("signer_email", event.target.value);
                }}
                placeholder="client@example.com"
                className={fieldCls}
              />
            </label>
            {(!signerName.trim() || !signerEmail.trim()) && (
              <p className="text-xs font-medium text-warning">
                Add both fields and save the draft to enable SignWell.
              </p>
            )}
          </fieldset>
        </div>
      )}
      {(rendered.missing.length > 0 ||
        rendered.unknown.length > 0 ||
        guidancePrompts.length > 0) && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
          {rendered.missing.length > 0 && `Complete: ${rendered.missing.join(", ")}. `}
          {rendered.unknown.length > 0 && `Unknown variables: ${rendered.unknown.join(", ")}.`}
          {guidancePrompts.length > 0 &&
            `Replace ${guidancePrompts.length} starter clause prompt${guidancePrompts.length === 1 ? "" : "s"} before saving.`}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={openPreview}
          className="min-h-11 rounded-lg border border-border px-4 text-sm"
        >
          Preview filled contract
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded-lg border border-border px-4 text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave || save.isPending || context.isLoading || context.isError}
          className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : draft ? "Save draft changes" : "Create without sending"}
        </button>
      </div>
    </form>
  );
}
