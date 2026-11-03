import type { ContentItem } from "@/hooks/use-content";
import type { ProductionCalendarItem } from "@/hooks/use-production-calendar";
import type { WorkspaceSummary } from "@/hooks/use-waveos";

export type OceanTimelineKind = "content" | "shoot" | "approval" | "publishing";

export type OceanTimelineItem = {
  id: string;
  kind: OceanTimelineKind;
  title: string;
  status: string;
  at: string;
  to: "/create" | "/videographer" | "/approvals" | "/calendar";
};

const ACTIVE_CONTENT_STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "publishing",
];

function sameLocalDay(value: string | null | undefined, now: Date) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toDateString() === now.toDateString();
}

function contentTimelineKind(item: ContentItem): OceanTimelineKind {
  if (item.status === "in_review" || item.status === "changes_requested") return "approval";
  if (item.status === "scheduled" || item.status === "publishing") return "publishing";
  return "content";
}

export function oceanWorkload(
  content: ContentItem[],
  shoots: ProductionCalendarItem[],
  now = new Date(),
) {
  return {
    content: content.filter((item) => ACTIVE_CONTENT_STATUSES.includes(item.status)).length,
    shoots: shoots.filter((item) => sameLocalDay(item.scheduled_at, now)).length,
    approvals: content.filter((item) => ["in_review", "changes_requested"].includes(item.status))
      .length,
    publishing: content.filter((item) => ["scheduled", "publishing"].includes(item.status)).length,
  };
}

export function buildOceanTimeline(
  content: ContentItem[],
  shoots: ProductionCalendarItem[],
  now = new Date(),
): OceanTimelineItem[] {
  const contentRows = content.flatMap((item): OceanTimelineItem[] => {
    if (!ACTIVE_CONTENT_STATUSES.includes(item.status)) return [];
    const kind = contentTimelineKind(item);
    const eventAt = kind === "publishing" ? item.scheduled_at : item.updated_at;
    if (!sameLocalDay(eventAt, now) || !eventAt) return [];
    return [
      {
        id: `content:${item.id}`,
        kind,
        title: item.title?.trim() || "Untitled content",
        status: item.status.replaceAll("_", " "),
        at: eventAt,
        to: kind === "approval" ? "/approvals" : kind === "publishing" ? "/calendar" : "/create",
      },
    ];
  });
  const shootRows = shoots.flatMap((shoot): OceanTimelineItem[] =>
    sameLocalDay(shoot.scheduled_at, now)
      ? [
          {
            id: `shoot:${shoot.id}`,
            kind: "shoot",
            title: shoot.title,
            status: shoot.status.replaceAll("_", " "),
            at: shoot.scheduled_at,
            to: "/videographer",
          },
        ]
      : [],
  );
  return [...contentRows, ...shootRows]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(0, 6);
}

export function authorizedPortfolio(
  workspaces: WorkspaceSummary[],
  activeWorkspaceId: string | undefined,
) {
  return [...workspaces]
    .sort((a, b) => {
      if (a.id === activeWorkspaceId) return -1;
      if (b.id === activeWorkspaceId) return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 5);
}

export function formatObservedMetric(value: number | null | undefined, loading: boolean) {
  if (loading) return "…";
  if (value === null || value === undefined) return "Unavailable";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}
