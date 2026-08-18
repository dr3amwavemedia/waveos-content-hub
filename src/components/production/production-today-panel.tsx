import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Save,
  SquareCheckBig,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Snapshot = {
  businessName?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  primaryContact?: { name?: string; phone?: string | null; email?: string | null } | null;
};
type Project = {
  id: string;
  title: string;
  scheduled_at: string | null;
  location: string | null;
  status: string;
  client_snapshot: Snapshot;
  checked_in_at: string | null;
  checked_out_at: string | null;
  production_notes: string | null;
};
type ChecklistItem = {
  id: string;
  project_id: string;
  label: string;
  completed_at: string | null;
  sort_order: number;
};
const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ error: Error | null }>;
};

export function ProductionTodayPanel() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const range = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    return { start: start.toISOString(), end: end.toISOString() };
  }, []);

  const projectsQ = useQuery({
    queryKey: ["production", "today", range.start],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await db
        .from("production_projects")
        .select(
          "id,title,scheduled_at,location,status,client_snapshot,checked_in_at,checked_out_at,production_notes",
        )
        .gte("scheduled_at", range.start)
        .lt("scheduled_at", range.end)
        .neq("status", "complete")
        .order("scheduled_at")
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });
  const selected =
    projectsQ.data?.find((project) => project.id === selectedId) ?? projectsQ.data?.[0];

  useEffect(() => {
    if (!selected?.id) return;
    setSelectedId(selected.id);
    setNotes(selected.production_notes ?? "");
    void db.rpc("ensure_production_checklist", { _project_id: selected.id }).then(({ error }) => {
      if (!error)
        void qc.invalidateQueries({ queryKey: ["production", "shoot-checklist", selected.id] });
    });
  }, [selected?.id, selected?.production_notes, qc]);

  const checklistQ = useQuery({
    queryKey: ["production", "shoot-checklist", selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: async (): Promise<ChecklistItem[]> => {
      const { data, error } = await db
        .from("production_checklist_items")
        .select("id,project_id,label,completed_at,sort_order")
        .eq("project_id", selected!.id)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateProject = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data: auth } = await supabase.auth.getUser();
      const auditValues = values.checked_in_at
        ? { ...values, checked_in_by: auth.user?.id }
        : values.checked_out_at
          ? { ...values, checked_out_by: auth.user?.id }
          : values;
      const { error } = await db
        .from("production_projects")
        .update(auditValues)
        .eq("id", selected!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update shoot."),
  });
  const toggleItem = useMutation({
    mutationFn: async (item: ChecklistItem) => {
      const { data: auth } = await supabase.auth.getUser();
      const done = !item.completed_at;
      const { error } = await db
        .from("production_checklist_items")
        .update({
          completed_at: done ? new Date().toISOString() : null,
          completed_by: done ? auth.user?.id : null,
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["production", "shoot-checklist", selected?.id] }),
  });

  if (projectsQ.isLoading) {
    return (
      <div className="flex min-h-28 items-center justify-center rounded-2xl border border-border bg-surface">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (!selected) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock className="h-5 w-5 text-primary" />
          Today & upcoming
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No incomplete shoots are scheduled in the next 14 days.
        </p>
      </section>
    );
  }

  const contact = selected.client_snapshot?.primaryContact;
  const phone = contact?.phone || selected.client_snapshot?.phone;
  const email = contact?.email || selected.client_snapshot?.email;
  const location = selected.location || selected.client_snapshot?.address;
  const completed = (checklistQ.data ?? []).filter((item) => item.completed_at).length;
  const isToday =
    selected.scheduled_at &&
    new Date(selected.scheduled_at).toDateString() === new Date().toDateString();

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/25 bg-surface shadow-sm">
      <div className="border-b border-border bg-primary/5 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Today & upcoming
            </p>
            <h2 className="mt-1 text-xl font-semibold">{selected.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selected.client_snapshot?.businessName || "Production client"}
            </p>
          </div>
          <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            {isToday ? "Today" : "Upcoming"}
          </span>
        </div>
        {(projectsQ.data?.length ?? 0) > 1 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {projectsQ.data?.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedId(project.id)}
                className={cn(
                  "min-h-11 shrink-0 rounded-xl border px-3 text-left text-xs font-semibold",
                  project.id === selected.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                {project.scheduled_at
                  ? new Date(project.scheduled_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })
                  : "Unscheduled"}{" "}
                · {project.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {selected.scheduled_at && (
            <div className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm">
              <Clock3 className="h-4 w-4 text-primary" />
              {new Date(selected.scheduled_at).toLocaleString()}
            </div>
          )}
          {location && (
            <a
              href={`https://maps.apple.com/?q=${encodeURIComponent(location)}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold"
            >
              <MapPin className="h-4 w-4 text-primary" />
              <span className="min-w-0 flex-1 truncate">Directions</span>
              <Navigation className="h-4 w-4" />
            </a>
          )}
          {phone && (
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`tel:${phone}`}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold"
              >
                <Phone className="h-4 w-4 text-primary" />
                Call
              </a>
              <a
                href={`sms:${phone}`}
                className="flex min-h-12 items-center justify-center rounded-xl border border-border px-3 text-sm font-semibold"
              >
                Text
              </a>
            </div>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold"
            >
              <Mail className="h-4 w-4 text-primary" />
              Email client
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={Boolean(selected.checked_in_at) || updateProject.isPending}
            onClick={() =>
              updateProject.mutate({ checked_in_at: new Date().toISOString(), status: "shooting" })
            }
            className="min-h-14 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {selected.checked_in_at ? "Checked in" : "Check in to shoot"}
          </button>
          <button
            disabled={
              !selected.checked_in_at || Boolean(selected.checked_out_at) || updateProject.isPending
            }
            onClick={() =>
              updateProject.mutate({
                checked_out_at: new Date().toISOString(),
                status: "uploading",
              })
            }
            className="min-h-14 rounded-xl border border-border bg-elevated px-4 text-sm font-semibold disabled:opacity-50"
          >
            {selected.checked_out_at ? "Checked out" : "Finish shoot"}
          </button>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <SquareCheckBig className="h-5 w-5 text-primary" />
              Shared shoot checklist
            </h3>
            <span className="text-xs font-semibold text-muted-foreground">
              {completed}/{checklistQ.data?.length ?? 0}
            </span>
          </div>
          <div className="space-y-2">
            {(checklistQ.data ?? []).map((item) => (
              <button
                key={item.id}
                onClick={() => toggleItem.mutate(item)}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm",
                  item.completed_at
                    ? "border-primary/20 bg-primary/5 text-muted-foreground"
                    : "border-border bg-elevated/40",
                )}
              >
                {item.completed_at ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span className={cn(item.completed_at && "line-through")}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="block space-y-2 text-sm font-semibold">
          Team shoot notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            maxLength={6000}
            placeholder="Access instructions, shot notes, client requests, or upload details…"
            className="w-full rounded-xl border border-border bg-elevated p-3 text-base font-normal outline-none focus:border-primary"
          />
        </label>
        <button
          onClick={() => updateProject.mutate({ production_notes: notes.trim() || null })}
          disabled={updateProject.isPending}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary"
        >
          <Save className="h-4 w-4" />
          Save team notes
        </button>
      </div>
    </section>
  );
}
