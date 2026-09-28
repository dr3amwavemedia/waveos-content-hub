import { RequireFeature } from "@/components/app/require-feature";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Palette,
  PenSquare,
  Sparkles,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/app/empty-state";
import { useWorkspace } from "@/components/app/workspace-context";
import { CalendarColorSettings } from "@/components/social/calendar-color-settings";
import { SocialStrategyPlanner } from "@/components/social/social-strategy-planner";
import { useContentItems } from "@/hooks/use-content";
import type { ContentItem } from "@/hooks/use-content";
import { usePermissions } from "@/hooks/use-permissions";
import {
  DEFAULT_CALENDAR_CATEGORIES,
  useCalendarCategories,
  useStrategyItems,
  type SocialStrategyItem,
} from "@/hooks/use-social-planning";
import { dateKeyInTimeZone, formatInTimeZone } from "@/lib/date-time";
import {
  useProductionCalendar,
  type ProductionCalendarItem,
} from "@/hooks/use-production-calendar";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: () => (
    <RequireFeature
      feature="can_view_calendar_preview"
      title="Calendar isn't included in your plan"
    >
      <CalendarPage />
    </RequireFeature>
  ),
  head: () => ({ meta: [{ title: "Calendar — WaveOS" }, { name: "robots", content: "noindex" }] }),
});

