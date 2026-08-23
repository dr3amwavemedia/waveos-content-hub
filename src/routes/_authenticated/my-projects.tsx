import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Circle, ExternalLink, FolderKanban, Loader2 } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/section";
import { useWorkspace } from "@/components/app/workspace-context";
import { useClientProjects } from "@/hooks/use-client-projects";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/my-projects")({
  head: () => ({
    meta: [
      { title: "Your Projects | WaveOS" },
      {
        name: "description",
        content:
          "Track the Dream Wave Media projects shared with your account: status, milestones, updates, and approved references.",
      },
      { property: "og:title", content: "Your Projects | WaveOS" },
      {
        property: "og:description",
        content: "Project status, milestones, and updates shared with your Dream Wave account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MyProjectsPage,
});

const STATUS_LABELS: Record<string, string> = {
  draft: "Getting started",
  planning: "Planning",
  in_progress: "In progress",
  review: "In review",
  complete: "Complete",
};

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function MyProjectsPage() {
  const { activeWorkspace } = useWorkspace();
  const { data, isLoading } = useClientProjects(activeWorkspace?.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const projects = data?.projects ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Your Projects</h1>
        <p className="text-sm text-muted-foreground">
          Everything your Dream Wave team has shared with you — progress, dates, and updates.
        </p>
      </header>

      {!projects.length ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects shared yet"
          body="When your Dream Wave team publishes a project to your account, it will appear here with milestones and updates."
          action={{ label: "Back to overview", to: "/home" }}
        />
      ) : (
        <div className="space-y-8">
          {projects.map((project) => {
            const milestones = (data?.milestones ?? []).filter((m) => m.project_id === project.id);
            const notes = (data?.notes ?? []).filter((n) => n.project_id === project.id);
            const references = (data?.references ?? []).filter((r) => r.project_id === project.id);
            const done = milestones.filter((m) => m.status === "done").length;
            const dates = [
              ["Starts", formatDate(project.start_date)],
              ["Event", formatDate(project.event_date)],
              ["Wraps", formatDate(project.end_date)],
            ].filter(([, value]) => Boolean(value)) as [string, string][];

            return (
              <Section
                key={project.id}
                title={project.name}
                subtitle={project.description ?? undefined}
              >
                <div className="surface-card space-y-5 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
                      {STATUS_LABELS[project.status] ?? project.status}
                    </span>
                    {dates.map(([label, value]) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1 text-xs text-muted-foreground"
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                        {label} {value}
                      </span>
                    ))}
                    {milestones.length > 0 && (
                      <span className="rounded-full border border-border bg-elevated px-3 py-1 text-xs text-muted-foreground">
                        {done}/{milestones.length} milestones complete
                      </span>
                    )}
                  </div>

                  {milestones.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Milestones
                      </div>
                      <ul className="space-y-2">
                        {milestones.map((milestone) => {
                          const complete = milestone.status === "done";
                          const due = formatDate(milestone.due_at);
                          return (
                            <li
                              key={milestone.id}
                              className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-elevated p-3"
                            >
                              {complete ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              ) : (
                                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div
                                  className={cn(
                                    "text-sm font-medium text-foreground",
                                    complete && "text-muted-foreground line-through",
                                  )}
                                >
                                  {milestone.title}
                                </div>
                                {milestone.description && (
                                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                                    {milestone.description}
                                  </p>
                                )}
                              </div>
                              {due && (
                                <span className="text-xs text-muted-foreground">Due {due}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {notes.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Updates
                      </div>
                      <ul className="space-y-2">
                        {notes.map((note) => (
                          <li
                            key={note.id}
                            className="rounded-xl border border-border bg-elevated p-3 text-sm text-foreground"
                          >
                            <p className="whitespace-pre-wrap break-words">{note.body}</p>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(note.created_at)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {references.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Shared links
                      </div>
                      <ul className="flex flex-wrap gap-2">
                        {references.map((reference) => (
                          <li key={reference.id}>
                            <a
                              href={reference.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-2"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {reference.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Section>
            );
          })}
        </div>
      )}
    </div>
  );
}
