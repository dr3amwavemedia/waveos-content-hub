import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  ImageOff,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatInTimeZone } from "@/lib/date-time";
import { listLivePosts, removeLivePost } from "@/lib/live-posts.functions";
import {
  finalizePublishedLibrary,
  isLivePostRemoveConfirmation,
  LIVE_POST_REMOVE_CONFIRMATION,
  livePlatformLabel,
  livePostRemoval,
  mergeLivePosts,
  publishedCardState,
  publishedCounts,
  PUBLISHED_STATE_LABEL,
  type LivePost,
} from "@/lib/live-posts";

type PageParam = { page: number; accountIds?: string[] };

export function LivePostsLibrary({
  workspaceId,
  timeZone,
  onOpenAccounts,
}: {
  workspaceId: string;
  timeZone: string;
  onOpenAccounts: () => void;
}) {
  const listFn = useServerFn(listLivePosts);
  const query = useInfiniteQuery({
    queryKey: ["live-posts", workspaceId],
    initialPageParam: { page: 1 } as PageParam,
    queryFn: ({ pageParam }) =>
      listFn({ data: { workspaceId, page: pageParam.page, accountIds: pageParam.accountIds } }),
    getNextPageParam: (last): PageParam | undefined => {
      const more = last.accounts.filter((account) => account.hasMore);
      return more.length
        ? { page: last.page + 1, accountIds: more.map((account) => account.accountId) }
        : undefined;
    },
    staleTime: 60_000,
  });
  const [platform, setPlatform] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Record<string, string>>({});

  const pages = query.data?.pages ?? [];
  const accounts = pages[0]?.accounts ?? [];
  const canManage = pages[0]?.canManage ?? false;
  const errors = pages.flatMap((page) =>
    page.accounts.flatMap((account) => (account.error ? [account.error] : [])),
  );
  const uniqueErrors = [...new Map(errors.map((error) => [error.accountId, error])).values()];
  // Only verified-live cards and intentional removal history; filters,
  // counts and empty states all read this list.
  const posts = useMemo(
    () =>
      finalizePublishedLibrary(
        mergeLivePosts(...pages.map((page) => page.posts)).map((post) =>
          removed[post.key] ? { ...post, removedAt: post.removedAt ?? removed[post.key]! } : post,
        ),
      ),
    [pages, removed],
  );
  const counts = publishedCounts(posts);
  const platforms = [...new Set(accounts.map((account) => account.platform))];
  const visible = posts.filter(
    (post) =>
      (platform === "all" || post.platform === platform) &&
      (accountId === "all" || post.accountId === accountId),
  );
  const selected = selectedKey ? posts.find((post) => post.key === selectedKey) ?? null : null;

  return (
    <section className="space-y-4" aria-labelledby="live-posts-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="live-posts-title" className="text-xl font-semibold text-foreground sm:text-2xl">
            Published posts
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Posts your connected accounts confirm are live, including ones made directly on each
            platform.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-elevated disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
          {query.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {accounts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filter by platform"
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
          >
            <option value="all">All platforms</option>
            {platforms.map((value) => (
              <option key={value} value={value}>
                {livePlatformLabel(value)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by account"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="min-h-10 max-w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
          >
            <option value="all">All accounts</option>
            {accounts.map((account) => (
              <option key={account.accountId} value={account.accountId}>
                {livePlatformLabel(account.platform)} · {account.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {uniqueErrors.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Some accounts didn't load. Posts from the other accounts are shown below.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {uniqueErrors.map((error) => (
              <li key={error.accountId}>
                <span className="font-medium text-foreground">{error.name}:</span> {error.message}
              </li>
            ))}
          </ul>
          {uniqueErrors.some((error) => error.reconnect) && (
            <button
              type="button"
              onClick={onOpenAccounts}
              className="mt-3 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-elevated"
            >
              Open Accounts to reconnect
            </button>
          )}
        </div>
      )}

      {query.isLoading ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading published posts from
          your accounts…
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="text-sm font-semibold text-foreground">Couldn't load published posts.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.error instanceof Error ? query.error.message : "Try again in a moment."}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-4 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold"
          >
            Try again
          </button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface/60 p-8 text-center">
          <p className="text-sm font-semibold text-foreground">No connected social accounts yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect an account and its published posts will show up here.
          </p>
          <button
            type="button"
            onClick={onOpenAccounts}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Connect accounts
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface/60 p-8 text-center">
          <p className="text-sm font-semibold text-foreground">No live posts found.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {posts.length
              ? "Nothing matches these filters."
              : "Posts from the last year will appear here. Try Refresh after posting."}
          </p>
        </div>
      ) : (
        <>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {visible.length === posts.length
            ? `${counts.live} live${counts.removed ? ` · ${counts.removed} removed` : ""}`
            : `Showing ${visible.length} of ${posts.length}`}
        </p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((post) => (
            <li key={post.key}>
              <LivePostCard post={post} timeZone={timeZone} onOpen={() => setSelectedKey(post.key)} />
            </li>
          ))}
        </ul>
        </>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2 text-sm font-semibold hover:bg-elevated disabled:opacity-60"
          >
            {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
            Load more
          </button>
        </div>
      )}

      {selected && (
        <LivePostDialog
          post={selected}
          workspaceId={workspaceId}
          timeZone={timeZone}
          canManage={canManage}
          onClose={() => setSelectedKey(null)}
          onRemoved={(key, removedAt) => setRemoved((prev) => ({ ...prev, [key]: removedAt }))}
        />
      )}
    </section>
  );
}

function Thumb({ post, className }: { post: LivePost; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!post.thumbnailUrl || broken) {
    return (
      <div className={cn("flex items-center justify-center bg-elevated text-muted-foreground", className)}>
        {post.mediaType === "text" ? <FileText className="h-6 w-6" /> : <ImageOff className="h-6 w-6" />}
      </div>
    );
  }
  return (
    <img
      src={post.thumbnailUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cn("object-cover", className)}
    />
  );
}

function formatDate(value: string | null, timeZone: string) {
  if (!value) return "Date unavailable";
  return formatInTimeZone(value, timeZone, { dateStyle: "medium" });
}

function LivePostCard({
  post,
  timeZone,
  onOpen,
}: {
  post: LivePost;
  timeZone: string;
  onOpen: () => void;
}) {
  const label = livePlatformLabel(post.platform);
  const state = publishedCardState(post) ?? "removed";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${label} post from ${formatDate(post.publishedAt, timeZone)}`}
      className={cn(
        "group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        state === "removed" && "opacity-60",
      )}
    >
      <div className="relative">
        <Thumb post={post} className="aspect-square w-full" />
        <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-semibold text-foreground backdrop-blur">
          {label}
        </span>
        <span
          className={cn(
            "absolute right-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-semibold backdrop-blur",
            state === "live" ? "text-success" : "text-muted-foreground",
          )}
        >
          {PUBLISHED_STATE_LABEL[state]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm text-foreground">{post.caption || "No caption"}</p>
        <p className="mt-auto truncate text-xs text-muted-foreground">{post.accountName}</p>
        <p className="text-xs text-muted-foreground">{formatDate(post.publishedAt, timeZone)}</p>
      </div>
    </button>
  );
}

function LivePostDialog({
  post,
  workspaceId,
  timeZone,
  canManage,
  onClose,
  onRemoved,
}: {
  post: LivePost;
  workspaceId: string;
  timeZone: string;
  canManage: boolean;
  onClose: () => void;
  onRemoved: (key: string, removedAt: string) => void;
}) {
  const label = livePlatformLabel(post.platform);
  const removeFn = useServerFn(removeLivePost);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [removing, setRemoving] = useState(false);
  const removal = livePostRemoval(post, canManage);
  const state = publishedCardState(post) ?? "removed";

  async function handleRemove() {
    if (removal.kind !== "remove" || !isLivePostRemoveConfirmation(confirmation)) return;
    if (!post.latePostId || !post.platformPostId) return;
    setRemoving(true);
    try {
      const result = await removeFn({
        data: {
          workspaceId,
          accountId: post.accountId,
          platform: post.platform,
          platformPostId: post.platformPostId,
          latePostId: post.latePostId,
          url: post.url,
          confirmation: LIVE_POST_REMOVE_CONFIRMATION,
        },
      });
      onRemoved(result.key, result.removedAt);
      setConfirming(false);
      setConfirmation("");
      toast.success(`Removed from ${label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Couldn't remove from ${label}.`);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-0 backdrop-blur sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-post-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !removing) onClose();
      }}
    >
      <div className="surface-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {PUBLISHED_STATE_LABEL[state]} · {formatDate(post.publishedAt, timeZone)}
            </p>
            <h2 id="live-post-title" className="mt-1 truncate text-xl font-semibold text-foreground">
              {label} · {post.accountName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={removing}
            aria-label="Close post"
            className="rounded-lg p-2 text-muted-foreground hover:bg-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-3">
          <Thumb post={post} className="h-24 w-24 shrink-0 rounded-xl" />
          <p className="line-clamp-5 whitespace-pre-line text-sm leading-6 text-foreground">
            {post.caption || "No caption"}
          </p>
        </div>

        {removal.kind === "removed" && (
          <div className="mt-4 rounded-xl border border-border bg-elevated/60 p-4">
            <p className="text-sm font-semibold text-foreground">{removal.message}</p>
            {post.removedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatInTimeZone(post.removedAt, timeZone, { dateStyle: "medium", timeStyle: "short" })}{" "}
                {timeZone}. WaveOS keeps the publishing history.
              </p>
            )}
          </div>
        )}
        {(removal.kind === "manual" ||
          removal.kind === "not_allowed" ||
          removal.kind === "unverified") && (
          <p className="mt-4 rounded-xl border border-border bg-elevated/60 p-3 text-sm leading-6 text-muted-foreground">
            {removal.message}
          </p>
        )}

        {confirming && removal.kind === "remove" ? (
          <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
            <p className="text-sm font-semibold text-foreground">Remove this post from {label}?</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              This deletes only this post from {post.accountName} on {label}. It can't be undone.
              Type {LIVE_POST_REMOVE_CONFIRMATION} to confirm.
            </p>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={LIVE_POST_REMOVE_CONFIRMATION}
              autoComplete="off"
              aria-label={`Type ${LIVE_POST_REMOVE_CONFIRMATION} to confirm`}
              className="mt-3 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-destructive/60"
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={removing}
                onClick={() => {
                  setConfirming(false);
                  setConfirmation("");
                }}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-elevated"
              >
                Keep post
              </button>
              <button
                type="button"
                disabled={removing || !isLivePostRemoveConfirmation(confirmation)}
                onClick={() => void handleRemove()}
                className="inline-flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remove from {label}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {removal.kind === "remove" && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-2 rounded-full border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> Remove from {label}
              </button>
            )}
            {post.url && state === "live" && (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <ExternalLink className="h-4 w-4" /> Open on {label}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