function CalendarPage() {
  const { activeWorkspace } = useWorkspace();
  const { can } = usePermissions();
  const items = useContentItems(activeWorkspace?.id ?? null);
  const productions = useProductionCalendar(activeWorkspace?.id ?? null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const canUseSocialPlanner = can("can_connect_socials");
  const strategies = useStrategyItems(
    canUseSocialPlanner ? (activeWorkspace?.id ?? null) : null,
    cursor,
  );
  const strategyRows = strategies.data;
  const categories = useCalendarCategories(activeWorkspace?.id ?? null);
  const [mode, setMode] = useState<"calendar" | "strategy">("calendar");
  const [showColors, setShowColors] = useState(false);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [selectedProduction, setSelectedProduction] = useState<ProductionCalendarItem | null>(null);
  const timeZone = activeWorkspace?.timezone ?? "UTC";

  const byDate = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    (items.data ?? []).forEach((it) => {
      if (!it.scheduled_at) return;
      const key = dateKeyInTimeZone(it.scheduled_at, timeZone);
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    });
    return map;
  }, [items.data, timeZone]);

  const productionsByDate = useMemo(() => {
    const map = new Map<string, ProductionCalendarItem[]>();
    (productions.data ?? []).forEach((production) => {
      const key = dateKeyInTimeZone(production.scheduled_at, timeZone);
      map.set(key, [...(map.get(key) ?? []), production]);
    });
    return map;
  }, [productions.data, timeZone]);

  const strategiesByDate = useMemo(() => {
    const map = new Map<string, SocialStrategyItem[]>();
    (strategyRows ?? []).forEach((strategy) => {
      map.set(strategy.start_date, [...(map.get(strategy.start_date) ?? []), strategy]);
    });
    return map;
  }, [strategyRows]);

  const visibleCategories = categories.data?.length ? categories.data : DEFAULT_CALENDAR_CATEGORIES;
  const category = (key: "content" | "production" | "strategy") =>
    visibleCategories.find((item) => item.category_key === key) ??
    DEFAULT_CALENDAR_CATEGORIES.find((item) => item.category_key === key)!;

  if (!activeWorkspace) {
    return (
      <EmptyState
        icon={CalendarIcon}
        title="No workspace"
        body="Select a workspace to see its calendar."
      />
    );
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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Planning</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            Calendar & strategy
          </h1>
          <p className="text-sm text-muted-foreground">
            Dates, productions and monthly content direction for {activeWorkspace.name}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-surface/60 p-1">
            <button
              type="button"
              onClick={() => setMode("calendar")}
              className={cn(
                "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium",
                mode === "calendar"
                  ? "bg-primary/15 text-foreground ring-1 ring-primary/30"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarIcon className="h-4 w-4" /> Calendar
            </button>
            {canUseSocialPlanner && (
              <button
                type="button"
                onClick={() => setMode("strategy")}
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium",
                  mode === "strategy"
                    ? "bg-violet-400/15 text-foreground ring-1 ring-violet-400/30"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Sparkles className="h-4 w-4" /> Ideas & strategy
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowColors(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm font-medium text-foreground hover:bg-elevated"
          >
            <Palette className="h-4 w-4 text-primary" /> Colors
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/45 p-3">
        <div className="flex flex-wrap gap-2">
          {visibleCategories.map((item) => (
            <span
              key={item.category_key}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background/35 px-3 py-1.5 text-xs text-foreground"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.effective_color }}
                aria-hidden
              />
              {item.name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded-lg border border-border bg-elevated p-2 text-muted-foreground hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[160px] text-center text-sm font-semibold text-foreground">
            {monthName}
          </div>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded-lg border border-border bg-elevated p-2 text-muted-foreground hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {mode === "strategy" && canUseSocialPlanner ? (
        <SocialStrategyPlanner workspaceId={activeWorkspace.id} month={cursor} />
      ) : (
        <>
          <div className="surface-card overflow-hidden p-0">
            <div className="grid grid-cols-7 border-b border-border bg-elevated/50 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-2 py-2 text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, idx) => {
                const key = date
                  ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
                  : `blank-${idx}`;
                const dayItems = date ? (byDate.get(key) ?? []) : [];
                const dayProductions = date ? (productionsByDate.get(key) ?? []) : [];
                const dayStrategies = date ? (strategiesByDate.get(key) ?? []) : [];
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
                      <div
                        className={cn(
                          "mb-1 text-[11px] font-semibold",
                          isToday ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {date.getDate()}
                      </div>
                    )}
                    <div className="space-y-1">
                      {dayItems.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => setSelected(it)}
                          className="block w-full truncate rounded-md border-l-2 px-2 py-1 text-left text-[11px] font-medium text-foreground transition hover:brightness-125"
                          style={eventColorStyle(category("content").effective_color)}
                        >
                          <span className="sr-only">{category("content").name}: </span>
                          {formatInTimeZone(it.scheduled_at!, timeZone, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}{" "}
                          · {it.title || "Untitled"}
                        </button>
                      ))}
                      {dayProductions.map((production) => (
                        <button
                          key={`production-${production.id}`}
                          type="button"
                          onClick={() => setSelectedProduction(production)}
                          className="block w-full truncate rounded-md border-l-2 px-2 py-1 text-left text-[11px] font-medium text-foreground transition hover:brightness-125"
                          style={eventColorStyle(category("production").effective_color)}
                        >
                          <span className="sr-only">{category("production").name}: </span>
                          {formatInTimeZone(production.scheduled_at, timeZone, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}{" "}
                          · {production.title}
                        </button>
                      ))}
                      {dayStrategies.map((strategy) => (
                        <button
                          key={`strategy-${strategy.id}`}
                          type="button"
                          onClick={() => setMode("strategy")}
                          className="block w-full truncate rounded-md border-l-2 px-2 py-1 text-left text-[11px] font-medium text-foreground transition hover:brightness-125"
                          style={eventColorStyle(category("strategy").effective_color)}
                        >
                          <span className="sr-only">{category("strategy").name}: </span>
                          Idea · {strategy.title}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {canUseSocialPlanner && (
            <div className="flex justify-end">
              <Link
                to="/create"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <PenSquare className="h-4 w-4" /> Create post
              </Link>
            </div>
          )}
        </>
      )}

      <CalendarColorSettings
        workspaceId={activeWorkspace.id}
        open={showColors}
        onClose={() => setShowColors(false)}
      />

      {selected?.scheduled_at && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-label="Scheduled post details"
        >
          <div className="surface-card w-full max-w-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Scheduled post
                </p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">
                  {selected.title || "Untitled post"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-elevated hover:text-foreground"
                aria-label="Close details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-primary/25 bg-primary/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-primary" />
                {formatInTimeZone(selected.scheduled_at, timeZone, {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </p>
              <p className="mt-1 pl-6 text-xs text-muted-foreground">Timezone: {timeZone}</p>
            </div>
            {selected.primary_caption && (
              <p className="mt-4 line-clamp-4 text-sm leading-6 text-muted-foreground">
                {selected.primary_caption}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium"
              >
                Close
              </button>
              <Link
                to="/create"
                search={{ id: selected.id }}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Open post
              </Link>
            </div>
          </div>
        </div>
      )}

      {selectedProduction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-label="Assigned production details"
        >
          <div className="surface-card w-full max-w-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">
                  Assigned production
                </p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">
                  {selectedProduction.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduction(null)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-elevated hover:text-foreground"
                aria-label="Close details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-amber-500" />
                {formatInTimeZone(selectedProduction.scheduled_at, timeZone, {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </p>
              <p className="mt-1 pl-6 text-xs text-muted-foreground">Timezone: {timeZone}</p>
            </div>
            {selectedProduction.location && (
              <p className="mt-4 text-sm text-muted-foreground">
                Location: {selectedProduction.location}
              </p>
            )}
            <p className="mt-2 text-sm capitalize text-muted-foreground">
              Status: {selectedProduction.status.replaceAll("_", " ")}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedProduction(null)}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function eventColorStyle(color: string) {
  return {
    borderLeftColor: color,
    backgroundColor: `${color}1f`,
  };
}
