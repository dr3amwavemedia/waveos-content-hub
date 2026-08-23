import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban, Loader2 } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/section";
import {
  ClientProjectDetails,
  ProjectDateChips,
} from "@/components/app/client-project-details";
import { useWorkspace } from "@/components/app/workspace-context";
import { useClientProjects } from "@/hooks/use-client-projects";

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
                    <ProjectDateChips
                      startDate={project.start_date}
                      eventDate={project.event_date}
                      endDate={project.end_date}
                    />
                    {milestones.length > 0 && (
                      <span className="rounded-full border border-border bg-elevated px-3 py-1 text-xs text-muted-foreground">
                        {done}/{milestones.length} milestones complete
                      </span>
                    )}
                  </div>

                  <ClientProjectDetails
                    milestones={milestones}
                    notes={notes}
                    references={references}
                    changeRequests={data?.changeRequests ?? []}
                    serviceRequests={data?.serviceRequests ?? []}
                    workspaceId={activeWorkspace?.id ?? undefined}
                  />
                </div>
              </Section>
            );
          })}
        </div>
      )}
    </div>
  );
}
