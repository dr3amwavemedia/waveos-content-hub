import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Film, Loader2, Play, Upload, Video } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { RequireFeature } from "@/components/app/require-feature";
import { useWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import {
  getMediaPreviewUrl,
  useMediaAssets,
  useUploadAsset,
  type MediaAsset,
} from "@/hooks/use-media";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/video-maker")({
  component: () => (
    <RequireFeature
      feature="can_use_creative_studio"
      title="Video Maker is available with Current or Tidal"
      description="Upgrade your WaveOS plan to prepare video content for social publishing."
    >
      <VideoMakerPage />
    </RequireFeature>
  ),
  head: () => ({ meta: [{ title: "Video Maker — WaveOS" }] }),
});

function VideoMakerPage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const videos = useMediaAssets(workspaceId, { kind: "video" });
  const upload = useUploadAsset(workspaceId);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!selected) {
      setPreviewUrl(null);
      return () => {
        active = false;
      };
    }
    void getMediaPreviewUrl(selected).then((url) => {
      if (active) setPreviewUrl(url);
    });
    return () => {
      active = false;
    };
  }, [selected]);

  async function uploadVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!file.type.startsWith("video/") && extension !== "mp4" && extension !== "mov") {
      toast.error("Choose an MP4 or MOV video.");
      return;
    }
    try {
      const asset = await upload.mutateAsync({ file, folderId: null, tags: [] });
      setSelected(asset);
      toast.success("Video uploaded and ready to preview.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Video could not be uploaded.");
    }
  }

  return (
    <div className="ocean-page space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Creative Studio
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Video Maker</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Choose or upload a video, check the full clip, then carry it into a new social post.
            Nothing publishes until you review and approve it.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
          Upload video
        </Button>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          onChange={uploadVideo}
        />
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
        <section className="surface-card overflow-hidden p-4 sm:p-5" aria-label="Video preview">
          {selected && previewUrl ? (
            <>
              <video
                key={selected.id}
                controls
                playsInline
                preload="metadata"
                src={previewUrl}
                className="aspect-video w-full rounded-2xl bg-black object-contain"
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{videoDetails(selected)}</p>
                </div>
                <Button
                  onClick={() =>
                    void navigate({
                      to: "/create",
                      search: { media: selected.id, destination: "feed" },
                    })
                  }
                >
                  <Play /> Continue to post
                </Button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-72 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8 text-center"
            >
              <Film className="h-10 w-10 text-primary" />
              <span className="mt-3 font-semibold">Choose a video to begin</span>
              <span className="mt-1 max-w-sm text-sm text-muted-foreground">
                Preview the exact clip before it reaches the post composer.
              </span>
            </button>
          )}
        </section>

        <section className="surface-card p-4 sm:p-5" aria-label="Video library">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Video library</h2>
          </div>
          {videos.isPending ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading videos…
            </div>
          ) : videos.isError ? (
            <p className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">
              Videos could not be loaded. Your media was not changed.
            </p>
          ) : (videos.data ?? []).length === 0 ? (
            <p className="mt-4 rounded-xl border border-border p-4 text-sm text-muted-foreground">
              No videos yet. Upload an MP4 or MOV to start.
            </p>
          ) : (
            <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {(videos.data ?? []).map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setSelected(asset)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-colors",
                    selected?.id === asset.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface/40 hover:border-primary/40",
                  )}
                >
                  <span className="block truncate text-sm font-semibold">{asset.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {videoDetails(asset)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function videoDetails(asset: MediaAsset) {
  const details = [];
  if (asset.width && asset.height) details.push(`${asset.width}×${asset.height}`);
  if (asset.duration_seconds != null) details.push(formatDuration(asset.duration_seconds));
  details.push(formatBytes(asset.size_bytes));
  return details.join(" · ");
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
