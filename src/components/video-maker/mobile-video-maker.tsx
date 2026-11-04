import {
  Captions,
  Check,
  CircleAlert,
  Crop,
  Film,
  Gauge,
  Info,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Trash2,
  Type,
  Upload,
  Video,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getMediaPreview,
  getMediaPreviewUrl,
  useMediaAssets,
  useUploadAsset,
  type MediaAsset,
} from "@/hooks/use-media";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { sampleVideoFrames } from "@/lib/video-frame-sampler";
import {
  DEFAULT_VIDEO_RECIPE,
  VIDEO_LOOKS,
  VIDEO_SPEEDS,
  activeCaptionCue,
  formatClipTime,
  normalizeVideoRecipe,
  videoAspectRatio,
  videoRecipeFilter,
  videoRecipeHasEdits,
  type VideoCaptionCue,
  type VideoEditRecipe,
} from "@/lib/video-edit-recipe";
import type { VideoMakerController } from "@/components/video-maker/use-video-maker";
import { TranscriptPanel } from "@/components/media/transcript-panel";
import {
  transcribableMedia,
  useMediaTranscripts,
  useSaveTranscriptEdits,
  useTranscriptRunner,
} from "@/hooks/use-media-transcripts";
import { captionCuesFromSegments, effectiveTranscript } from "@/lib/transcript-audio";

type EditorTab = "trim" | "speed" | "captions" | "text" | "look" | "aspect" | "audio";

const EDITOR_TABS: ReadonlyArray<[EditorTab, string, typeof Scissors]> = [
  ["trim", "Trim", Scissors],
  ["speed", "Speed", Gauge],
  ["captions", "Captions", Captions],
  ["text", "Text", Type],
  ["look", "Look", Wand2],
  ["aspect", "Aspect", Crop],
  ["audio", "Sound", Volume2],
];


