import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Eye,
  FileEdit,
  LayoutPanelTop,
  Loader2,
  Plus,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { useCurrentUser } from "@/hooks/use-waveos";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/vision-board")({
  component: VisionBoardLibrary,
});

type BoardSummary = {
  id: string;
  project_name: string;
  status: "draft" | "published";
  public_token: string;
  published_at: string | null;
  updated_at: string;
  pages: Array<{ image?: string | null; sceneTitle?: string }>;
};

const db = supabase as unknown as { from: (table: string) => any };

function VisionBoardLibrary() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const canUseBoard = Boolean(user?.isDreamWaveOwner || (user?.staffType === "media_manager" || user?.staffType === "crew"));

  const boards = useQuery({
    queryKey: ["production-vision-boards", user?.userId],
    enabled: Boolean(user?.userId && canUseBoard),
    queryFn: async () => {
      const { data, error } = await db
        .from("production_vision_boards")
        .select("id, project_name, status, public_token, published_at, updated_at, pages")
        .eq("created_by", user!.userId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BoardSummary[];
    },
  });

  if (userLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading vision boards…</div>;
  }

  if (!canUseBoard) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-8 text-center">
        <LayoutPanelTop className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Vision Board</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This workspace is available to Dream Wave admins and media staff.
        </p>
      </div>
    );
  }

  const visibleBoards = (boards.data ?? []).filter(
    (board) => filter === "all" || board.status === filter,
  );
  const draftCount = (boards.data ?? []).filter((board) => board.status === "draft").length;

  return (
    <div className="space-y-6">
      <nav className="flex w-fit items-center gap-1 rounded-xl border border-border bg-surface p-1" aria-label="Production sections">
        <Link to="/videographer" className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-elevated hover:text-foreground">
          Dashboard
        </Link>
        <Link to="/vision-board" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          <LayoutPanelTop className="h-4 w-4" />
          Vision Board
        </Link>
      </nav>

      <header className="flex flex-col justify-between gap-5 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6 lg:flex-row lg:items-end">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Production</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Storyboard projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a storyboard to edit, review your drafts, or start a new production.
          </p>
        </div>
        <Link
          to="/vision-board/$boardId"
          params={{ boardId: "new" }}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          New storyboard
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          All ({boards.data?.length ?? 0})
        </FilterButton>
        <FilterButton active={filter === "draft"} onClick={() => setFilter("draft")}>
          Drafts ({draftCount})
        </FilterButton>
        <FilterButton active={filter === "published"} onClick={() => setFilter("published")}>
          Published ({(boards.data?.length ?? 0) - draftCount})
        </FilterButton>
      </div>

      {boards.isLoading ? (
        <div className="flex justify-center py-20 text-primary">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : boards.isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Storyboards could not be loaded. Confirm the production vision board SQL has been applied.
        </div>
      ) : visibleBoards.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visibleBoards.map((board) => {
            const preview = board.pages?.find((page) => page.image)?.image;
            const publishedUrl = `${window.location.origin}/storyboard/${board.public_token}`;
            return (
              <article key={board.id} className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                <Link to="/vision-board/$boardId" params={{ boardId: board.id }} className="block">
                  <div className="aspect-video overflow-hidden bg-elevated">
                    {preview ? (
                      <img src={preview} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <LayoutPanelTop className="h-10 w-10 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="p-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 truncate font-semibold text-foreground">{board.project_name}</h2>
                      <span className={board.status === "published" ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500" : "rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500"}>
                        {board.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Updated {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(board.updated_at))}
                      <span>·</span>
                      {board.pages?.length ?? 0} scenes
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-2 border-t border-border px-4 py-3">
                  <Link to="/vision-board/$boardId" params={{ boardId: board.id }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                    <FileEdit className="h-4 w-4" />
                    Edit board
                  </Link>
                  {board.status === "published" ? (
                    <a href={publishedUrl} target="_blank" rel="noreferrer" title="View full published board" aria-label={`View ${board.project_name} published board`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-primary/40 hover:text-primary">
                      <Eye className="h-4 w-4" />
                    </a>
                  ) : (
                    <button type="button" disabled title="Publish this draft to view the full board" aria-label="View board unavailable until published" className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-lg border border-border text-muted-foreground opacity-35">
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <LayoutPanelTop className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 font-semibold text-foreground">
            {filter === "all" ? "Create your first storyboard" : `No ${filter} storyboards`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a visual plan with scenes, locations, drawings, and shot descriptions.
          </p>
          <Link to="/vision-board/$boardId" params={{ boardId: "new" }} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" />
            New storyboard
          </Link>
        </div>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={active ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" : "rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"}>
      {children}
    </button>
  );
}
