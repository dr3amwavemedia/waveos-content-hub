import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, FileText, Loader2, PenSquare, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

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
import { refreshPublishAttemptDetails } from "@/lib/publish.functions";
import type { Database } from "@/integrations/supabase/types";

type PostsFilter = "all" | "draft" | "scheduled" | "published" | "failed";
type PublishAttempt = Database["public"]["Tables"]["publish_attempts"]["Row"];

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
  const [selectedFailure, setSelectedFailure] = useState<PublishAttempt | null>(null);
  const [refreshingAttemptId, setRefreshingAttemptId] = useState<string | null>(null);
  const refreshAttempt = useServerFn(refreshPublishAttemptDetails);
  const queryClient = useQueryClient();

  async function handleRefresh(attempt: PublishAttempt) {
    setRefreshingAttemptId(attempt.id);
    try {
      const result = await refreshAttempt({ data: { attemptId: attempt.id } });
      await queryClient.invalidateQueries({ queryKey: ["publish-attempts"] });
      setSelectedFailure(null);
      if (result.status === "failed") {
        toast.error(result.errorMessage || "Ayrshare still has not supplied a detailed Instagram reason.");
      } else {
        toast.success(result.status === "success" ? "Provider now reports this post as published." : "Provider reports that this post is still processing.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh provider details.");
    } finally {
      setRefreshingAttemptId(null);
    }
  }
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
                      {itemAttempts.map((attempt) => {
                        const content = (
                          <>
                            {attempt.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : attempt.status === "failed" ? <AlertCircle className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
                            {PLATFORM_LABEL[attempt.platform as SocialPlatform]}: {attempt.status}
                          </>
                        );
                        const classes = cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1",
                          attempt.status === "success"
                            ? "bg-success/10 text-success ring-success/25"
                            : attempt.status === "failed"
                              ? "bg-destructive/10 text-destructive ring-destructive/25"
                              : "bg-muted/20 text-muted-foreground ring-border",
                        );
                        return attempt.status === "failed" ? (
                          <button
                            key={attempt.id}
                            type="button"
                            onClick={() => setSelectedFailure(attempt)}
                            className={cn(classes, "cursor-pointer transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive")}
                            aria-label={`View ${PLATFORM_LABEL[attempt.platform as SocialPlatform]} publishing error`}
                          >
                            {content}
                          </button>
                        ) : (
                          <span key={attempt.id} className={classes}>{content}</span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {selectedFailure && (
        <FailureDetails
          attempt={selectedFailure}
          timeZone={activeWorkspace.timezone}
          onClose={() => setSelectedFailure(null)}
          onRefresh={() => handleRefresh(selectedFailure)}
          isRefreshing={refreshingAttemptId === selectedFailure.id}
        />
      )}
    </div>
  );
}

function FailureDetails({
  attempt,
  timeZone,
  onClose,
  onRefresh,
  isRefreshing,
}: {
  attempt: PublishAttempt;
  timeZone: string;
  onClose: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const platform = PLATFORM_LABEL[attempt.platform as SocialPlatform];
  const guidance = failureGuidance(attempt.error_message, platform);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-error-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="surface-card w-full max-w-lg p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Publishing failed</p>
            <h2 id="publish-error-title" className="mt-1 text-xl font-semibold text-foreground">{platform}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-elevated hover:text-foreground" aria-label="Close publishing error">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Provider response</p>
          <p className="mt-2 break-words text-sm leading-6 text-foreground">
            {attempt.error_message || "The publishing provider did not return a detailed error message."}
          </p>
          {attempt.error_code && <p className="mt-2 text-xs text-muted-foreground">Error code: {attempt.error_code}</p>}
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold text-foreground">What to check</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{guidance}</p>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Attempted {formatInTimeZone(attempt.attempted_at, timeZone, { dateStyle: "medium", timeStyle: "short" })} {timeZone}
        </p>
        {attempt.ayrshare_post_id && (
          <p className="mt-1 break-all text-xs text-muted-foreground">Provider reference: {attempt.ayrshare_post_id}</p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh provider details
          </button>
          <Link to="/social-accounts" className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-elevated">Check social account</Link>
          <Link to="/create" search={{ id: attempt.content_item_id }} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Open and retry post</Link>
        </div>
      </div>
    </div>
  );
}

function failureGuidance(message: string | null, platform: string) {
  const error = (message ?? "").toLowerCase();
  if (/connect|account|profile|authorization|authori[sz]ed|token|permission/.test(error)) {
    return `Reconnect ${platform} under Social Accounts, confirm the correct profile is selected, then reopen this post and publish it again.`;
  }
  if (/media|image|video|aspect|ratio|duration|size|format|resolution/.test(error)) {
    return `Review ${platform}'s media requirements. Adjust the file format, dimensions, duration, or size, then reopen this post and retry.`;
  }
  if (/caption|text|character|hashtag|mention/.test(error)) {
    return `Review the ${platform} caption for unsupported mentions, hashtags, links, or length, then retry the post.`;
  }
  return `Confirm ${platform} is connected and permitted to publish, review the provider response above, then reopen this post and retry. Networks that already succeeded will not be posted twice.`;
}

function StatusBadge({ status }: { status: ContentStatus }) {
  return (
    <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground ring-1 ring-border">
      {status.replace("_", " ")}
    </span>
  );
}
