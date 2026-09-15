import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileStack, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export type TemplateKind = "invoice" | "contract" | "form";

export type TemplateRow = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  version: number;
  is_active: boolean;
  body: unknown;
};

export function useTemplates(kind: TemplateKind, activeOnly = true) {
  return useQuery({
    queryKey: ["document-templates", kind, activeOnly],
    queryFn: async (): Promise<TemplateRow[]> => {
      let query = supabase
        .from("document_templates")
        .select("id,kind,name,description,version,is_active,body")
        .eq("kind", kind)
        .order("updated_at", { ascending: false });
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });
}

/** Small "Use template" control shared by every document creation flow. */
export function TemplatePicker({
  kind,
  onPick,
  label = "Use template",
}: {
  kind: TemplateKind;
  onPick: (template: TemplateRow) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = useTemplates(kind);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-elevated"
      >
        <FileStack className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-border bg-surface p-2 shadow-xl">
          {q.isLoading ? (
            <Loader2 className="m-3 h-4 w-4 animate-spin text-muted-foreground" />
          ) : (q.data ?? []).length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No {kind} templates yet. Create one in DOCUMENTS.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-auto">
              {q.data!.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(template);
                      setOpen(false);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-elevated"
                  >
                    <span className="font-medium text-foreground">{template.name}</span>
                    <span className="ml-1 text-[10px] text-muted-foreground">v{template.version}</span>
                    {template.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {template.description}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
