import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, Loader2, MapPin } from "lucide-react";

import { WaveLogo } from "@/components/branding/wave-logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/storyboard/$token")({
  component: PublishedStoryboard,
});

type StoryboardPage = {
  id: string;
  sceneNumber: string;
  sceneTitle: string;
  location: string;
  description: string;
  shotDescription: string;
  image: string | null;
};

type PublishedBoard = {
  project_name: string;
  pages: StoryboardPage[];
  published_at: string | null;
};

const db = supabase as unknown as { from: (table: string) => any };

function PublishedStoryboard() {
  const { token } = Route.useParams();
  const [board, setBoard] = useState<PublishedBoard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    db.from("production_vision_boards")
      .select("project_name, pages, published_at")
      .eq("public_token", token)
      .eq("status", "published")
      .maybeSingle()
      .then(({ data }: { data: PublishedBoard | null }) => {
        if (active) {
          setBoard(data);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <Camera className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">Storyboard unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link may be incorrect, unpublished, or no longer available.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div>
            <WaveLogo />
            <div className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Production storyboard
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{board.project_name}</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {board.pages.length} {board.pages.length === 1 ? "scene" : "scenes"}
            {board.published_at
              ? ` · Published ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(board.published_at))}`
              : ""}
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 xl:grid-cols-2 lg:px-8">
        {board.pages.map((page, index) => (
          <article key={page.id || index} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-elevated/40 px-5 py-3">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Page {index + 1}</span>
              <span className="text-sm font-semibold text-foreground">Scene {page.sceneNumber || index + 1}</span>
            </div>
            <div className="aspect-video bg-[#f4f1e9]">
              {page.image ? (
                <img src={page.image} alt={page.sceneTitle || `Scene ${page.sceneNumber}`} className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#77736b]">Visual reference</div>
              )}
            </div>
            <div className="space-y-5 p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <h2 className="text-lg font-semibold text-foreground">{page.sceneTitle || `Scene ${page.sceneNumber || index + 1}`}</h2>
                {page.location && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {page.location}
                  </span>
                )}
              </div>
              <Note label="Scene description" value={page.description} />
              <Note label="Shot description" value={page.shotDescription} />
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

function Note({ label, value }: { label: string; value: string }) {
  return (
    <section>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</h3>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {value || "No notes provided."}
      </p>
    </section>
  );
}
