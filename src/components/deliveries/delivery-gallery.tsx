import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download, File, ImageIcon, Loader2, Video } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getMediaPreviewUrl, type MediaAsset } from "@/hooks/use-media";
import { isValidHttpsUrl } from "@/lib/url-validation";
import { GallerySwipeSurface } from "./gallery-swipe-surface";

const PAGE_SIZE = 24;
export function DeliveryGallery({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [layout, setLayout] = useState<"comfortable" | "compact">("comfortable");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem("waveos.gallery.layout") === "compact") setLayout("compact");
    } catch {
      /* Layout remains usable. */
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const media = useInfiniteQuery({
    queryKey: ["your-content", "gallery", workspaceId, query, kind],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let request = supabase
        .from("media_assets")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .order("id");
      if (query) request = request.ilike("name", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
      if (kind !== "all") request = request.like("mime_type", `${kind}/%`);
      const { data, error } = await request.range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as MediaAsset[];
    },
    getNextPageParam: (last, pages) =>
      last.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    staleTime: 30_000,
  });
  const assets = [
    ...new Map((media.data?.pages.flat() ?? []).map((asset) => [asset.id, asset])).values(),
  ];
  const selectedIndex = assets.findIndex((asset) => asset.id === selectedId);
  const selected = assets[selectedIndex];
  const changeKind = (value: string) => {
    setSelectedId(null);
    setKind(value);
  };
  return (
    <section id="gallery" className="scroll-mt-24 space-y-4" aria-label="Delivery gallery">
      <header className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-surface to-surface p-5 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
          The collection
        </p>
        <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
          {name}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your photos, films and files. Open a favorite moment and explore at your own pace.
        </p>
      </header>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Gallery filters" className="grid grid-cols-3 gap-2">
          {[
            ["all", "All files"],
            ["image", "Photos"],
            ["video", "Videos"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={kind === value}
              onClick={() => changeKind(value)}
              className={`min-h-11 rounded-xl border px-4 text-sm ${kind === value ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <input
          type="search"
          aria-label="Search gallery"
          placeholder="Find a file by name"
          value={search}
          onChange={(event) => {
            setSelectedId(null);
            setSearch(event.target.value);
          }}
          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 sm:max-w-xs"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Gallery size" className="flex gap-2">
          {(["comfortable", "compact"] as const).map((size) => (
            <button
              type="button"
              key={size}
              aria-pressed={layout === size}
              onClick={() => {
                setLayout(size);
                try {
                  localStorage.setItem("waveos.gallery.layout", size);
                } catch {
                  /* Layout remains usable. */
                }
              }}
              className={`min-h-11 rounded-lg border px-3 text-sm ${layout === size ? "border-primary text-primary" : "border-border"}`}
            >
              {size === "comfortable" ? "Large previews" : "More per row"}
            </button>
          ))}
        </div>
        {(search || kind !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setQuery("");
              changeKind("all");
            }}
            className="min-h-11 px-3 text-sm text-primary"
          >
            Clear filters
          </button>
        )}
      </div>
      {media.isPending ? (
        <p role="status" className="py-8 text-sm text-muted-foreground">
          Loading your collection…
        </p>
      ) : media.isError && !assets.length ? (
        <div role="alert" className="rounded-xl border border-border p-4">
          Your gallery couldn’t load.{" "}
          <button
            type="button"
            className="min-h-11 px-3 text-primary"
            onClick={() => media.refetch()}
          >
            Try again
          </button>
        </div>
      ) : !assets.length ? (
        <p className="py-8 text-sm text-muted-foreground">
          {query || kind !== "all"
            ? "No files match these filters. Try another name or choose All files."
            : "Your collection will appear here when files are delivered."}
        </p>
      ) : (
        <>
          <div
            className={
              layout === "compact"
                ? "grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
                : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            }
          >
            {assets.map((asset) => (
              <GalleryTile key={asset.id} asset={asset} open={() => setSelectedId(asset.id)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              {assets.length} {assets.length === 1 ? "file" : "files"}
              {media.hasNextPage ? " shown" : " in this collection"}
            </p>
            {media.hasNextPage && (
              <button
                type="button"
                disabled={media.isFetchingNextPage}
                onClick={() => media.fetchNextPage()}
                className="min-h-11 rounded-xl border border-border px-4 text-foreground disabled:opacity-50"
              >
                {media.isFetchingNextPage
                  ? "Loading…"
                  : media.isFetchNextPageError
                    ? "Try loading more again"
                    : "Show more"}
              </button>
            )}
          </div>
          {media.isFetchNextPageError && (
            <p role="alert" className="text-sm">
              More files couldn’t load. Your current selection is still available.
            </p>
          )}
        </>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          className="max-h-[94dvh] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto rounded-2xl p-4 sm:p-6"
          onKeyDown={(event) => {
            if (
              event.target instanceof HTMLElement &&
              ["VIDEO", "INPUT", "TEXTAREA"].includes(event.target.tagName)
            )
              return;
            if (event.key === "ArrowLeft" && selectedIndex > 0) {
              event.preventDefault();
              setSelectedId(assets[selectedIndex - 1].id);
            }
            if (event.key === "ArrowRight" && selectedIndex + 1 < assets.length) {
              event.preventDefault();
              setSelectedId(assets[selectedIndex + 1].id);
            }
          }}
        >
          <DialogTitle
            title={selected?.name}
            className="line-clamp-3 min-w-0 [overflow-wrap:anywhere] pr-12 text-base leading-snug"
          >
            {selected?.name}
          </DialogTitle>
          <DialogDescription>
            {selectedIndex + 1} of {assets.length}
            {media.hasNextPage ? " loaded files" : " files"}
          </DialogDescription>
          <GallerySwipeSurface
            onPrevious={() => {
              if (selectedIndex > 0) setSelectedId(assets[selectedIndex - 1].id);
            }}
            onNext={() => {
              if (selectedIndex + 1 < assets.length) setSelectedId(assets[selectedIndex + 1].id);
            }}
          >
            {selected && <GalleryViewer key={selected.id} asset={selected} />}
          </GallerySwipeSurface>
          <p className="text-xs text-muted-foreground">
            Swipe across a photo or use Previous and Next to browse.
          </p>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Previous file"
              disabled={selectedIndex <= 0}
              onClick={() => setSelectedId(assets[selectedIndex - 1].id)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              type="button"
              aria-label="Next file"
              disabled={selectedIndex + 1 >= assets.length}
              onClick={() => setSelectedId(assets[selectedIndex + 1].id)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 disabled:opacity-40"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function usePreview(asset: MediaAsset, mode: "thumbnail" | "content") {
  return useQuery({
    queryKey: [
      "media",
      "delivery-preview",
      asset.workspace_id,
      asset.id,
      asset.storage_path,
      asset.source_provider,
      mode,
    ],
    queryFn: async () => {
      // Frame.io asset imports expose a thumbnail and a provider page, not a playable original.
      const url =
        asset.source_provider === "frameio"
          ? mode === "thumbnail"
            ? asset.thumbnail_url
            : null
          : await getMediaPreviewUrl(asset, 3600, mode);
      if (!isValidHttpsUrl(url)) throw new Error("Preview unavailable");
      return url!;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
  });
}
function GalleryTile({ asset, open }: { asset: MediaAsset; open: () => void }) {
  const preview = usePreview(asset, "thumbnail");
  const [failed, setFailed] = useState(false);
  const isImage = asset.mime_type.startsWith("image/");
  const Icon = asset.mime_type.startsWith("video/") ? Video : isImage ? ImageIcon : File;
  return (
    <button
      type="button"
      onClick={open}
      aria-label={`View ${asset.name}`}
      className="group min-w-0 overflow-hidden rounded-2xl border border-border bg-surface text-left focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-elevated">
        {preview.data && !failed && (isImage || asset.source_provider !== "waveos") ? (
          <img
            src={preview.data}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {preview.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Icon className="h-8 w-8" />
            )}
          </div>
        )}
        <span className="absolute bottom-2 left-2 rounded-full bg-background/90 p-2 text-foreground">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className="line-clamp-2 min-h-12 [overflow-wrap:anywhere] px-3 py-2 text-xs font-medium sm:text-sm"
        title={asset.name}
      >
        {asset.name}
      </p>
    </button>
  );
}
function GalleryViewer({ asset }: { asset: MediaAsset }) {
  const preview = usePreview(asset, "content");
  const [failed, setFailed] = useState(false);
  const image = asset.mime_type.startsWith("image/");
  const video = asset.mime_type.startsWith("video/");
  return (
    <div className="space-y-3">
      {preview.isPending ? (
        <p role="status" className="py-16 text-center">
          Opening file…
        </p>
      ) : failed || preview.isError ? (
        <div role="alert" className="rounded-xl bg-elevated p-6 text-center">
          <p>We couldn’t preview this file.</p>
          <button
            type="button"
            className="min-h-11 px-3 text-primary"
            onClick={() => {
              setFailed(false);
              void preview.refetch();
            }}
          >
            Retry preview
          </button>
          {isValidHttpsUrl(asset.source_web_url) && (
            <a
              href={asset.source_web_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center px-3 text-primary"
            >
              Open provider link
            </a>
          )}
        </div>
      ) : image ? (
        <img
          src={preview.data}
          alt={asset.name}
          onError={() => setFailed(true)}
          className="max-h-[60dvh] w-full rounded-lg object-contain"
        />
      ) : video ? (
        <video
          src={preview.data}
          controls
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
          className="max-h-[60dvh] w-full rounded-lg"
        />
      ) : (
        <div className="rounded-xl bg-elevated p-10 text-center">
          <File className="mx-auto h-10 w-10" />
          <p className="mt-3 text-sm">This file is ready to open or download.</p>
        </div>
      )}
      {preview.data && !failed && (
        <a
          href={preview.data}
          target="_blank"
          rel="noopener noreferrer"
          download={asset.name}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm"
        >
          <Download className="h-4 w-4" />
          Open / download original
        </a>
      )}
    </div>
  );
}
