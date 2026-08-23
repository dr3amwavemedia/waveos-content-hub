import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

import { ClientProjectDetails, ProjectDateChips } from "@/components/app/client-project-details";
import { useWorkspace } from "@/components/app/workspace-context";
import { useClientProjects, type ClientProject } from "@/hooks/use-client-projects";
import { usePermissions } from "@/hooks/use-permissions";
import { formatProjectDate, projectDateToLocalDate } from "@/lib/date-time";
import { cn } from "@/lib/utils";

function daysUntil(value: string) {
  const target = projectDateToLocalDate(value);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  ).getTime();
  return Math.round((startOfTarget - startOfToday) / 86_400_000);
}

function pickSpotlightProject(projects: ClientProject[]) {
  const upcoming = projects
    .filter((p) => p.event_date && (daysUntil(p.event_date) ?? -1) >= 0)
    .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
  return upcoming[0] ?? projects[0] ?? null;
}

// Client home spotlight: surfaces the next shoot (or latest shared project)
// and expands in place to the full milestone/update/link detail staff manage
// from the Projects tab. Hidden for staff — they already have /projects.
export function UpcomingShootPanel() {
  const { isStaff, isLoading: permsLoading } = usePermissions();
  const { activeWorkspace } = useWorkspace();
  const enabled = !permsLoading && !isStaff && !!activeWorkspace?.id;
  const { data, isLoading } = useClientProjects(activeWorkspace?.id, enabled);
  const [expanded, setExpanded] = useState(false);

  const project = useMemo(() => pickSpotlightProject(data?.projects ?? []), [data?.projects]);

  if (permsLoading || isStaff || isLoading || !project) return null;

  const countdown = project.event_date ? daysUntil(project.event_date) : null;
  const milestones = (data?.milestones ?? []).filter((m) => m.project_id === project.id);
  const notes = (data?.notes ?? []).filter((n) => n.project_id === project.id);
  const references = (data?.references ?? []).filter((r) => r.project_id === project.id);
  const changeRequests = data?.changeRequests ?? [];

  const headline =
    countdown != null && countdown >= 0
      ? countdown === 0
        ? "Your shoot is today!"
        : countdown === 1
          ? "Your shoot is tomorrow!"
          : `Your shoot is in ${countdown} days.`
      : "Your project is underway.";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card shadow-[var(--shadow-glow)]">
      <div className="pointer-events-none absolute -left-14 -top-20 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="relative flex w-full flex-col gap-4 p-5 text-left sm:p-7"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Camera className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              {countdown != null && countdown >= 0 ? "Upcoming shoot" : "Your project"}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            {expanded ? (
              <>
                Hide details <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                View details <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </span>
        </div>

        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {headline}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">{project.name}</span>
            {project.event_date && countdown != null && countdown >= 0
              ? ` · ${formatProjectDate(project.event_date)}`
              : ""}
            {project.description ? ` — ${project.description}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ProjectDateChips
              startDate={project.start_date}
              eventDate={project.event_date}
              endDate={project.end_date}
            />
            {milestones.length > 0 && (
              <span className="rounded-full border border-border bg-elevated px-3 py-1 text-xs text-muted-foreground">
                {milestones.filter((m) => m.status === "done").length}/{milestones.length}{" "}
                milestones complete
              </span>
            )}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Tap to {expanded ? "collapse" : "see milestones, updates, and shared links"} —
            everything your Dream Wave team has planned for you.
          </p>
        </div>
      </button>

      <div
        aria-hidden={!expanded}
        className={cn(
          "relative grid transition-all duration-300",
          expanded ? "grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border/60 px-5 pb-5 pt-4 sm:px-7 sm:pb-7">
            <ClientProjectDetails
              milestones={milestones}
              notes={notes}
              references={references}
              changeRequests={changeRequests}
              serviceRequests={data?.serviceRequests ?? []}
              workspaceId={activeWorkspace?.id ?? undefined}
            />
            <Link
              to="/my-projects"
              className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
            >
              See all your projects
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
