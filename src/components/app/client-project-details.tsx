import { CalendarDays, CheckCircle2, Circle, ExternalLink, MessageSquareWarning } from "lucide-react";

import { PortalReturnHint } from "@/components/app/portal-return-hint";
import type {
  ClientProjectChangeRequest,
  ClientProjectMilestone,
  ClientProjectNote,
  ClientProjectReference,
} from "@/hooks/use-client-projects";
import { cn } from "@/lib/utils";

export function formatProjectDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Shared client-facing project detail body: milestones, updates, approved
// links, and requested changes. Used by the home "Upcoming shoot" spotlight
// and the /my-projects page so both always stay in sync with what staff type
// into the Projects tab.
export function ClientProjectDetails({
  milestones,
  notes,
  references,
  changeRequests,
}: {
  milestones: ClientProjectMilestone[];
  notes: ClientProjectNote[];
  references: ClientProjectReference[];
  changeRequests: ClientProjectChangeRequest[];
}) {
  const isEmpty =
    !milestones.length && !notes.length && !references.length && !changeRequests.length;

  if (isEmpty) {
    return (
      <p className="text-sm text-muted-foreground">
        Your Dream Wave team hasn't added details yet — check back soon.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {milestones.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Milestones
          </div>
          <ul className="space-y-2">
            {milestones.map((milestone) => {
              const complete = milestone.status === "done";
              const due = formatProjectDate(milestone.due_at);
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
                  {due && <span className="text-xs text-muted-foreground">Due {due}</span>}
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
                  {formatProjectDate(note.created_at)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {changeRequests.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Requested changes
          </div>
          <ul className="space-y-2">
            {changeRequests.map((request) => (
              <li
                key={request.id}
                className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3"
              >
                <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{request.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    We're on it — updated {formatProjectDate(request.updated_at) ?? "recently"}
                  </div>
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
          <PortalReturnHint />
        </div>
      )}
    </div>
  );
}

export function ProjectDateChips({
  startDate,
  eventDate,
  endDate,
}: {
  startDate: string | null;
  eventDate: string | null;
  endDate: string | null;
}) {
  const dates = (
    [
      ["Starts", formatProjectDate(startDate)],
      ["Event", formatProjectDate(eventDate)],
      ["Wraps", formatProjectDate(endDate)],
    ] as [string, string | null][]
  ).filter(([, value]) => Boolean(value)) as [string, string][];

  if (!dates.length) return null;
  return (
    <>
      {dates.map(([label, value]) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1 text-xs text-muted-foreground"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {label} {value}
        </span>
      ))}
    </>
  );
}
