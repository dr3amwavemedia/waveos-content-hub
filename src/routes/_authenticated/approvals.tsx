import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CheckSquare,
  Clock,
  Filter,
  Loader2,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app/empty-state";
import { useWorkspace } from "@/components/app/workspace-context";
import { useCurrentUser } from "@/hooks/use-waveos";
import {
  useAddComment,
  useComments,
  useContentItems,
  useDecideApproval,
  type ContentItem,
} from "@/hooks/use-content";

export const Route = createFileRoute("/_authenticated/approvals")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: ApprovalsPage,
  head: () => ({
    meta: [{ title: "Approvals — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

function ApprovalsPage() {
  const { activeWorkspace } = useWorkspace();
  const { data: user } = useCurrentUser();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const items = useContentItems(
    activeWorkspace?.id ?? null,
    filter === "pending" ? ["in_review", "changes_requested"] : undefined,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = (items.data ?? []).find((i) => i.id === selectedId) ?? null;

  if (!activeWorkspace) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="No workspace selected"
        body="Pick a workspace to review its pending content."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Review and decide on content waiting on {user?.isStaff ? "clients" : "you"}.
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-full border border-border bg-elevated text-xs">
          {(["pending", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 font-medium capitalize transition-colors",
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="surface-card divide-y divide-border p-0">
          {items.isLoading ? (
            <div className="flex items-center justify-center p-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (items.data ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nothing waiting on approval.
            </div>
          ) : (
            (items.data ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "flex w-full flex-col gap-1 p-4 text-left transition-colors",
                  selectedId === c.id ? "bg-primary/10" : "hover:bg-elevated/60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {c.title || "Untitled post"}
                  </span>
                  <StatusPill status={c.status} />
                </div>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {c.primary_caption ?? "No caption yet"}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(c.updated_at).toLocaleString()}
                </span>
              </button>
            ))
          )}
        </div>

        <div>
          {selected ? (
            <ApprovalDetail item={selected} />
          ) : (
            <div className="surface-card flex flex-col items-center justify-center gap-2 p-12 text-center text-muted-foreground">
              <Filter className="h-6 w-6" />
              <p className="text-sm">Select a post from the list to review it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ContentItem["status"] }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    in_review: "bg-amber-500/15 text-amber-300",
    changes_requested: "bg-orange-500/15 text-orange-300",
    approved: "bg-emerald-500/15 text-emerald-300",
    scheduled: "bg-sky-500/15 text-sky-300",
    publishing: "bg-primary/20 text-primary",
    published: "bg-emerald-500/20 text-emerald-300",
    failed: "bg-destructive/20 text-destructive",
    archived: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", map[status])}>
      {status.replace("_", " ")}
    </span>
  );
}

function ApprovalDetail({ item }: { item: ContentItem }) {
  const decide = useDecideApproval();
  const comments = useComments(item.id);
  const add = useAddComment();
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");

  const captionPreview = useMemo(
    () => (item.primary_caption ?? "").slice(0, 800),
    [item.primary_caption],
  );

  async function act(decision: "approved" | "changes_requested" | "rejected") {
    try {
      await decide.mutateAsync({
        contentId: item.id,
        workspaceId: item.workspace_id,
        decision,
        note: note.trim() || undefined,
      });
      setNote("");
      toast.success(
        decision === "approved" ? "Approved" :
        decision === "changes_requested" ? "Changes requested" : "Rejected",
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="surface-card space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {item.title || "Untitled post"}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              Updated {new Date(item.updated_at).toLocaleString()}
            </p>
          </div>
          <Link
            to="/create"
            search={{ id: item.id }}
            className="rounded-full border border-border bg-elevated px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
          >
            Open in editor
          </Link>
        </div>
        <div className="rounded-lg border border-border bg-elevated/40 p-4 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {captionPreview || "No caption written."}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Decision note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add context for the requester…"
            className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-primary/60"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            disabled={decide.isPending}
            onClick={() => act("approved")}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:brightness-110"
          >
            <ThumbsUp className="h-4 w-4" /> Approve
          </button>
          <button
            disabled={decide.isPending}
            onClick={() => act("changes_requested")}
            className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-110"
          >
            <ThumbsDown className="h-4 w-4" /> Request changes
          </button>
          <button
            disabled={decide.isPending}
            onClick={() => act("rejected")}
            className="inline-flex items-center gap-2 rounded-full border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20"
          >
            <XCircle className="h-4 w-4" /> Reject
          </button>
        </div>
      </div>

      <div className="surface-card space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare className="h-4 w-4" /> Comments
        </div>
        <div className="space-y-2">
          {(comments.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          ) : (
            (comments.data ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-elevated/50 p-3">
                <p className="text-sm text-foreground whitespace-pre-wrap">{c.body}</p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment"
            className="flex-1 rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-primary/60"
          />
          <button
            disabled={!comment.trim() || add.isPending}
            onClick={async () => {
              await add.mutateAsync({
                contentId: item.id,
                workspaceId: item.workspace_id,
                body: comment.trim(),
              });
              setComment("");
            }}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
