import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "lucide-react";
import { useMediaAssets, getMediaPreviewUrl } from "@/hooks/use-media";

export function MobileRecentMedia({ workspaceId }: { workspaceId: string | undefined }) {
  const assets = useMediaAssets(workspaceId, { kind: "image" });
  const recent = (assets.data ?? []).slice(0, 8);
  const previews = useQuery({
    queryKey: ["mobile-recent-media", workspaceId, recent.map((asset) => asset.id)],
    enabled: recent.length > 0,
    queryFn: async () =>
      Promise.all(
        recent.map(async (asset) => ({
          asset,
          url: asset.thumbnail_url ?? (await getMediaPreviewUrl(asset).catch(() => null)),
        })),
      ),
  });
  return (
    <section className="space-y-2 sm:hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent content</h2>
        <Link to="/content" className="text-xs text-primary">See all</Link>
      </div>
      {assets.isPending ? (
        <div className="flex gap-2">{[0, 1, 2, 3].map((k) => <div key={k} className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-elevated" />)}</div>
      ) : assets.isError ? (
        <p className="text-xs text-muted-foreground">Content is unavailable right now.</p>
      ) : !recent.length ? (
        <Link to="/content" className="flex min-h-12 items-center gap-3 rounded-xl border border-dashed border-border px-3">
          <Image className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">No recent content yet</span>
        </Link>
      ) : (
        <div className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
          {(previews.data ?? recent.map((asset) => ({ asset, url: null as string | null }))).map(({ asset, url }) => (
            <Link key={asset.id} to="/content" className="w-20 shrink-0 snap-start">
              <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-border bg-elevated">
                {url ? <img src={url} alt={asset.name} className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center"><Image className="size-4 text-muted-foreground" /></div>}
              </div>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">{asset.name}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
