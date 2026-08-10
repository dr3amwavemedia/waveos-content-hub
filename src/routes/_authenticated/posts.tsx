import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, CalendarClock, CheckCircle2, FileText, PenSquare } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { useWorkspace } from "@/components/app/workspace-context";
import {
  PLATFORM_LABEL,
  useContentItems,
  usePublishAttempts,
  type ContentStatus,
  type SocialPlatform,
} from "@/hooks/use-content";
import { cn } from "@/lib/utils";
import { formatInTimeZone } from "@/lib/date-time";

type PostsFilter = "all" | "draft" | "scheduled" | "published" | "failed";

export const Route = createFileRoute("/_authenticated/posts")({
  validateSearch: (search: Record<string, unknown>): { status?: PostsFilter } => {
    const allowed: PostsFilter[] = ["all", "draft", "scheduled", "published", "failed"];
    return typeof search.status === "string" && allowed.includes(search.status as PostsFilter)
      ? { status: search.status as PostsFilter }
      : {};
  },
  component: PostsPage,
  head: () => ({ meta: [{ title: "Posts — WaveOS" }, { name: "robots", content: "noindex" }] }),
});

const FILTERS: Array<{ value: PostsFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed" },
];

function PostsPage() {
  const { activeWorkspace } = useWorkspace();
  const search = Route.useSearch();
  const selected = search.status ?? "all";
  const statuses = selected === "all" ? undefined : [selected as ContentStatus];
  const items = useContentItems(activeWorkspace?.id ?? null, statuses);
  const attempts = usePublishAttempts((items.data ?? []).map((item) => item.id));
  const attemptsByItem = new Map<string, NonNullable<typeof attempts.data>>();
  for (const attempt of attempts.data ?? []) {
    const current = attemptsByItem.get(attempt.content_item_id) ?? [];
    current.push(attempt);
    attemptsByItem.set(attempt.content_item_id, current);
  }

  if (!activeWorkspace) {
    return <EmptyState icon={FileText} title="No workspace" body="Select a workspace to see its posts." />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Content</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Posts</h1>
          <p className="mt-1 text-sm text-muted-foreground">Open drafts and check every network's publishing result.</p>
        </div>
        <Link to="/create" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          <PenSquare className="h-4 w-4" /> Create post
        </Link>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Filter posts">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            to="/posts"
            search={filter.value === "all" ? {} : { status: filter.value }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              selected === filter.value
                ? "border-primary/40 bg-primary/15 text-foreground"
                : "border-border bg-elevated text-muted-foreground hover:text-foreground",
            )}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {items.isLoading ? (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">Loading posts…</div>
      ) : (items.data ?? []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title={selected === "draft" ? "No saved drafts" : "No posts here"}
          body={selected === "draft" ? "Saved drafts will appear here so you can reopen them anytime." : "Try another status or create a post."}
          action={{ label: "Create post", to: "/create" }}
        />
      ) : (
        <div className="space-y-3">
          {(items.data ?? []).map((item) => {
            const itemAttempts = attemptsByItem.get(item.id) ?? [];
            return (
              <article key={item.id} className="surface-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-foreground">{item.title || "Untitled post"}</h2>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.primary_caption || "No caption yet."}</p>
                    {item.scheduled_at && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatInTimeZone(item.scheduled_at, activeWorkspace.timezone, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })} {activeWorkspace.timezone}
                      </p>
                    )}
                  </div>
                  <Link to="/create" search={{ id: item.id }} className="rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:bg-elevated">
                    {item.status === "draft" ? "Edit draft" : "View post"}
                  </Link>
                </div>

                {itemAttempts.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Publishing results</p>
                    <div className="flex flex-wrap gap-2">
                      {itemAttempts.map((attempt) => (
                        <span
                          key={attempt.id}
                          title={attempt.error_message ?? undefined}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1",
                            attempt.status === "success"
                              ? "bg-success/10 text-success ring-success/25"
                              : attempt.status === "failed"
                                ? "bg-destructive/10 text-destructive ring-destructive/25"
                                : "bg-muted/20 text-muted-foreground ring-border",
                          )}
                        >
                          {attempt.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : attempt.status === "failed" ? <AlertCircle className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
                          {PLATFORM_LABEL[attempt.platform as SocialPlatform]}: {attempt.status}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ContentStatus }) {
  return (
    <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground ring-1 ring-border">
      {status.replace("_", " ")}
    </span>
  );
}
