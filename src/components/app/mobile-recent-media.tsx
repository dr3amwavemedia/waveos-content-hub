import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "lucide-react";
import { useMediaAssets, getMediaPreviewUrl } from "@/hooks/use-media";

export function MobileRecentMedia({ workspaceId }: { workspaceId: string | undefined }) {
  const assets = useMediaAssets(workspaceId, { kind: "image" });
  const previews = useQuery({
    queryKey: ["mobile-recent-media", workspaceId, assets.data?.slice(0, 3).map((asset) => asset.id)],
    enabled: Boolean(assets.data?.length),
    queryFn: async () => Promise.all((assets.data ?? []).slice(0, 3).map(async (asset) => ({ asset, url: asset.thumbnail_url ?? await getMediaPreviewUrl(asset).catch(() => null) }))),
  });
  return <section className="space-y-3 sm:hidden">
    <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Recent Content</h2><Link to="/content" className="text-xs text-primary">See all</Link></div>
    {assets.isPending ? <div className="grid grid-cols-3 gap-2">{[0,1,2].map((key) => <div key={key} className="aspect-square animate-pulse rounded-xl bg-elevated" />)}</div> : assets.isError ? <p className="text-xs text-muted-foreground">Content is unavailable right now.</p> : !assets.data?.length ? <Link to="/content" className="flex min-h-20 items-center gap-3 rounded-xl border border-border bg-surface px-4"><Image className="size-5 text-primary" /><span className="text-sm text-muted-foreground">No recent content yet</span></Link> : <div className="grid grid-cols-3 gap-2">{previews.data?.map(({asset,url}) => <Link key={asset.id} to="/content" className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">{url ? <img src={url} alt={asset.name} className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center bg-elevated"><Image className="text-primary" /></div>}<p className="truncate px-2 py-2 text-[10px]">{asset.name}</p></Link>)}</div>}
  </section>;
}