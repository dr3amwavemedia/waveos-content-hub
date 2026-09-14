import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, File, Image as ImageIcon, Video } from "lucide-react";
import { DeliveryCard } from "@/components/app/layer1-overview";
import { DeliveryGallery } from "@/components/deliveries/delivery-gallery";
import { useWorkspace } from "@/components/app/workspace-context";
import { supabase } from "@/integrations/supabase/client";
import {
  getFrameioWorkspaceStatus,
  listFrameioWorkspaceMedia,
  type FrameioProviderFile,
} from "@/hooks/use-frameio";
import { isValidHttpsUrl } from "@/lib/url-validation";
import type { Database } from "@/integrations/supabase/types";

type Delivery = Database["public"]["Tables"]["client_deliveries"]["Row"];
export const Route = createFileRoute("/_authenticated/deliveries")({
  component: YourContentRoute,
  head: () => ({ meta: [{ title: "Your Content — WaveOS" }] }),
});
function YourContentRoute() {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id;
  const deliveriesQ = useQuery({
    queryKey: ["your-content", workspaceId],
    enabled: !!workspaceId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_deliveries")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("delivered_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Delivery[];
    },
  });
  const frameioQ = useQuery({
    queryKey: ["your-content", "frameio", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async () => {
      const status = await getFrameioWorkspaceStatus(workspaceId!);
      return status.connected ? listFrameioWorkspaceMedia(workspaceId!, "") : null;
    },
    retry: false,
  });
  if (!workspaceId)
    return (
      <p className="py-8 text-sm text-muted-foreground">
        Choose a workspace to see its deliveries.
      </p>
    );
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Your library</p>
        <h1 className="mt-2 text-3xl font-semibold">Your Content</h1>
        <nav aria-label="Delivery sections" className="mt-4 grid grid-cols-2 gap-2">
          <a
            href="#gallery"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary"
          >
            <ImageIcon className="h-5 w-5" />
            Photo gallery
          </a>
          <a
            href="#delivery-links"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-4 text-sm"
          >
            Project links
          </a>
        </nav>
      </header>
      <DeliveryGallery
        key={workspaceId}
        workspaceId={workspaceId}
        name={activeWorkspace?.name ?? "Your collection"}
      />
      <section id="delivery-links" className="scroll-mt-24 space-y-3">
        <h2 className="text-lg font-semibold">Project links and deliverables</h2>
        {deliveriesQ.isLoading ? (
          <p role="status">Loading project links…</p>
        ) : deliveriesQ.isError ? (
          <div role="alert" className="rounded-xl border border-border p-4">
            Project links couldn’t load.{" "}
            <button
              type="button"
              className="min-h-11 px-3 text-primary"
              onClick={() => deliveriesQ.refetch()}
            >
              Try again
            </button>
          </div>
        ) : deliveriesQ.data?.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {deliveriesQ.data.map((delivery) => (
              <DeliveryCard key={delivery.id} delivery={delivery} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your project links will appear here when delivered.
          </p>
        )}
      </section>
      {frameioQ.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking connected media…
        </p>
      ) : frameioQ.isError ? (
        <div role="alert" className="rounded-xl border border-border p-4 text-sm">
          Connected media is temporarily unavailable.{" "}
          <button
            type="button"
            className="min-h-11 px-3 text-primary"
            onClick={() => frameioQ.refetch()}
          >
            Try again
          </button>
        </div>
      ) : (
        !!frameioQ.data?.files.length && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{frameioQ.data.label ?? "Connected media"}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {frameioQ.data.files.map((file) => (
                <FrameioCard key={file.id} file={file} />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}

function FrameioCard({ file }: { file: FrameioProviderFile }) {
  const isImage = file.mediaType.startsWith("image/");
  const isVideo = file.mediaType.startsWith("video/");
  const KindIcon = isVideo ? Video : isImage ? ImageIcon : File;
  return (
    <article className="surface-card overflow-hidden">
      <div className="relative aspect-square bg-elevated">
        {isValidHttpsUrl(file.thumbnailUrl) ? (
          <img
            src={file.thumbnailUrl!}
            alt={file.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <KindIcon className="h-8 w-8" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-1 text-[10px] font-semibold text-foreground backdrop-blur">
          Frame.io
        </span>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <KindIcon className="h-4 w-4 shrink-0 text-primary" />
          <p className="truncate text-sm font-medium text-foreground" title={file.name}>
            {file.name}
          </p>
        </div>
        {isValidHttpsUrl(file.viewUrl) && (
          <a
            href={file.viewUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open in Frame.io
          </a>
        )}
      </div>
    </article>
  );
}
