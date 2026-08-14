import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Images,
  Map,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { useCurrentUser } from "@/hooks/use-waveos";
import { cn } from "@/lib/utils";
import { ProductionProjectsPanel } from "@/components/production/production-projects-panel";

export const Route = createFileRoute("/_authenticated/videographer")({
  component: VideographerDashboard,
});

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

type StoryBeat = {
  id: string;
  title: string;
  note: string;
};

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "brief", label: "Review creative brief and shot list", done: false },
  { id: "gear", label: "Pack cameras, lenses, audio, lights, and media", done: false },
  { id: "batteries", label: "Charge batteries and format cards", done: false },
  { id: "location", label: "Confirm location, access, parking, and contact", done: false },
  { id: "release", label: "Confirm releases and client approval", done: false },
  { id: "backup", label: "Back up footage before leaving the shoot", done: false },
];

const DEFAULT_STORYBOARD: StoryBeat[] = [
  { id: "opening", title: "Opening", note: "Establish the location and mood." },
  { id: "story", title: "Story", note: "Capture the main action and key details." },
  { id: "proof", title: "Hero moments", note: "Get the strongest wide, medium, and close shots." },
  { id: "closing", title: "Closing", note: "Finish with the CTA, logo, or final reveal." },
];

function VideographerDashboard() {
  const { data: user, isLoading } = useCurrentUser();
  const canUseDashboard = Boolean(user?.isDreamWaveOwner || user?.staffType === "media_manager");
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [storyboard, setStoryboard] = useState(DEFAULT_STORYBOARD);
  const [newItem, setNewItem] = useState("");
  const [newBeat, setNewBeat] = useState("");
  const [dashboardLoaded, setDashboardLoaded] = useState(false);
  const dashboardStorageKey = `waveos.videographer-dashboard.v1.${user?.userId ?? "loading"}`;

  useEffect(() => {
    if (!user?.userId) return;
    setDashboardLoaded(false);
    try {
      const saved = window.localStorage.getItem(dashboardStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          checklist?: ChecklistItem[];
          storyboard?: StoryBeat[];
        };
        if (Array.isArray(parsed.checklist)) setChecklist(parsed.checklist);
        if (Array.isArray(parsed.storyboard)) setStoryboard(parsed.storyboard);
      }
    } catch {
      // Keep the safe defaults when saved dashboard data cannot be read.
    } finally {
      setDashboardLoaded(true);
    }
  }, [dashboardStorageKey, user?.userId]);

  useEffect(() => {
    if (!user?.userId || !dashboardLoaded) return;
    window.localStorage.setItem(dashboardStorageKey, JSON.stringify({ checklist, storyboard }));
  }, [checklist, storyboard, dashboardLoaded, dashboardStorageKey, user?.userId]);

  const completed = checklist.filter((item) => item.done).length;
  const progress = checklist.length ? Math.round((completed / checklist.length) * 100) : 0;
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    [],
  );

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading production dashboard…</div>;
  }

  if (!canUseDashboard) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-8 text-center">
        <Camera className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Production dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This workspace is available to Dream Wave admins and media staff.
        </p>
      </div>
    );
  }

  function toggleChecklist(id: string) {
    setChecklist((current) =>
      current.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    );
  }

  function addChecklistItem() {
    const label = newItem.trim();
    if (!label) return;
    setChecklist((current) => [
      ...current,
      { id: crypto.randomUUID(), label, done: false },
    ]);
    setNewItem("");
  }

  function addStoryBeat() {
    const title = newBeat.trim();
    if (!title) return;
    setStoryboard((current) => [
      ...current,
      { id: crypto.randomUUID(), title, note: "Add the shot direction here." },
    ]);
    setNewBeat("");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Camera className="h-4 w-4" />
            Production
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Videographer dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{today} · Your shoot command center</p>
        </div>
        <Link
          to="/calendar"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary"
        >
          <CalendarDays className="h-4 w-4" />
          View full schedule
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction
          to="/content"
          icon={Upload}
          title="Upload content"
          detail="Add photos and footage"
        />
        <QuickAction
          to="/calendar"
          icon={CalendarDays}
          title="Schedule"
          detail="Review shoots and deadlines"
        />
        <QuickAction
          to="/vision-studio"
          icon={Sparkles}
          title="Vision Studio"
          detail="Build the visual direction"
        />
        <QuickAction
          to="/deliveries"
          icon={Images}
          title="Deliverables"
          detail="Review client-ready media"
        />
      </section>

      <ProductionProjectsPanel />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Shoot checklist
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Complete the essentials before wrapping the production.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-foreground">{progress}%</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {completed}/{checklist.length} done
              </div>
            </div>
          </div>
          <div className="h-1 bg-elevated">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="space-y-2 p-5">
            {checklist.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors",
                  item.done
                    ? "border-primary/20 bg-primary/5"
                    : "border-border bg-elevated/40 hover:border-primary/30",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleChecklist(item.id)}
                  className="shrink-0 text-primary"
                  aria-label={item.done ? "Mark incomplete" : "Mark complete"}
                >
                  {item.done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                </button>
                <span className={cn("min-w-0 flex-1 text-sm", item.done && "text-muted-foreground line-through")}>
                  {item.label}
                </span>
                <button
                  type="button"
                  onClick={() => setChecklist((current) => current.filter((entry) => entry.id !== item.id))}
                  className="opacity-0 text-muted-foreground transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label="Remove checklist item"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <input
                value={newItem}
                onChange={(event) => setNewItem(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addChecklistItem()}
                placeholder="Add checklist item"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={addChecklistItem}
                className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Map className="h-5 w-5 text-primary" />
              Storyboard map
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Arrange the shoot from opening frame to final reveal.
            </p>
          </div>
          <div className="space-y-3 p-5">
            {storyboard.map((beat, index) => (
              <div key={beat.id} className="group flex gap-3">
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  {index < storyboard.length - 1 && <span className="mt-1 h-full w-px bg-border" />}
                </div>
                <div className="mb-2 min-w-0 flex-1 rounded-xl border border-border bg-elevated/40 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={beat.title}
                      onChange={(event) =>
                        setStoryboard((current) =>
                          current.map((entry) =>
                            entry.id === beat.id ? { ...entry, title: event.target.value } : entry,
                          ),
                        )
                      }
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setStoryboard((current) => current.filter((entry) => entry.id !== beat.id))}
                      className="opacity-0 text-muted-foreground hover:text-destructive group-hover:opacity-100"
                      aria-label="Remove storyboard beat"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    value={beat.note}
                    rows={2}
                    onChange={(event) =>
                      setStoryboard((current) =>
                        current.map((entry) =>
                          entry.id === beat.id ? { ...entry, note: event.target.value } : entry,
                        ),
                      )
                    }
                    className="mt-1 w-full resize-none bg-transparent text-xs leading-relaxed text-muted-foreground outline-none"
                  />
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input
                value={newBeat}
                onChange={(event) => setNewBeat(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addStoryBeat()}
                placeholder="Add storyboard moment"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={addStoryBeat}
                className="inline-flex items-center gap-1 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-gradient-to-br from-surface to-primary/5 p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Clock3 className="h-5 w-5 text-primary" />
              Ready for the next shoot?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check the calendar, capture the footage, upload it to Content, then prepare the client delivery.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/calendar" className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground">
              Open schedule
            </Link>
            <Link to="/content" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Upload content
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  title,
  detail,
}: {
  to: "/content" | "/calendar" | "/vision-studio" | "/deliveries";
  icon: typeof Camera;
  title: string;
  detail: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
