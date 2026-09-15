import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Eye, Loader2, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { businessProfile } from "@/lib/business-profile";
import { invoiceDocumentHtml } from "@/lib/invoice-document";
import {
  invoiceItemTotal,
  moneyInputToCents,
  validInvoiceItems,
  invoiceItemsFromJson,
} from "@/lib/invoice-items";
import { useTemplates, type TemplateKind, type TemplateRow } from "./template-picker";

const KINDS: Array<{ key: TemplateKind; label: string }> = [
  { key: "invoice", label: "Invoice item templates" },
  { key: "contract", label: "Contract templates" },
  { key: "form", label: "Form templates" },
];

const inputCls =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

type Body = {
  title?: string;
  description?: string;
  content?: string;
  items?: unknown;
  fields?: Array<{ label: string; type: string }>;
};

/**
 * Owner-only reusable document templates. Editing an existing template bumps
 * its version so earlier documents stay traceable; archiving keeps the record
 * but removes it from the pickers.
 */
export function TemplateLibrary() {
  const [kind, setKind] = useState<TemplateKind>("invoice");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | "new" | null>(null);
  const qc = useQueryClient();
  const q = useTemplates(kind, !showArchived);
  const refresh = () => qc.invalidateQueries({ queryKey: ["document-templates"] });

  const archive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("document_templates")
        .update({ is_active: active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, "Could not update the template.")),
  });

  const previewTemplate = (template: TemplateRow) => {
    const body = (template.body ?? {}) as Body;
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Allow the preview window to open, then try again.");
      return;
    }
    win.opener = null;
    if (template.kind === "invoice") {
      const items = invoiceItemsFromJson(body.items);
      win.document.write(
        invoiceDocumentHtml(
          {
            id: "preview",
            number: "DWM-PREVIEW",
            description: body.description ?? template.description ?? null,
            currency: "USD",
            amountCents: items.length ? invoiceItemTotal(items) : 0,
            amountPaidCents: 0,
            status: "draft",
            issuedAt: new Date().toISOString(),
            dueAt: null,
            paidAt: null,
            billTo: { name: "Sample client" },
            projectReference: null,
            lineItems: items,
            isDraft: true,
          },
          { portalUrl: `${window.location.origin}/home` },
        ),
      );
    } else {
      const lines =
        template.kind === "form"
          ? (body.fields ?? []).map((f) => `<li>${escapeHtml(f.label)}</li>`).join("")
          : "";
      win.document.write(
        `<!doctype html><meta charset="utf-8"><title>${escapeHtml(template.name)}</title>` +
          `<body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 20px;color:#111">` +
          `<img src="${businessProfile.logoUrl}" alt="${escapeHtml(businessProfile.name)}" style="height:56px"/>` +
          `<h1 style="font-size:20px">${escapeHtml(body.title ?? template.name)}</h1>` +
          `<p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(body.content ?? template.description ?? "")}</p>` +
          (lines ? `<ol style="line-height:1.8">${lines}</ol>` : "") +
          `<hr style="margin-top:32px"/><p style="font-size:12px;color:#555">${escapeHtml(
            `${businessProfile.name} · ${businessProfile.website.replace(/^https?:\/\//, "")} · ${businessProfile.location} · ${businessProfile.phone}`,
          )}</p></body>`,
      );
    }
    win.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => {
              setKind(k.key);
              setEditing(null);
            }}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-sm",
              kind === k.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {k.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <button
          type="button"
          onClick={() => setEditing(editing === "new" ? null : "new")}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {editing === "new" ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {editing === "new"
            ? "Cancel"
            : kind === "invoice"
              ? "New invoice item template"
              : "New document template"}
        </button>
      </div>

      {editing && (
        <TemplateEditor
          key={editing === "new" ? `new-${kind}` : editing.id}
          kind={kind}
          template={editing === "new" ? null : editing}
          onDone={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No templates in this category yet.</p>
      ) : (
        <ul className="space-y-2">
          {q.data!.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{template.name}</span>
                  <span className="text-[10px] text-muted-foreground">v{template.version}</span>
                  {!template.is_active && (
                    <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                      archived
                    </span>
                  )}
                </div>
                {template.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => previewTemplate(template)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs"
                >
                  <Eye className="h-3.5 w-3.5" /> Preview
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(template)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => archive.mutate({ id: template.id, active: !template.is_active })}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs"
                >
                  {template.is_active ? (
                    <>
                      <Archive className="h-3.5 w-3.5" /> Archive
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </>
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplateEditor({
  kind,
  template,
  onDone,
}: {
  kind: TemplateKind;
  template: TemplateRow | null;
  onDone: () => void;
}) {
  const body = (template?.body ?? {}) as Body;
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [content, setContent] = useState(body.content ?? "");
  const [questions, setQuestions] = useState((body.fields ?? []).map((f) => f.label).join("\n"));
  const existingItems = invoiceItemsFromJson(body.items);
  const [items, setItems] = useState(() =>
    existingItems.length
      ? existingItems.map((item) => ({
          description: item.description,
          quantity: String(item.quantity),
          price: (item.unitCents / 100).toFixed(2),
        }))
      : [{ description: "", quantity: "1", price: "0.00" }],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Give the template a name.");
      const pricedItems =
        kind === "invoice"
          ? items.map((item) => ({
              description: item.description.trim(),
              quantity: Number(item.quantity),
              unitCents: moneyInputToCents(item.price),
            }))
          : [];
      if (
        kind === "invoice" &&
        (pricedItems.length === 0 ||
          pricedItems.some((item) => item.unitCents === null) ||
          !validInvoiceItems(
            pricedItems.map((item) => ({ ...item, unitCents: item.unitCents ?? -1 })),
          ))
      )
        throw new Error(
          "Add at least one item with a description, whole-number quantity, and valid price.",
        );
      const nextBody: Body = {
        title: name.trim(),
        description: description.trim() || undefined,
        content: content.trim() || undefined,
        ...(kind === "invoice" ? { items: pricedItems } : {}),
        ...(kind === "form"
          ? {
              fields: questions
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((label) => ({ label, type: "text" })),
            }
          : {}),
      };
      const { data: auth } = await supabase.auth.getUser();
      if (template) {
        const { error } = await supabase
          .from("document_templates")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            body: nextBody as never,
            version: template.version + 1,
          })
          .eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("document_templates").insert({
          kind,
          name: name.trim(),
          description: description.trim() || null,
          body: nextBody as never,
          created_by: auth.user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(template ? "Template updated — new version saved." : "Template created.");
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save the template.")),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4"
    >
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={kind === "invoice" ? "Item collection name" : "Template name"}
        className={inputCls}
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description"
        className={inputCls}
      />
      {kind === "invoice" ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Priced invoice items</p>
          <p className="text-xs text-muted-foreground">
            Each item can be clicked and added to a client's invoice. Prices are copied into that
            invoice when selected.
          </p>
          {items.map((item, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_90px_130px_auto]"
            >
              <label className="text-xs text-muted-foreground">
                Item description
                <input
                  required
                  value={item.description}
                  onChange={(e) =>
                    setItems((current) =>
                      current.map((row, i) =>
                        i === index ? { ...row, description: e.target.value } : row,
                      ),
                    )
                  }
                  className={inputCls}
                  placeholder="Wedding video coverage"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Qty
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={item.quantity}
                  onChange={(e) =>
                    setItems((current) =>
                      current.map((row, i) =>
                        i === index ? { ...row, quantity: e.target.value } : row,
                      ),
                    )
                  }
                  className={inputCls}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Price (USD)
                <input
                  required
                  inputMode="decimal"
                  value={item.price}
                  onChange={(e) =>
                    setItems((current) =>
                      current.map((row, i) =>
                        i === index ? { ...row, price: e.target.value } : row,
                      ),
                    )
                  }
                  className={inputCls}
                  placeholder="1250.00"
                />
              </label>
              <button
                type="button"
                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                className="min-h-11 rounded-lg border border-border px-3 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setItems((current) => [...current, { description: "", quantity: "1", price: "0.00" }])
            }
            className="min-h-11 rounded-lg border border-border px-3 text-sm"
          >
            + Add priced item
          </button>
          {items.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Template total:{" "}
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                items.reduce(
                  (sum, item) =>
                    sum + Number(item.quantity || 0) * (moneyInputToCents(item.price) ?? 0),
                  0,
                ) / 100,
              )}
            </p>
          )}
        </div>
      ) : kind === "form" ? (
        <textarea
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
          placeholder={"One question per line"}
          className="min-h-32 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
        />
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Approved contract wording"
          className="min-h-40 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
        />
      )}
      <button
        type="submit"
        disabled={save.isPending}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {template ? `Save as version ${template.version + 1}` : "Create template"}
      </button>
    </form>
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