/** Mobile and tablet editor: preview beside trim timeline and tool tabs. */
export function MobileVideoMaker({ controller }: { controller: VideoMakerController }) {
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
  const [editorTab, setEditorTab] = useState<EditorTab>("trim");
  const transcriptQuery = useMediaTranscripts(workspaceId, selected && transcribableMedia(selected) ? [selected.id] : []);
  const transcriptRunner = useTranscriptRunner(workspaceId);
  const saveTranscriptEdits = useSaveTranscriptEdits(workspaceId);
  const transcript = selected ? transcriptQuery.data?.[selected.id] : undefined;
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [framesState, setFramesState] = useState<"idle" | "sampling" | "ready" | "unavailable">("idle");
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setMediaDuration(null);
  }, [selected?.id]);

  useEffect(() => {
    let active = true;
    setFrames([]);
    if (!previewUrl || previewPending) {
      setFramesState("idle");
      return;
    }
    setFramesState("sampling");
    void sampleVideoFrames(previewUrl, 8).then((result) => {
      if (!active) return;
      setFrames(result);
      setFramesState(result.length ? "ready" : "unavailable");
    });
    return () => {
      active = false;
    };
  }, [previewUrl, previewPending]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = recipe.speed;
    video.volume = recipe.volume;
    video.muted = recipe.muted;
  }, [recipe.speed, recipe.volume, recipe.muted, previewUrl]);


  function resetRecipe() {
    setRecipe({ ...DEFAULT_VIDEO_RECIPE, trimEnd: duration || null });
    setRecipeDirty(true);
    seek(0);
  }


  const duration = selected?.duration_seconds ?? mediaDuration ?? 0;
  const trimEnd = recipe.trimEnd ?? duration;
  const selectedLength = Math.max(0, trimEnd - recipe.trimStart);
  const editorChanged = selected ? videoRecipeHasEdits(recipe, duration || null) : false;
  const ratio = videoAspectRatio(recipe.aspect, selected?.width ?? null, selected?.height ?? null);
  const filter = videoRecipeFilter(recipe);
  const cue = activeCaptionCue(recipe.captions, currentTime);
  const playerReady = Boolean(selected && previewUrl && !previewError && !previewPending);

  function seek(time: number) {
    const video = videoRef.current;
    const next = Math.min(Math.max(0, time), duration || time);
    if (video) video.currentTime = next;
    setCurrentTime(next);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    if (video.currentTime < recipe.trimStart || (trimEnd > 0 && video.currentTime >= trimEnd - 0.05)) {
      video.currentTime = recipe.trimStart;
    }
    void video.play().catch(() => toast.error("This browser blocked playback. Tap play again."));
  }

  function setTrimStart(value: number) {
    const next = Math.max(0, Math.min(value, trimEnd - 0.1));
    updateRecipe({ trimStart: Number(next.toFixed(2)) });
    seek(next);
  }

  function setTrimEnd(value: number) {
    const next = Math.min(duration || value, Math.max(value, recipe.trimStart + 0.1));
    updateRecipe({ trimEnd: Number(next.toFixed(2)) });
    seek(next);
  }

  function useTranscriptAsCaptions() {
    if (!transcript) return;
    const view = effectiveTranscript(transcript);
    const cues = captionCuesFromSegments(view.segments, recipe.trimStart, trimEnd);
    if (!cues.length) {
      toast.error("No transcript text falls inside the trimmed part of the clip.");
      return;
    }
    updateRecipe({ captions: cues });
    toast.success(`Added ${cues.length} caption${cues.length === 1 ? "" : "s"} from the transcript. Timing within each section is estimated.`);
  }

  function addCaption() {
    const start = Math.min(Math.max(currentTime, recipe.trimStart), trimEnd);
    const end = Math.min(start + 3, trimEnd);
    if (end - start < 0.3) {
      toast.error("Move the playhead earlier in the clip to add a caption.");
      return;
    }
    const nextCue: VideoCaptionCue = { id: `cue-${Date.now()}`, start, end, text: "" };
    updateRecipe({ captions: [...recipe.captions, nextCue].sort((a, b) => a.start - b.start) });
  }

  function updateCaption(id: string, patch: Partial<VideoCaptionCue>) {
    updateRecipe({
      captions: recipe.captions
        .map((item) => {
          if (item.id !== id) return item;
          const merged = { ...item, ...patch };
          if (merged.end <= merged.start) merged.end = Math.min(merged.start + 0.5, duration || merged.start + 0.5);
          return merged;
        })
        .sort((a, b) => a.start - b.start),
    });
  }

  function removeCaption(id: string) {
    updateRecipe({ captions: recipe.captions.filter((item) => item.id !== id) });
  }

  const overlayPositionClass =
    recipe.textPosition === "top"
      ? "items-start pt-5"
      : recipe.textPosition === "center"
        ? "items-center"
        : cue
          ? "items-end pb-16"
          : "items-end pb-5";

  return (
    <div className="ocean-page flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ocean-eyebrow">Creative Studio</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Video Maker</h1>
          <p className="mt-1 hidden max-w-2xl text-sm text-muted-foreground sm:block">
            Trim, frame, caption and style a clip with a live preview. Your edits are saved as a
            setup with the clip — WaveOS does not render a new video file yet.
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
          <span className="hidden sm:inline">Upload video</span>
          <span className="sm:hidden">Upload</span>
        </Button>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          onChange={uploadVideo}
        />
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <section className="wave-panel p-3 lg:hidden" aria-label="Choose a clip">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Video className="h-4 w-4 text-neon-cyan" /> Choose a clip
              </h2>
              <span className="text-[11px] text-muted-foreground">
                {(videos.data ?? []).length} video{(videos.data ?? []).length === 1 ? "" : "s"}
              </span>
            </div>
            <ClipLibraryStrip
              videos={videos.data ?? []}
              loading={videos.isPending}
              failed={videos.isError}
              selectedId={selected?.id ?? null}
              onSelect={selectVideo}
            />
          </section>

          <section
            ref={previewRef}
            className="wave-panel scroll-mt-24 overflow-hidden p-3 sm:p-4"
            aria-label="Video preview"
          >
            {selected ? (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="ocean-status gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-neon-cyan" /> Live preview · not rendered
                  </span>
                  {previewMode === "local_fallback" && (
                    <span className="text-[11px] font-medium text-success">
                      Playing from a temporary on-device preview.
                    </span>
                  )}
                </div>
                {previewPending ? (
                  <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl bg-stage text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-neon-cyan" />
                    <p className="mt-3 font-semibold">Opening {selected.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Preparing a secure preview…</p>
                  </div>
                ) : previewUrl && !previewError ? (
                  <div className="flex justify-center [--stage-h:48vh] lg:[--stage-h:62vh]">
                    <div
                      className="relative overflow-hidden rounded-2xl bg-stage"
                      style={{ aspectRatio: String(ratio), width: `min(100%, calc(var(--stage-h) * ${ratio}))` }}
                    >
                      <video
                        ref={videoRef}
                        key={`${selected.id}-${previewAttempt}-${previewMode}`}
                        playsInline
                        preload="metadata"
                        src={previewUrl}
                        muted={recipe.muted}
                        onClick={togglePlay}
                        style={{
                          objectFit: recipe.fit,
                          filter,
                          transform: `rotate(${recipe.rotation}deg)`,
                        }}
                        onLoadedMetadata={(event) => {
                          const video = event.currentTarget;
                          video.playbackRate = recipe.speed;
                          video.volume = recipe.volume;
                          video.muted = recipe.muted;
                          if (Number.isFinite(video.duration)) setMediaDuration(video.duration);
                          if (recipe.trimStart > 0 && recipe.trimStart < video.duration) video.currentTime = recipe.trimStart;
                          setRecipe((current) =>
                            current.trimEnd == null && Number.isFinite(video.duration)
                              ? { ...current, trimEnd: video.duration }
                              : current,
                          );
                        }}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onTimeUpdate={(event) => {
                          const video = event.currentTarget;
                          setCurrentTime(video.currentTime);
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
                        className="h-full w-full cursor-pointer"
                      />
                      {recipe.text.trim() && (
                        <div className={cn("pointer-events-none absolute inset-0 flex justify-center px-5", overlayPositionClass)}>
                          <span className="max-w-[90%] rounded-xl bg-background/60 px-3 py-2 text-center text-lg font-bold text-foreground shadow-lg">
                            {recipe.text}
                          </span>
                        </div>
                      )}
                      {cue && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
                          <span className="max-w-[92%] rounded-lg bg-background/75 px-2.5 py-1 text-center text-sm font-semibold text-foreground">
                            {cue.text}
                          </span>
                        </div>
                      )}
                      {!playing && (
                        <button
                          type="button"
                          onClick={togglePlay}
                          aria-label="Play preview"
                          className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background/60 text-foreground backdrop-blur"
                        >
                          <Play className="h-6 w-6 translate-x-0.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-warning/25 bg-warning/5 p-6 text-center">
                    <CircleAlert className="h-9 w-9 text-warning" />
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

                <div className="mt-3 flex items-center gap-3">
                  <Button
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-full"
                    onClick={togglePlay}
                    disabled={!playerReady}
                    aria-label={playing ? "Pause preview" : "Play preview"}
                  >
                    {playing ? <Pause /> : <Play />}
                  </Button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{selected.name}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatClipTime(currentTime)} / {formatClipTime(duration)} · {formatClipTime(selectedLength)} selected
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-11 w-11 shrink-0 rounded-full"
                    aria-label={recipe.muted ? "Unmute clip" : "Mute clip"}
                    onClick={() => updateRecipe({ muted: !recipe.muted })}
                  >
                    {recipe.muted ? <VolumeX /> : <Volume2 />}
                  </Button>
                </div>

                {duration > 0 && (
                  <TrimTimeline
                    duration={duration}
                    start={recipe.trimStart}
                    end={trimEnd}
                    current={currentTime}
                    frames={frames}
                    framesState={framesState}
                    filter={filter}
                    onStart={setTrimStart}
                    onEnd={setTrimEnd}
                    onSeek={seek}
                  />
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-neon-cyan/30 bg-neon-cyan/5 p-8 text-center"
              >
                <Film className="h-10 w-10 text-neon-cyan" />
                <span className="mt-3 font-semibold">Choose a video to begin</span>
                <span className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Pick a clip above, or tap here to upload one. Preview the exact clip before it reaches the post composer.
                </span>
              </button>
            )}
          </section>

          <section className="wave-panel p-3 sm:p-4" aria-label="Video Maker tools">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Editing tools">
              {EDITOR_TABS.map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={editorTab === key}
                  disabled={!selected}
                  onClick={() => setEditorTab(key)}
                  className={cn(
                    "flex min-h-14 min-w-[2.75rem] flex-1 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border px-0.5 text-[10px] font-semibold sm:text-[11px]",
                    editorTab === key
                      ? "border-neon-cyan/50 bg-neon-cyan/10 text-foreground neon-glow"
                      : "border-transparent text-muted-foreground",
                    !selected && "opacity-50",
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            {!selected ? (
              <p className="mt-3 text-sm text-muted-foreground">Choose a clip to unlock the editing tools.</p>
            ) : (
              <div className="mt-3 rounded-2xl border border-border bg-background/30 p-4">
                {editorTab === "trim" && (
                  <div className="space-y-4">
                    <PanelHeading title="Trim" detail="Drag the cyan handles on the timeline, or set them from the playhead.">
                      <Button size="sm" variant="ghost" onClick={resetRecipe}><RotateCcw /> Reset all</Button>
                    </PanelHeading>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" className="h-auto min-h-12 flex-col gap-0.5" onClick={() => setTrimStart(currentTime)}>
                        <span>Start here</span>
                        <span className="text-[11px] font-normal text-muted-foreground">{formatClipTime(recipe.trimStart)}</span>
                      </Button>
                      <Button variant="outline" className="h-auto min-h-12 flex-col gap-0.5" onClick={() => setTrimEnd(currentTime)}>
                        <span>End here</span>
                        <span className="text-[11px] font-normal text-muted-foreground">{formatClipTime(trimEnd)}</span>
                      </Button>
                    </div>
                  </div>
                )}

                {editorTab === "speed" && (
                  <div className="space-y-4">
                    <PanelHeading
                      title="Speed"
                      detail={`At ${recipe.speed}× the selected part plays for about ${formatClipTime(selectedLength / recipe.speed)}.`}
                    />
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {VIDEO_SPEEDS.map((speed) => (
                        <Button
                          key={speed}
                          variant={recipe.speed === speed ? "secondary" : "outline"}
                          className={cn("min-h-11", recipe.speed === speed && "border-neon-cyan/50")}
                          onClick={() => updateRecipe({ speed })}
                        >
                          {speed}×
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {editorTab === "captions" && (
                  <div className="space-y-3">
                    <PanelHeading title="Captions" detail="Add timed captions by hand. Each caption starts at the playhead.">
                      <Button size="sm" onClick={addCaption}><Plus /> Add</Button>
                    </PanelHeading>
                    <TranscriptPanel
                      transcript={transcript}
                      run={transcriptRunner.runs[selected.id]}
                      canStart={!transcriptRunner.isRunning(selected.id)}
                      onStart={() => void transcriptRunner.start(selected)}
                      onSave={(input) => saveTranscriptEdits({ mediaAssetId: selected.id, ...input })}
                      onSeek={seek}
                      actions={
                        transcript?.status === "completed" && effectiveTranscript(transcript).hasTimestamps ? (
                          <Button size="sm" variant="secondary" onClick={useTranscriptAsCaptions}>
                            <Captions /> Use as captions
                          </Button>
                        ) : null
                      }
                    />
                    {recipe.captions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No captions yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {recipe.captions.map((item) => (
                          <li
                            key={item.id}
                            className={cn(
                              "rounded-xl border bg-surface/40 p-3",
                              cue?.id === item.id ? "border-neon-cyan/50" : "border-border",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-muted-foreground">
                              <button type="button" className="underline-offset-2 hover:underline" onClick={() => seek(item.start)}>
                                {formatClipTime(item.start)} → {formatClipTime(item.end)}
                              </button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Delete caption" onClick={() => removeCaption(item.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <input
                              value={item.text}
                              maxLength={160}
                              placeholder="Caption text"
                              onChange={(event) => updateCaption(item.id, { text: event.target.value })}
                              className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                            />
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <Button size="sm" variant="outline" onClick={() => updateCaption(item.id, { start: currentTime })}>
                                Start at playhead
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => updateCaption(item.id, { end: currentTime })}>
                                End at playhead
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {editorTab === "text" && (
                  <div className="space-y-3">
                    <PanelHeading title="Text" detail="One headline shown over the whole clip." />
                    <textarea
                      value={recipe.text}
                      onChange={(event) => updateRecipe({ text: event.target.value })}
                      maxLength={120}
                      rows={2}
                      aria-label="On-screen text"
                      placeholder="Type text to show on the video"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {(["top", "center", "bottom"] as const).map((position) => (
                        <Button
                          key={position}
                          size="sm"
                          className="capitalize"
                          variant={recipe.textPosition === position ? "secondary" : "outline"}
                          onClick={() => updateRecipe({ textPosition: position })}
                        >
                          {position}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {editorTab === "look" && (
                  <div className="space-y-4">
                    <PanelHeading title="Look" detail="Pick a look, then fine-tune it while watching the preview." />
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                      {VIDEO_LOOKS.map((look) => (
                        <button
                          key={look.id}
                          type="button"
                          onClick={() => updateRecipe({ look: look.id })}
                          aria-pressed={recipe.look === look.id}
                          className={cn(
                            "w-16 shrink-0 rounded-xl border p-1 text-[11px] font-semibold",
                            recipe.look === look.id ? "border-neon-cyan/60 text-foreground" : "border-border text-muted-foreground",
                          )}
                        >
                          <span className="block aspect-square overflow-hidden rounded-lg bg-stage">
                            {frames[0] ? (
                              <img
                                src={frames[Math.min(3, frames.length - 1)]}
                                alt=""
                                className="h-full w-full object-cover"
                                style={{ filter: videoRecipeFilter({ ...recipe, look: look.id }) }}
                              />
                            ) : (
                              <span className="flex h-full items-center justify-center"><Wand2 className="h-4 w-4" /></span>
                            )}
                          </span>
                          <span className="mt-1 block">{look.label}</span>
                        </button>
                      ))}
                    </div>
                    {([
                      ["Brightness", "brightness", 50, 150],
                      ["Contrast", "contrast", 50, 150],
                      ["Saturation", "saturation", 0, 200],
                    ] as const).map(([label, key, min, max]) => (
                      <label key={key} className="block text-xs font-medium">
                        <span className="flex justify-between"><span>{label}</span><span>{recipe[key]}%</span></span>
                        <input
                          className="mt-2 w-full accent-primary"
                          type="range"
                          min={min}
                          max={max}
                          step={1}
                          value={recipe[key]}
                          onChange={(event) => updateRecipe({ [key]: Number(event.target.value) } as Partial<VideoEditRecipe>)}
                        />
                      </label>
                    ))}
                  </div>
                )}

                {editorTab === "aspect" && (
                  <div className="space-y-4">
                    <PanelHeading title="Size & framing" detail="Pick where this video is going. The preview reshapes to match." />
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {([
                        ["original", "Original"],
                        ["9:16", "Reel / Story"],
                        ["1:1", "Square"],
                        ["4:5", "Portrait"],
                        ["16:9", "Landscape"],
                      ] as const).map(([aspect, label]) => (
                        <Button
                          key={aspect}
                          className="h-auto min-h-14 flex-col gap-0.5 whitespace-normal"
                          variant={recipe.aspect === aspect ? "secondary" : "outline"}
                          onClick={() => updateRecipe({ aspect })}
                        >
                          <span>{label}</span>
                          {aspect !== "original" && <span className="text-[10px] font-normal text-muted-foreground">{aspect}</span>}
                        </Button>
                      ))}
                    </div>
                    <div>
                      <p className="text-xs font-medium">How should it fit?</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Button variant={recipe.fit === "contain" ? "secondary" : "outline"} onClick={() => updateRecipe({ fit: "contain" })}>Show full video</Button>
                        <Button variant={recipe.fit === "cover" ? "secondary" : "outline"} onClick={() => updateRecipe({ fit: "cover" })}>Fill screen</Button>
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

                {editorTab === "audio" && (
                  <div className="space-y-4">
                    <PanelHeading title="Sound" detail="Controls the clip's own audio in the preview." />
                    <Button variant={recipe.muted ? "secondary" : "outline"} onClick={() => updateRecipe({ muted: !recipe.muted })}>
                      {recipe.muted ? <VolumeX /> : <Volume2 />} {recipe.muted ? "Muted" : "Mute clip"}
                    </Button>
                    <label className="block text-xs font-medium">
                      <span className="flex justify-between"><span>Volume</span><span>{Math.round(recipe.volume * 100)}%</span></span>
                      <input
                        className="mt-2 w-full accent-primary"
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={recipe.volume}
                        disabled={recipe.muted}
                        onChange={(event) => updateRecipe({ volume: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    {recipeDirty ? "Unsaved edit setup." : editorChanged ? "Edit setup saved with this clip." : "No edits applied yet."}
                  </p>
                  <Button onClick={() => void saveRecipe()} disabled={!recipeDirty || savingRecipe}>
                    {savingRecipe ? <Loader2 className="animate-spin" /> : <Save />} Save changes
                  </Button>
                </div>
              </div>
            )}
          </section>

          {selected && (
            <section className="wave-panel p-3 sm:p-4" aria-label="Preview and export">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-neon-cyan/25 bg-neon-cyan/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Play className="h-4 w-4 text-neon-cyan" /> Preview
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Plays here in your browser with your edits applied on the fly.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface/40 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Film className="h-4 w-4 text-muted-foreground" /> Export · not available yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    WaveOS saves your edit setup with the clip but can't produce an edited video file yet.
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Create Post uses the original clip. Trims, captions, text and looks shown here are not
                included in the published video.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" className="min-h-12" onClick={() => continueToPost("story")}>
                  Continue to Story
                </Button>
                <Button className="min-h-12" onClick={() => continueToPost("feed")}>
                  Continue to Feed
                </Button>
              </div>
            </section>
          )}
        </div>

        <aside className="wave-panel hidden h-fit p-4 lg:sticky lg:top-4 lg:block" aria-label="Video library">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-neon-cyan" />
            <h2 className="font-semibold">Choose a clip</h2>
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
            <div className="mt-4 max-h-[36rem] space-y-2 overflow-y-auto pr-1">
              {(videos.data ?? []).map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => selectVideo(asset)}
                  aria-pressed={selected?.id === asset.id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors",
                    selected?.id === asset.id
                      ? "border-neon-cyan/50 bg-neon-cyan/10"
                      : "border-border bg-surface/40 hover:border-neon-cyan/30",
                  )}
                >
                  <ClipThumb asset={asset} className="h-14 w-14 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{asset.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{videoDetails(asset)}</span>
                    {selected?.id === asset.id && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-neon-cyan">
                        <Check className="h-3.5 w-3.5" /> Selected
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PanelHeading({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {children}
    </div>
  );
}

function ClipLibraryStrip({
  videos,
  loading,
  failed,
  selectedId,
  onSelect,
}: {
  videos: MediaAsset[];
  loading: boolean;
  failed: boolean;
  selectedId: string | null;
  onSelect: (asset: MediaAsset) => void;
}) {
  if (loading) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading videos…
      </p>
    );
  }
  if (failed) {
    return <p className="mt-3 text-sm text-destructive">Videos could not be loaded. Your media was not changed.</p>;
  }
  if (!videos.length) {
    return <p className="mt-3 text-sm text-muted-foreground">No videos yet. Upload an MP4 or MOV to start.</p>;
  }
  return (
    <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
      {videos.map((asset) => (
        <button
          key={asset.id}
          type="button"
          onClick={() => onSelect(asset)}
          aria-pressed={selectedId === asset.id}
          aria-label={`Choose ${asset.name}`}
          className={cn(
            "relative w-20 shrink-0 overflow-hidden rounded-xl border",
            selectedId === asset.id ? "border-neon-cyan ring-2 ring-neon-cyan/30" : "border-border",
          )}
        >
          <ClipThumb asset={asset} className="aspect-[4/5] w-full" />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] text-foreground">
            <span className="line-clamp-1">{asset.name}</span>
            {asset.duration_seconds != null && <span className="text-muted-foreground">{formatClipTime(asset.duration_seconds)}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

function ClipThumb({ asset, className }: { asset: MediaAsset; className?: string }) {
  const [preview, setPreview] = useState<{ url: string | null; image: boolean } | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setBroken(false);
    void getMediaPreview(asset, 3600, "thumbnail")
      .then((result) => {
        if (cancelled) return;
        const image =
          result.kind === "image" ||
          (result.kind !== "video" && asset.source_provider !== "waveos" && Boolean(asset.thumbnail_url));
        setPreview({ url: result.url, image });
      })
      .catch(() => {
        if (!cancelled) setPreview({ url: null, image: false });
      });
    return () => {
      cancelled = true;
    };
  }, [asset]);
  return (
    <span className={cn("block overflow-hidden bg-stage", className)}>
      {preview?.url && !broken ? (
        preview.image ? (
          <img src={preview.url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <video
            src={`${preview.url}#t=0.1`}
            className="pointer-events-none h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            onError={() => setBroken(true)}
          />
        )
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Video className="h-5 w-5" />
        </span>
      )}
    </span>
  );
}

function TrimTimeline({
  duration,
  start,
  end,
  current,
  frames,
  framesState,
  filter,
  onStart,
  onEnd,
  onSeek,
}: {
  duration: number;
  start: number;
  end: number;
  current: number;
  frames: string[];
  framesState: "idle" | "sampling" | "ready" | "unavailable";
  filter: string;
  onStart: (value: number) => void;
  onEnd: (value: number) => void;
  onSeek: (value: number) => void;
}) {
  const pct = (time: number) => `${Math.min(100, Math.max(0, (time / duration) * 100))}%`;

  function seekFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).tagName === "INPUT") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
    onSeek(Math.min(end, Math.max(start, ratio * duration)));
  }

  return (
    <div className="mt-3">
      <div
        onPointerDown={seekFromPointer}
        className="relative h-14 overflow-hidden rounded-xl border border-border bg-stage"
        aria-label="Trim timeline"
      >
        <div className="absolute inset-0 flex">
          {frames.length > 0 ? (
            frames.map((frame, index) => (
              <img key={index} src={frame} alt="" className="h-full min-w-0 flex-1 object-cover" style={{ filter }} />
            ))
          ) : (
            <div className="h-full w-full bg-gradient-to-r from-neon-cyan/10 via-neon-violet/10 to-neon-cyan/10" />
          )}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 bg-background/75" style={{ width: pct(start) }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 bg-background/75" style={{ width: `calc(100% - ${pct(end)})` }} />
        <div
          className="pointer-events-none absolute inset-y-0 rounded-lg border-2 border-neon-cyan"
          style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }}
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground" style={{ left: pct(current) }} />
        <input
          type="range"
          className="trim-range"
          aria-label="Trim start"
          min={0}
          max={duration}
          step={0.1}
          value={start}
          onChange={(event) => onStart(Number(event.target.value))}
        />
        <input
          type="range"
          className="trim-range"
          aria-label="Trim end"
          min={0}
          max={duration}
          step={0.1}
          value={end}
          onChange={(event) => onEnd(Number(event.target.value))}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>Start {formatClipTime(start)}</span>
        <span>
          {framesState === "sampling"
            ? "Reading frames…"
            : framesState === "unavailable"
              ? "Frame previews unavailable for this source"
              : `${formatClipTime(Math.max(0, end - start))} selected`}
        </span>
        <span>End {formatClipTime(end)}</span>
      </div>
    </div>
  );
}

function videoDetails(asset: MediaAsset) {
  const details = [];
  if (asset.width && asset.height) details.push(`${asset.width}×${asset.height}`);
  if (asset.duration_seconds != null) details.push(formatClipTime(asset.duration_seconds));
  details.push(formatBytes(asset.size_bytes));
  return details.join(" · ");
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

