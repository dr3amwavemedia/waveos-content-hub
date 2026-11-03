import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, CircleAlert, Film, Loader2, Play, RotateCw, Upload, Video } from "lucide-react";
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
  const previewRef = useRef<HTMLElement | null>(null);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (!selected) {
      setPreviewUrl(null);
      setPreviewPending(false);
      setPreviewError(null);
      return () => {
        active = false;
      };
    }
    setPreviewUrl(null);
    setPreviewPending(true);
    setPreviewError(null);
    void getMediaPreviewUrl(selected)
      .then((url) => {
        if (!active) return;
        if (!url) throw new Error("No preview URL was returned for this video.");
        setPreviewUrl(url);
      })
      .catch(() => {
        if (active) {
          setPreviewError(
            "WaveOS could not open a browser preview for this clip. The original is still selected and can be added to a post.",
          );
        }
      })
      .finally(() => {
        if (active) setPreviewPending(false);
      });
    return () => {
      active = false;
    };
  }, [previewAttempt, selected]);

  function selectVideo(asset: MediaAsset) {
    setSelected(asset);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() =>
        previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }

  function continueToPost(destination: "feed" | "story") {
    if (!selected) return;
    void navigate({ to: "/create", search: { media: selected.id, destination } });
  }

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

      <section className="surface-card p-4 sm:p-5" aria-label="Video Maker steps">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Choose a clip", "Pick an existing library video or upload one."],
            ["2", "Check playback", "Review the selected file and confirm it is the right clip."],
            ["3", "Create the post", "Choose feed or story, then select the connected accounts."],
          ].map(([number, title, description], index) => {
            const complete = index === 0 && !!selected;
            const active = index === 0 ? !selected : index === 1 ? !!selected : !!previewUrl;
            return (
              <div
                key={number}
                className={cn(
                  "rounded-2xl border p-4",
                  active || complete
                    ? "border-primary/35 bg-primary/10"
                    : "border-border bg-surface/30",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {complete ? <Check className="h-4 w-4" /> : number}
                  </span>
                  <p className="font-semibold">{title}</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Video Maker prepares the clip for the post composer. Nothing is published from this page.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
        <section
          ref={previewRef}
          className="surface-card scroll-mt-24 overflow-hidden p-4 sm:p-5"
          aria-label="Video preview"
        >
          {selected ? (
            <>
              {previewPending ? (
                <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl bg-black/70 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="mt-3 font-semibold">Opening {selected.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Preparing a secure preview…</p>
                </div>
              ) : previewUrl && !previewError ? (
                <video
                  key={`${selected.id}-${previewAttempt}`}
                  controls
                  playsInline
                  preload="metadata"
                  src={previewUrl}
                  onError={() =>
                    setPreviewError(
                      "This browser cannot play the clip format, but the original can still be added to a post.",
                    )
                  }
                  className="aspect-video w-full rounded-2xl bg-black object-contain"
                />
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/5 p-6 text-center">
                  <CircleAlert className="h-9 w-9 text-amber-300" />
                  <p className="mt-3 font-semibold">Preview unavailable</p>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">{previewError}</p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() => setPreviewAttempt((attempt) => attempt + 1)}
                  >
                    <RotateCw /> Retry preview
                  </Button>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    Selected clip
                  </p>
                  <p className="truncate font-semibold">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{videoDetails(selected)}</p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button variant="outline" onClick={() => continueToPost("story")}>
                    <Play /> Create story post
                  </Button>
                  <Button onClick={() => continueToPost("feed")}>
                    <Play /> Create feed post
                  </Button>
                </div>
              </div>
              <p className="mt-3 rounded-xl border border-border bg-surface/40 p-3 text-xs text-muted-foreground">
                Next, WaveOS opens Create Post with this video attached. You will choose the exact
                connected platforms and accounts before anything can publish.
              </p>
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
                  onClick={() => selectVideo(asset)}
                  aria-pressed={selected?.id === asset.id}
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
                  {selected?.id === asset.id && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <Check className="h-3.5 w-3.5" /> Selected — review above
                    </span>
                  )}
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
