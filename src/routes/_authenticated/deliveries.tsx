import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, File, Image as ImageIcon, Loader2, Sparkles, Video } from "lucide-react";

import { DeliveryCard } from "@/components/app/layer1-overview";
import { useWorkspace } from "@/components/app/workspace-context";
import { EmptyState } from "@/components/app/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { getSignedMediaUrl, type MediaAsset } from "@/hooks/use-media";
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
  const totalItems = deliveries.length + media.length;
  const loading = deliveriesQ.isLoading || mediaQ.isLoading;
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
            {deliveries.length} {deliveries.length === 1 ? "link" : "links"}
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
    </div>
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
    getSignedMediaUrl(asset.storage_path, 3600)
      .then((signedUrl) => active && setUrl(signedUrl))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [asset.storage_path]);

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
