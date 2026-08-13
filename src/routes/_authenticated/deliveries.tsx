import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, File, Image as ImageIcon, Loader2, Sparkles, Video } from "lucide-react";

import { DeliveryCard } from "@/components/app/layer1-overview";
import { useWorkspace } from "@/components/app/workspace-context";
import { EmptyState } from "@/components/app/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { getMediaPreviewUrl, type MediaAsset } from "@/hooks/use-media";
import { getFrameioWorkspaceStatus, listFrameioWorkspaceMedia, type FrameioProviderFile } from "@/hooks/use-frameio";
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

  const deliveries = deliveriesQ.data ?? [];

  const mediaQ = useQuery({
    queryKey: ["your-content", "media", workspaceId],
    enabled: !!workspaceId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MediaAsset[];
    },
  });

  const media = mediaQ.data ?? [];
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
  const frameioFiles = frameioQ.data?.files ?? [];
  const totalItems = deliveries.length + media.length + frameioFiles.length;
  const loading = deliveriesQ.isLoading || mediaQ.isLoading || frameioQ.isLoading;
  const failed = deliveriesQ.isError || mediaQ.isError;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Your library</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Your Content
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Every project, deliverable, and external link from Dream Wave Media, newest first.
        </p>
        {!loading && !failed && (
          <p className="mt-3 text-xs font-medium text-muted-foreground">
            {totalItems} {totalItems === 1 ? "item" : "items"} · {media.length} uploaded ·{" "}
            {deliveries.length} {deliveries.length === 1 ? "link" : "links"} · {frameioFiles.length} from Frame.io
          </p>
        )}
      </header>

      {loading ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">Loading your content…</div>
      ) : failed ? (
        <div className="surface-card border-destructive/30 p-6 text-sm text-destructive">
          We couldn't load your content. Please refresh and try again.
        </div>
      ) : totalItems > 0 ? (
        <div className="space-y-8">
          {frameioFiles.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{frameioQ.data?.label ?? "Frame.io media"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">The Frame.io folder selected for your workspace by Dream Wave Media.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {frameioFiles.map((file) => <FrameioCard key={file.id} file={file} />)}
              </div>
            </section>
          )}
          {media.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Uploaded photos and videos</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {media.map((asset) => (
                  <MediaCard key={asset.id} asset={asset} />
                ))}
              </div>
            </section>
          )}
          {deliveries.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Project links and deliverables</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {deliveries.map((delivery) => (
                  <DeliveryCard key={delivery.id} delivery={delivery} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="No content has been delivered yet."
          body="Projects and delivery links added by Dream Wave Media will appear here automatically."
        />
      )}
      {!loading && frameioQ.isError && (
        <div className="surface-card border-primary/20 p-4 text-sm text-muted-foreground">
          The assigned Frame.io folder is temporarily unavailable. Your uploaded content and delivery links are still shown above.
        </div>
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
        {file.thumbnailUrl ? (
          <img src={file.thumbnailUrl} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground"><KindIcon className="h-8 w-8" /></div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-1 text-[10px] font-semibold text-foreground backdrop-blur">Frame.io</span>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2"><KindIcon className="h-4 w-4 shrink-0 text-primary" /><p className="truncate text-sm font-medium text-foreground" title={file.name}>{file.name}</p></div>
        {file.viewUrl && <a href={file.viewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Open in Frame.io</a>}
      </div>
    </article>
  );
}

function MediaCard({ asset }: { asset: MediaAsset }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = asset.mime_type.startsWith("image/");
  const isVideo = asset.mime_type.startsWith("video/");

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    getMediaPreviewUrl(asset, 3600)
      .then((signedUrl) => active && setUrl(signedUrl))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [asset.id]);

  const KindIcon = isVideo ? Video : isImage ? ImageIcon : File;

  return (
    <article className="surface-card overflow-hidden">
      <div className="relative aspect-square bg-elevated">
        {url && isImage ? (
          <img src={url} alt={asset.name} className="h-full w-full object-cover" />
        ) : url && isVideo ? (
          <video src={url} className="h-full w-full object-cover" controls playsInline preload="metadata" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {failed ? <KindIcon className="h-8 w-8" /> : <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <KindIcon className="h-4 w-4 shrink-0 text-primary" />
          <p className="truncate text-sm font-medium text-foreground" title={asset.name}>
            {asset.name}
          </p>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={asset.name}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Download className="h-3.5 w-3.5" /> Open or download
          </a>
        )}
      </div>
    </article>
  );
}
