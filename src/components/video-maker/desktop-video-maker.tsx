import { Check, CircleAlert, Film, Gauge, ImageIcon, Loader2, Play, RotateCcw, RotateCw, Save, SlidersHorizontal, Type, Upload, Video, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getMediaPreviewUrl,
  useMediaAssets,
  useUploadAsset,
  type MediaAsset,
} from "@/hooks/use-media";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { DEFAULT_VIDEO_RECIPE, VIDEO_LOOKS, VIDEO_SPEEDS, videoRecipeFilter, activeCaptionCue, type VideoEditRecipe } from "@/lib/video-edit-recipe";
import { TranscriptPanel } from "@/components/media/transcript-panel";
import { useMediaTranscripts, useTranscriptRunner, useSaveTranscriptEdits } from "@/hooks/use-media-transcripts";
import { effectiveTranscript, captionCuesFromSegments } from "@/lib/transcript-audio";
import type { VideoMakerController } from "@/components/video-maker/use-video-maker";

const DEFAULT_RECIPE = DEFAULT_VIDEO_RECIPE;

/** Existing desktop Video Maker layout, driven by the shared clip and edit logic. */
export function DesktopVideoMaker({ controller }: { controller: VideoMakerController }) {
  const {
    navigate,
    activeWorkspace,
    workspaceId,
    videos,
    upload,
    inputRef,
    previewRef,
    videoRef,
    selected,
    setSelected,
    previewUrl,
    setPreviewUrl,
    directPreviewUrl,
    setDirectPreviewUrl,
    previewPending,
    setPreviewPending,
    previewMode,
    setPreviewMode,
    blobPreviewRef,
    previewError,
    setPreviewError,
    previewAttempt,
    setPreviewAttempt,
    recipe,
    setRecipe,
    recipeDirty,
    setRecipeDirty,
    savingRecipe,
    setSavingRecipe,
    prepareLocalPreview,
    selectVideo,
    continueToPost,
    uploadVideo,
    updateRecipe,
    saveRecipe,
  } = controller;
  const [editorTab, setEditorTab] = useState<"trim" | "canvas" | "adjust" | "text" | "audio" | "captions">("trim");
  const transcripts = useMediaTranscripts(workspaceId, selected ? [selected.id] : []);
  const runner = useTranscriptRunner(workspaceId);
  const saveTranscript = useSaveTranscriptEdits(workspaceId);
  const transcript = selected ? transcripts.data?.[selected.id] : undefined;
  const [playhead, setPlayhead] = useState(0);
  const cue = activeCaptionCue(recipe.captions, playhead);
  function seek(seconds: number) {
    if (videoRef.current) videoRef.current.currentTime = seconds;
    setPlayhead(seconds);
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
    <div className="ocean-page flex flex-col gap-5">
      <header className="order-1 flex flex-wrap items-start justify-between gap-3">
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

      <section className="order-2 rounded-2xl border border-border bg-surface/70 p-3 lg:hidden">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-primary" />
          <label htmlFor="mobile-video-picker" className="text-sm font-semibold">Clip</label>
        </div>
        <select
          id="mobile-video-picker"
          value={selected?.id ?? ""}
          onChange={(event) => {
            const asset = (videos.data ?? []).find((item) => item.id === event.target.value);
            if (asset) selectVideo(asset);
          }}
          className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">Choose a video…</option>
          {(videos.data ?? []).map((asset) => (
            <option key={asset.id} value={asset.id}>{asset.name}</option>
          ))}
        </select>
      </section>

      <section className="order-4 surface-card p-4 sm:p-5 lg:order-2" aria-label="Video Maker tools">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            ["trim", "Trim", SlidersHorizontal],
            ["canvas", "Size", ImageIcon],
            ["adjust", "Look", Gauge],
            ["text", "Text", Type],
            ["audio", "Sound", Volume2],
            ["captions", "Captions", Type],
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
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Trim</p>
                    <p className="text-xs text-muted-foreground">Choose where the clip starts and ends.</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={resetRecipe}><RotateCcw /> Reset</Button>
                </div>
                <div className="rounded-2xl border border-border bg-black/15 p-4">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{formatDuration(recipe.trimStart)}</span>
                    <span className="text-muted-foreground">
                      {formatDuration(Math.max(0, (recipe.trimEnd ?? selected.duration_seconds ?? 0) - recipe.trimStart))} selected
                    </span>
                    <span>{formatDuration(recipe.trimEnd ?? selected.duration_seconds ?? 0)}</span>
                  </div>
                  <label className="mt-4 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Start
                    <input
                      className="mt-2 w-full accent-primary"
                      type="range"
                      min={0}
                      max={Math.max(0.1, (recipe.trimEnd ?? selected.duration_seconds ?? 0) - 0.1)}
                      step={0.1}
                      value={recipe.trimStart}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        updateRecipe({ trimStart: value });
                        if (videoRef.current) videoRef.current.currentTime = value;
                      }}
                    />
                  </label>
                  <label className="mt-4 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    End
                    <input
                      className="mt-2 w-full accent-primary"
                      type="range"
                      min={Math.min((selected.duration_seconds ?? 0), recipe.trimStart + 0.1)}
                      max={selected.duration_seconds ?? recipe.trimEnd ?? 0}
                      step={0.1}
                      value={recipe.trimEnd ?? selected.duration_seconds ?? 0}
                      onChange={(e) => updateRecipe({ trimEnd: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <div>
                  <p className="text-xs font-medium">Speed</p>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {VIDEO_SPEEDS.map((speed) => (
                      <Button
                        key={speed}
                        size="sm"
                        variant={recipe.speed === speed ? "secondary" : "outline"}
                        onClick={() => updateRecipe({ speed })}
                      >
                        {speed}×
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {editorTab === "canvas" && (
              <div className="space-y-4">
                <div>
                  <p className="font-semibold">Size & framing</p>
                  <p className="text-xs text-muted-foreground">Pick where this video is going. WaveOS handles the ratio.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["original", "Original"],
                    ["9:16", "Reel / Story"],
                    ["1:1", "Square"],
                    ["4:5", "Portrait"],
                    ["16:9", "Landscape"],
                  ] as const).map(([aspect, label]) => (
                    <Button
                      key={aspect}
                      className="h-auto min-h-14 whitespace-normal"
                      variant={recipe.aspect === aspect ? "secondary" : "outline"}
                      onClick={() => updateRecipe({ aspect })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-medium">How should it fit?</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button variant={recipe.fit==="contain"?"secondary":"outline"} onClick={()=>updateRecipe({fit:"contain"})}>Show full video</Button>
                    <Button variant={recipe.fit==="cover"?"secondary":"outline"} onClick={()=>updateRecipe({fit:"cover"})}>Fill screen</Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium">Rotate</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => updateRecipe({ rotation: ((recipe.rotation + 270) % 360) as VideoEditRecipe["rotation"] })}>
                      <RotateCcw /> Left
                    </Button>
                    <Button variant="outline" onClick={() => updateRecipe({ rotation: ((recipe.rotation + 90) % 360) as VideoEditRecipe["rotation"] })}>
                      <RotateCw /> Right
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {editorTab === "adjust" && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {VIDEO_LOOKS.map((look) => <Button key={look.id} size="sm" variant={recipe.look === look.id ? "secondary" : "outline"} onClick={() => updateRecipe({ look: look.id })}>{look.label}</Button>)}
                </div>
                <div>
                  <p className="font-semibold">Look</p>
                  <p className="text-xs text-muted-foreground">Make quick visual adjustments while watching the preview.</p>
                </div>
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
                <label className="text-xs font-medium">On-screen text
                  <textarea value={recipe.text} onChange={(e)=>updateRecipe({text:e.target.value})} maxLength={120} rows={3}
                    placeholder="Type text to show on the video"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"/>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["top","center","bottom"] as const).map(position=>(
                    <Button key={position} size="sm" className="capitalize" variant={recipe.textPosition===position?"secondary":"outline"} onClick={()=>updateRecipe({textPosition:position})}>{position}</Button>
                  ))}
                </div>
              </div>
            )}
            {editorTab === "captions" && (
              <div className="space-y-3">
                {transcripts.isError && <p role="alert" className="text-sm text-destructive">Saved transcripts could not be loaded.</p>}
                <TranscriptPanel transcript={transcript} run={runner.runs[selected.id]} canStart={!transcripts.isPending && !transcripts.isError && !runner.isRunning(selected.id)} onStart={() => void runner.start(selected)} onSave={(input) => saveTranscript({ mediaAssetId: selected.id, ...input })} onSeek={seek} actions={transcript?.status === "completed" && effectiveTranscript(transcript).hasTimestamps ? <Button size="sm" onClick={() => {
                  const cues = captionCuesFromSegments(effectiveTranscript(transcript).segments, recipe.trimStart, recipe.trimEnd ?? selected.duration_seconds ?? 0);
                  updateRecipe({ captions: cues });
                }}>Use as captions</Button> : null} />
                <Button size="sm" variant="outline" onClick={() => {
                  const start = Math.max(recipe.trimStart, playhead);
                  const end = Math.min(start + 3, recipe.trimEnd ?? selected.duration_seconds ?? start + 3);
                  if (end > start) updateRecipe({ captions: [...recipe.captions, { id: crypto.randomUUID(), start, end, text: "" }] });
                }}>Add caption</Button>
                {recipe.captions.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => seek(item.start)}>{formatDuration(item.start)} → {formatDuration(item.end)}</Button>
                  <input aria-label={`Caption at ${formatDuration(item.start)}`} value={item.text} maxLength={160} className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" onChange={(event) => updateRecipe({ captions: recipe.captions.map((caption) => caption.id === item.id ? { ...caption, text: event.target.value } : caption) })} />
                  <Button size="sm" variant="ghost" onClick={() => updateRecipe({ captions: recipe.captions.filter((caption) => caption.id !== item.id) })}>Remove caption</Button>
                </div>)}
              </div>
            )}
            {editorTab === "audio" && (
              <div className="space-y-4">
                <p className="font-semibold">Sound</p>
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
                {savingRecipe ? <Loader2 className="animate-spin" /> : <Save />} Save changes
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="order-3 grid gap-5 lg:order-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
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
                      filter: videoRecipeFilter(recipe),
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
                      setPlayhead(video.currentTime);
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
                  {cue && <div className="pointer-events-none absolute inset-x-4 bottom-16 text-center"><span className="rounded-md bg-background/90 px-3 py-2 text-lg font-semibold text-foreground">{cue.text}</span></div>}
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
                Live preview · not rendered. Save changes keeps the edit setup with this clip.
                Create Post uses the original clip until rendered-output support is available.
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

        <section className="surface-card hidden p-4 sm:p-5 lg:block" aria-label="Video library">
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

