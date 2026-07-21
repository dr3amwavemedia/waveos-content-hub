import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, PenSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/app/empty-state";
import { useWorkspace } from "@/components/app/workspace-context";
import { useContentItems } from "@/hooks/use-content";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: () => (
    <RequireFeature feature="can_view_calendar_preview" title="Calendar isn't included in your plan">
      <CalendarPage />
    </RequireFeature>
  ),
  head: () => ({ meta: [{ title: "Calendar — WaveOS" }, { name: "robots", content: "noindex" }] }),
});

function CalendarPage() {
  const { activeWorkspace } = useWorkspace();
  const items = useContentItems(activeWorkspace?.id ?? null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const byDate = useMemo(() => {
    const map = new Map<string, NonNullable<typeof items.data>>();
    (items.data ?? []).forEach((it) => {
      if (!it.scheduled_at) return;
      const key = new Date(it.scheduled_at).toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    });
    return map;
  }, [items.data]);

  if (!activeWorkspace) {
    return <EmptyState icon={CalendarIcon} title="No workspace" body="Select a workspace to see its calendar." />;
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Calendar</h1>
          <p className="text-sm text-muted-foreground">All scheduled and published content for {activeWorkspace.name}.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded-lg border border-border bg-elevated p-2 text-muted-foreground hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[160px] text-center text-sm font-semibold text-foreground">{monthName}</div>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded-lg border border-border bg-elevated p-2 text-muted-foreground hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="surface-card overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-border bg-elevated/50 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-2 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, idx) => {
            const key = date ? date.toISOString().slice(0, 10) : `blank-${idx}`;
            const dayItems = date ? byDate.get(key) ?? [] : [];
            const isToday = date && date.toDateString() === new Date().toDateString();
            return (
              <div
                key={key}
                className={cn(
                  "min-h-[104px] border-b border-r border-border p-2 last:border-r-0",
                  !date && "bg-elevated/20",
                )}
              >
                {date && (
                  <div className={cn(
                    "mb-1 text-[11px] font-semibold",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}>
                    {date.getDate()}
                  </div>
                )}
                <div className="space-y-1">
                  {dayItems.map((it) => (
                    <Link
                      key={it.id}
                      to="/create"
                      search={{ id: it.id }}
                      className="block truncate rounded-md bg-primary/15 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-primary/25"
                    >
                      {new Date(it.scheduled_at!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {it.title || "Untitled"}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          to="/create"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <PenSquare className="h-4 w-4" /> Create post
        </Link>
      </div>
    </div>
  );
}
