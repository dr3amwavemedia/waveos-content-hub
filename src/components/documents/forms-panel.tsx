import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { TemplatePicker, type TemplateRow } from "./template-picker";

type FormRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  version: number;
  published_at: string | null;
  due_at: string | null;
  fields: unknown;
  template_id: string | null;
};

type FieldDef = { label: string; type: "text" | "long_text" | "date" | "yes_no" };

function parseFields(value: unknown): FieldDef[] {
  if (!Array.isArray(value)) return [];
  return value.filter((f): f is FieldDef => !!f && typeof (f as FieldDef).label === "string");
}

const inputCls =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

/**
 * Client forms for one workspace. Drafts stay admin-only; "Send form" is the
 * explicit publish action that makes the form visible in the client portal.
 * The workspace assignment always comes from the selected client, never from a
 * template default or a typed name.
 */
export function FormsPanel({
  workspaceId,
  clientName,
}: {
  workspaceId: string;
  clientName: string;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [fields, setFields] = useState<FieldDef[]>([{ label: "", type: "text" }]);

  const q = useQuery({
    queryKey: ["client-forms", workspaceId],
    queryFn: async (): Promise<FormRow[]> => {
      const { data, error } = await supabase
        .from("client_forms")
        .select("id,title,description,status,version,published_at,due_at,fields,template_id")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FormRow[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["client-forms", workspaceId] });

  const reset = () => {
    setCreating(false);
    setTitle("");
    setDescription("");
    setDueAt("");
    setFields([{ label: "", type: "text" }]);
  };

  const create = useMutation({
    mutationFn: async () => {
      const clean = fields.filter((f) => f.label.trim());
      if (!title.trim()) throw new Error("Give the form a title.");
      if (!clean.length) throw new Error("Add at least one question.");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("client_forms").insert({
        // Bound to the selected client's immutable workspace id.
        workspace_id: workspaceId,
        title: title.trim(),
        description: description.trim() || null,
        due_at: dueAt ? `${dueAt}T12:00:00.000Z` : null,
        fields: clean as never,
        status: "draft",
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      reset();
      await refresh();
      toast.success("Draft form saved. It is not visible to the client yet.");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save the form.")),
  });

  const publish = useMutation({
    mutationFn: async (form: FormRow) => {
      const { error } = await supabase
        .from("client_forms")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", form.id)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Form sent to the client portal. No email was sent in test mode.");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not send the form.")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_forms")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Form removed.");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not remove the form.")),
  });

  const applyTemplate = (template: TemplateRow) => {
    const body = (template.body ?? {}) as { title?: string; description?: string; fields?: unknown };
    setTitle(body.title ?? template.name);
    setDescription(body.description ?? template.description ?? "");
    const parsed = parseFields(body.fields);
    setFields(parsed.length ? parsed : [{ label: "", type: "text" }]);
    setCreating(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Questionnaires for {clientName}. Drafts stay private until you send them.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => (creating ? reset() : setCreating(true))}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {creating ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {creating ? "Cancel" : "New form"}
          </button>
          <TemplatePicker kind="form" onPick={applyTemplate} label="Use template" />
        </div>
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4"
        >
          <p className="text-[11px] text-muted-foreground">
            Assigned to <span className="font-medium text-foreground">{clientName}</span> — this
            assignment is fixed when the draft is saved.
          </p>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Form title"
            className={inputCls}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short intro for the client (optional)"
            className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
          />
          <label className="block text-xs text-muted-foreground">
            Due date (optional)
            <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={cn(inputCls, "mt-1")} />
          </label>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={field.label}
                  onChange={(e) =>
                    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, label: e.target.value } : f)))
                  }
                  placeholder={`Question ${index + 1}`}
                  className={inputCls}
                />
                <select
                  value={field.type}
                  onChange={(e) =>
                    setFields((prev) =>
                      prev.map((f, i) => (i === index ? { ...f, type: e.target.value as FieldDef["type"] } : f)),
                    )
                  }
                  className="min-h-11 rounded-lg border border-border bg-background px-2 text-sm"
                >
                  <option value="text">Short answer</option>
                  <option value="long_text">Long answer</option>
                  <option value="date">Date</option>
                  <option value="yes_no">Yes / no</option>
                </select>
                <button
                  type="button"
                  onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded-md p-2 text-destructive hover:bg-destructive/15"
                  aria-label="Remove question"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFields((prev) => [...prev, { label: "", type: "text" }])}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"
            >
              <Plus className="h-3.5 w-3.5" /> Add question
            </button>
          </div>
          <button
            type="submit"
            disabled={create.isPending}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create without sending
          </button>
        </form>
      )}

      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No forms yet.</p>
      ) : (
        <ul className="space-y-2">
          {q.data!.map((form) => (
            <li
              key={form.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{form.title}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1",
                      form.published_at
                        ? "bg-success/15 text-success ring-success/30"
                        : "bg-elevated text-muted-foreground ring-border",
                    )}
                  >
                    {form.published_at ? "sent" : "draft"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">v{form.version}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {parseFields(form.fields).length} question(s)
                  {form.due_at ? ` · due ${new Date(form.due_at).toLocaleDateString()}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!form.published_at && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          `Send "${form.title}" to ${clientName}? It becomes visible in their portal.`,
                        )
                      )
                        publish.mutate(form);
                    }}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                  >
                    <Send className="h-3.5 w-3.5" /> Send form
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => confirm("Remove this form?") && remove.mutate(form.id)}
                  className="rounded-md p-1.5 text-destructive hover:bg-destructive/15"
                  aria-label="Remove form"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
