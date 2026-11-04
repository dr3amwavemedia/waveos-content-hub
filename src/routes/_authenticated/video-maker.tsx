import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, CircleAlert, Film, Gauge, ImageIcon, Loader2, Play, RotateCcw, RotateCw, Save, SlidersHorizontal, Type, Upload, Video, Volume2, VolumeX } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
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

type VideoEditRecipe = {
  trimStart: number;
  trimEnd: number | null;
  speed: number;
  volume: number;
  muted: boolean;
  aspect: "original" | "9:16" | "1:1" | "4:5" | "16:9";
  fit: "contain" | "cover";
  rotation: 0 | 90 | 180 | 270;
  brightness: number;
  contrast: number;
  saturation: number;
  text: string;
  textPosition: "top" | "center" | "bottom";
};

const DEFAULT_RECIPE: VideoEditRecipe = {
  trimStart: 0,
  trimEnd: null,
  speed: 1,
  volume: 1,
  muted: false,
  aspect: "original",
  fit: "contain",
  rotation: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  text: "",
  textPosition: "bottom",
};

function VideoMakerPage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const videos = useMediaAssets(workspaceId, { kind: "video" });
  const upload = useUploadAsset(workspaceId);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [directPreviewUrl, setDirectPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewMode, setPreviewMode] = useState<"direct" | "local_fallback" | null>(null);
  const blobPreviewRef = useRef<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [editorTab, setEditorTab] = useState<"trim" | "canvas" | "adjust" | "text" | "audio">("trim");
  const [recipe, setRecipe] = useState<VideoEditRecipe>(DEFAULT_RECIPE);
  const [recipeDirty, setRecipeDirty] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);

  useEffect(() => {
    let active = true;
    if (blobPreviewRef.current) {
      URL.revokeObjectURL(blobPreviewRef.current);
      blobPreviewRef.current = null;
    }
    if (!selected) {
      setPreviewUrl(null);
      setDirectPreviewUrl(null);
      setPreviewMode(null);
      setPreviewPending(false);
      setPreviewError(null);
      return () => {
        active = false;
      };
    }
    setPreviewUrl(null);
    setDirectPreviewUrl(null);
    setPreviewMode(null);
    setPreviewPending(true);
    setPreviewError(null);
    void getMediaPreviewUrl(selected)
      .then((url) => {
        if (!active) return;
        if (!url) throw new Error("No preview URL was returned for this video.");
        setDirectPreviewUrl(url);
        setPreviewUrl(url);
        setPreviewMode("direct");
      })
      .catch(() => {
        if (active) {
          setPreviewError(
            "WaveOS could not open the original preview URL for this clip.",
          );
        }
      })
      .finally(() => {
        if (active) setPreviewPending(false);
      });
    return () => {
      active = false;
      if (blobPreviewRef.current) {
        URL.revokeObjectURL(blobPreviewRef.current);
        blobPreviewRef.current = null;
      }
    };
  }, [previewAttempt, selected]);

  async function prepareLocalPreview() {
    if (!selected || !directPreviewUrl || previewPending) return;
    setPreviewPending(true);
    setPreviewError(null);
    try {
      const response = await fetch(directPreviewUrl, { credentials: "omit" });
      if (!response.ok) throw new Error("The video file could not be downloaded for preview.");
      const sourceBlob = await response.blob();
      if (sourceBlob.type.includes("text/html")) {
        throw new Error("The provider returned a webpage instead of the video file.");
      }
      const blob =
        sourceBlob.type && sourceBlob.type !== "application/octet-stream"
          ? sourceBlob
          : new Blob([await sourceBlob.arrayBuffer()], { type: selected.mime_type || "video/mp4" });
      if (blobPreviewRef.current) URL.revokeObjectURL(blobPreviewRef.current);
      const objectUrl = URL.createObjectURL(blob);
      blobPreviewRef.current = objectUrl;
      setPreviewUrl(objectUrl);
      setPreviewMode("local_fallback");
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : "WaveOS could not prepare a local browser preview for this clip.",
      );
    } finally {
      setPreviewPending(false);
    }
  }

  function selectVideo(asset: MediaAsset) {
    setSelected(asset);
    const stored =
      asset.source_metadata && typeof asset.source_metadata === "object"
        ? (asset.source_metadata.video_maker_edit as Partial<VideoEditRecipe> | undefined)
        : undefined;
    setRecipe({
      ...DEFAULT_RECIPE,
      ...(stored ?? {}),
      trimEnd:
        typeof stored?.trimEnd === "number"
          ? stored.trimEnd
          : asset.duration_seconds ?? null,
    });
    setRecipeDirty(false);
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
      setRecipe({ ...DEFAULT_RECIPE, trimEnd: asset.duration_seconds ?? null });
      setRecipeDirty(false);
      toast.success("Video uploaded and ready to edit.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Video could not be uploaded.");
    }
  }

  function updateRecipe(patch: Partial<VideoEditRecipe>) {
    setRecipe((current) => ({ ...current, ...patch }));
    setRecipeDirty(true);
  }

  function resetRecipe() {
    setRecipe({ ...DEFAULT_RECIPE, trimEnd: selected?.duration_seconds ?? null });
    setRecipeDirty(true);
    const video = videoRef.current;
    if (video) {
      video.playbackRate = 1;
      video.volume = 1;
      video.muted = false;
      video.currentTime = 0;
    }
  }

  async function saveRecipe() {
    if (!selected || !workspaceId || savingRecipe) return;
    setSavingRecipe(true);
    try {
      const nextMetadata = {
        ...(selected.source_metadata ?? {}),
        video_maker_edit: recipe,
        video_maker_edit_updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("media_assets")
        .update({ source_metadata: nextMetadata })
        .eq("id", selected.id)
        .eq("workspace_id", workspaceId)
        .select()
        .single();
      if (error) throw error;
      setSelected(data as MediaAsset);
      setRecipeDirty(false);
      toast.success("Video edit setup saved with this clip.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Video edit setup could not be saved.");
    } finally {
      setSavingRecipe(false);
    }
  }

  const previewAspectClass =
    recipe.aspect === "9:16"
      ? "aspect-[9/16]"
      : recipe.aspect === "1:1"
        ? "aspect-square"
        : recipe.aspect === "4:5"
          ? "aspect-[4/5]"
          : "aspect-video";

  const overlayPositionClass =
    recipe.textPosition === "top"
      ? "items-start pt-5"
      : recipe.textPosition === "center"
        ? "items-center"
        : "items-end pb-5";

  const editorChanged =
    recipe.trimStart > 0 ||
    (selected?.duration_seconds != null &&
      recipe.trimEnd != null &&
      recipe.trimEnd < selected.duration_seconds - 0.05) ||
    recipe.speed !== 1 ||
    recipe.volume !== 1 ||
    recipe.muted ||
    recipe.aspect !== "original" ||
    recipe.fit !== "contain" ||
    recipe.rotation !== 0 ||
    recipe.brightness !== 100 ||
    recipe.contrast !== 100 ||
    recipe.saturation !== 100 ||
    Boolean(recipe.text.trim());

  return (
    <div className="ocean-page space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Creative Studio
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Video Maker</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Choose a clip, shape it with non-destructive editing controls, save the edit setup, then
            carry it into Create Post for publishing review.
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

      <section className="surface-card p-4 sm:p-5" aria-label="Video Maker tools">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            ["trim", "Trim", SlidersHorizontal],
            ["canvas", "Canvas", ImageIcon],
            ["adjust", "Adjust", Gauge],
            ["text", "Text", Type],
            ["audio", "Audio", Volume2],
          ].map(([key, label, Icon]) => (
            <button
              key={key as string}
              type="button"
              disabled={!selected}
              onClick={() => setEditorTab(key as typeof editorTab)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold",
                editorTab === key
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border bg-background/40 text-muted-foreground",
                !selected && "opacity-50",
              )}
            >
              <Icon className="h-4 w-4" /> {label as string}
            </button>
          ))}
        </div>

        {!selected ? (
          <p className="mt-4 text-sm text-muted-foreground">Choose a clip to unlock the editing tools.</p>
        ) : (
          <div className="mt-4 rounded-2xl border border-border bg-background/30 p-4">
            {editorTab === "trim" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Trim & speed</p>
                    <p className="text-xs text-muted-foreground">Set the section you want to work with and preview its playback speed.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={resetRecipe}><RotateCcw /> Reset</Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-medium">Start
                    <input type="number" min={0} max={recipe.trimEnd ?? selected.duration_seconds ?? 0} step="0.1" value={recipe.trimStart}
                      onChange={(e)=>updateRecipe({trimStart:Math.max(0,Number(e.target.value)||0)})}
                      className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
                  </label>
                  <label className="text-xs font-medium">End
                    <input type="number" min={recipe.trimStart} max={selected.duration_seconds ?? undefined} step="0.1"
                      value={recipe.trimEnd ?? selected.duration_seconds ?? 0}
                      onChange={(e)=>updateRecipe({trimEnd:Math.max(recipe.trimStart,Number(e.target.value)||0)})}
                      className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
                  </label>
                  <label className="text-xs font-medium">Speed
                    <select value={recipe.speed} onChange={(e)=>updateRecipe({speed:Number(e.target.value)})}
                      className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
                      {[0.5,0.75,1,1.25,1.5,2].map(v=><option key={v} value={v}>{v}×</option>)}
                    </select>
                  </label>
                </div>
              </div>
            )}
            {editorTab === "canvas" && (
              <div className="space-y-4">
                <div>
                  <p className="font-semibold">Canvas & framing</p>
                  <p className="text-xs text-muted-foreground">Preview the clip for vertical, square, portrait, or landscape social layouts.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["original","9:16","1:1","4:5","16:9"] as const).map(aspect=>(
                    <Button key={aspect} size="sm" variant={recipe.aspect===aspect?"secondary":"outline"} onClick={()=>updateRecipe({aspect})}>{aspect}</Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={recipe.fit==="contain"?"secondary":"outline"} onClick={()=>updateRecipe({fit:"contain"})}>Fit</Button>
                  <Button variant={recipe.fit==="cover"?"secondary":"outline"} onClick={()=>updateRecipe({fit:"cover"})}>Fill</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([0,90,180,270] as const).map(rotation=>(
                    <Button key={rotation} size="sm" variant={recipe.rotation===rotation?"secondary":"outline"} onClick={()=>updateRecipe({rotation})}>
                      {rotation===0 ? "No rotation" : `${rotation}°`}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {editorTab === "adjust" && (
              <div className="space-y-4">
                {[
                  ["Brightness","brightness",recipe.brightness],
                  ["Contrast","contrast",recipe.contrast],
                  ["Saturation","saturation",recipe.saturation],
                ].map(([label,key,value])=>(
                  <label key={key as string} className="block text-xs font-medium">
                    <span className="flex justify-between"><span>{label}</span><span>{value}%</span></span>
                    <input className="mt-2 w-full" type="range" min={50} max={150} step={1} value={value as number}
                      onChange={(e)=>updateRecipe({[key as "brightness"|"contrast"|"saturation"]:Number(e.target.value)} as Partial<VideoEditRecipe>)}/>
                  </label>
                ))}
              </div>
            )}
            {editorTab === "text" && (
              <div className="space-y-3">
                <label className="text-xs font-medium">Overlay text
                  <textarea value={recipe.text} onChange={(e)=>updateRecipe({text:e.target.value})} maxLength={120} rows={3}
                    placeholder="Add optional on-screen text"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"/>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["top","center","bottom"] as const).map(position=>(
                    <Button key={position} size="sm" className="capitalize" variant={recipe.textPosition===position?"secondary":"outline"} onClick={()=>updateRecipe({textPosition:position})}>{position}</Button>
                  ))}
                </div>
              </div>
            )}
            {editorTab === "audio" && (
              <div className="space-y-4">
                <Button variant={recipe.muted?"secondary":"outline"} onClick={()=>updateRecipe({muted:!recipe.muted})}>
                  {recipe.muted ? <VolumeX /> : <Volume2 />} {recipe.muted ? "Muted" : "Mute clip"}
                </Button>
                <label className="block text-xs font-medium">
                  <span className="flex justify-between"><span>Volume</span><span>{Math.round(recipe.volume*100)}%</span></span>
                  <input className="mt-2 w-full" type="range" min={0} max={1} step={0.05} value={recipe.volume} disabled={recipe.muted}
                    onChange={(e)=>updateRecipe({volume:Number(e.target.value)})}/>
                </label>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {editorChanged ? "Edit setup changed." : "No edits applied yet."}
              </p>
              <Button onClick={() => void saveRecipe()} disabled={!recipeDirty || savingRecipe}>
                {savingRecipe ? <Loader2 className="animate-spin" /> : <Save />} Save edit setup
              </Button>
            </div>
          </div>
        )}
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
                <div className={cn("relative mx-auto flex max-h-[70vh] w-full overflow-hidden rounded-2xl bg-black", previewAspectClass)}>
                  <video
                    ref={videoRef}
                    key={`${selected.id}-${previewAttempt}`}
                    controls
                    playsInline
                    preload="metadata"
                    src={previewUrl}
                    muted={recipe.muted}
                    style={{
                      objectFit: recipe.fit,
                      filter: `brightness(${recipe.brightness}%) contrast(${recipe.contrast}%) saturate(${recipe.saturation}%)`,
                      transform: `rotate(${recipe.rotation}deg)`,
                    }}
                    onLoadedMetadata={(event) => {
                      const video = event.currentTarget;
                      video.playbackRate = recipe.speed;
                      video.volume = recipe.volume;
                      video.muted = recipe.muted;
                      if (recipe.trimStart > 0 && recipe.trimStart < video.duration) video.currentTime = recipe.trimStart;
                      if (recipe.trimEnd == null) updateRecipe({ trimEnd: video.duration });
                    }}
                    onTimeUpdate={(event) => {
                      const video = event.currentTarget;
                      video.playbackRate = recipe.speed;
                      video.volume = recipe.volume;
                      video.muted = recipe.muted;
                      if (recipe.trimEnd != null && video.currentTime >= recipe.trimEnd) {
                        video.pause();
                        video.currentTime = recipe.trimStart;
                      }
                    }}
                    onError={() => {
                      if (previewMode === "direct" && directPreviewUrl) {
                        setPreviewError("Direct playback failed. Preparing a local preview fallback…");
                        void prepareLocalPreview();
                      } else {
                        setPreviewError(
                          "This browser still cannot decode this clip after the local preview fallback. The original remains selected and can still be added to a post.",
                        );
                      }
                    }}
                    className="h-full w-full"
                  />
                  {recipe.text.trim() && (
                    <div className={cn("pointer-events-none absolute inset-0 flex justify-center px-5", overlayPositionClass)}>
                      <span className="max-w-[90%] rounded-xl bg-black/55 px-3 py-2 text-center text-lg font-bold text-white shadow-lg">
                        {recipe.text}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/5 p-6 text-center">
                  <CircleAlert className="h-9 w-9 text-amber-300" />
                  <p className="mt-3 font-semibold">Preview unavailable</p>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">{previewError}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPreviewAttempt((attempt) => attempt + 1)}
                    >
                      <RotateCw /> Retry original
                    </Button>
                    {directPreviewUrl && (
                      <Button onClick={() => void prepareLocalPreview()} disabled={previewPending}>
                        {previewPending ? <Loader2 className="animate-spin" /> : <Film />}
                        Prepare local preview
                      </Button>
                    )}
                  </div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    Selected clip
                  </p>
                  <p className="truncate font-semibold">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{videoDetails(selected)}</p>
                  {previewMode === "local_fallback" && (
                    <p className="mt-1 text-[11px] font-medium text-emerald-300">
                      Playing from a temporary on-device preview.
                    </p>
                  )}
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button variant="outline" onClick={() => continueToPost("story")}>
                    <Play /> Continue to Story
                  </Button>
                  <Button onClick={() => continueToPost("feed")}>
                    <Play /> Continue to Feed
                  </Button>
                </div>
              </div>
              <p className="mt-3 rounded-xl border border-border bg-surface/40 p-3 text-xs text-muted-foreground">
                Video Maker now saves non-destructive edit settings with the clip. Create Post still
                uses the original media file until WaveOS has a rendered-output pipeline, so nothing is
                silently altered or published.
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
