/**
 * Video Maker edit recipe: a non-destructive description of how a clip should be
 * played back. WaveOS previews the recipe in the browser and saves it with the
 * media asset; it never renders a new video file from it.
 */

export type VideoLook = "none" | "vivid" | "warm" | "cool" | "mono" | "fade";
export type VideoAspect = "original" | "9:16" | "1:1" | "4:5" | "16:9";

export interface VideoCaptionCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface VideoEditRecipe {
  trimStart: number;
  trimEnd: number | null;
  speed: number;
  volume: number;
  muted: boolean;
  aspect: VideoAspect;
  fit: "contain" | "cover";
  rotation: 0 | 90 | 180 | 270;
  brightness: number;
  contrast: number;
  saturation: number;
  look: VideoLook;
  text: string;
  textPosition: "top" | "center" | "bottom";
  captions: VideoCaptionCue[];
}

export const DEFAULT_VIDEO_RECIPE: VideoEditRecipe = {
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
  look: "none",
  text: "",
  textPosition: "bottom",
  captions: [],
};

export const VIDEO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const VIDEO_LOOKS: ReadonlyArray<{ id: VideoLook; label: string }> = [
  { id: "none", label: "Original" },
  { id: "vivid", label: "Vivid" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "mono", label: "Mono" },
  { id: "fade", label: "Fade" },
];

const LOOK_FILTERS: Record<VideoLook, string> = {
  none: "",
  vivid: "saturate(1.35) contrast(1.1)",
  warm: "sepia(0.25) saturate(1.15) hue-rotate(-10deg)",
  cool: "hue-rotate(15deg) saturate(0.9) brightness(1.03)",
  mono: "grayscale(1) contrast(1.1)",
  fade: "contrast(0.85) brightness(1.08) saturate(0.8)",
};

const ASPECTS: VideoAspect[] = ["original", "9:16", "1:1", "4:5", "16:9"];
const MAX_CAPTIONS = 40;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Builds a safe recipe from stored metadata, clamped to the clip duration when known. */
export function normalizeVideoRecipe(stored: unknown, durationSeconds: number | null): VideoEditRecipe {
  const raw = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const duration = durationSeconds != null && durationSeconds > 0 ? durationSeconds : null;
  const trimStart = clamp(finiteNumber(raw.trimStart, 0), 0, duration ?? Number.MAX_SAFE_INTEGER);
  const storedEnd = typeof raw.trimEnd === "number" && Number.isFinite(raw.trimEnd) ? raw.trimEnd : null;
  let trimEnd = storedEnd ?? duration;
  if (trimEnd != null && duration != null) trimEnd = clamp(trimEnd, 0, duration);
  if (trimEnd != null && trimEnd <= trimStart) trimEnd = duration ?? null;

  const rotation = [0, 90, 180, 270].includes(raw.rotation as number)
    ? (raw.rotation as VideoEditRecipe["rotation"])
    : 0;
  const look = VIDEO_LOOKS.some((item) => item.id === raw.look) ? (raw.look as VideoLook) : "none";
  const captions = Array.isArray(raw.captions)
    ? raw.captions
        .flatMap((cue, index): VideoCaptionCue[] => {
          if (!cue || typeof cue !== "object") return [];
          const value = cue as Record<string, unknown>;
          const text = typeof value.text === "string" ? value.text.slice(0, 160) : "";
          const start = Math.max(0, finiteNumber(value.start, 0));
          const end = finiteNumber(value.end, start);
          if (end <= start) return [];
          return [{
            id: typeof value.id === "string" && value.id ? value.id : `cue-${index}`,
            start,
            end,
            text,
          }];
        })
        .sort((a, b) => a.start - b.start)
        .slice(0, MAX_CAPTIONS)
    : [];

  return {
    trimStart,
    trimEnd,
    speed: VIDEO_SPEEDS.includes(raw.speed as (typeof VIDEO_SPEEDS)[number]) ? (raw.speed as number) : 1,
    volume: clamp(finiteNumber(raw.volume, 1), 0, 1),
    muted: raw.muted === true,
    aspect: ASPECTS.includes(raw.aspect as VideoAspect) ? (raw.aspect as VideoAspect) : "original",
    fit: raw.fit === "cover" ? "cover" : "contain",
    rotation,
    brightness: clamp(finiteNumber(raw.brightness, 100), 50, 150),
    contrast: clamp(finiteNumber(raw.contrast, 100), 50, 150),
    saturation: clamp(finiteNumber(raw.saturation, 100), 0, 200),
    look,
    text: typeof raw.text === "string" ? raw.text.slice(0, 120) : "",
    textPosition: raw.textPosition === "top" || raw.textPosition === "center" ? raw.textPosition : "bottom",
    captions,
  };
}

/** CSS filter used by the browser preview. */
export function videoRecipeFilter(recipe: Pick<VideoEditRecipe, "brightness" | "contrast" | "saturation" | "look">) {
  const base = `brightness(${recipe.brightness}%) contrast(${recipe.contrast}%) saturate(${recipe.saturation}%)`;
  const look = LOOK_FILTERS[recipe.look] ?? "";
  return look ? `${base} ${look}` : base;
}

/** The caption cue showing at a playback time, if any. */
export function activeCaptionCue(captions: VideoCaptionCue[], time: number) {
  return captions.find((cue) => time >= cue.start && time < cue.end && cue.text.trim()) ?? null;
}

export function videoRecipeHasEdits(recipe: VideoEditRecipe, durationSeconds: number | null) {
  return (
    recipe.trimStart > 0 ||
    (durationSeconds != null && recipe.trimEnd != null && recipe.trimEnd < durationSeconds - 0.05) ||
    recipe.speed !== 1 ||
    recipe.volume !== 1 ||
    recipe.muted ||
    recipe.aspect !== "original" ||
    recipe.fit !== "contain" ||
    recipe.rotation !== 0 ||
    recipe.brightness !== 100 ||
    recipe.contrast !== 100 ||
    recipe.saturation !== 100 ||
    recipe.look !== "none" ||
    Boolean(recipe.text.trim()) ||
    recipe.captions.some((cue) => cue.text.trim())
  );
}

/** Width / height ratio for the preview stage. */
export function videoAspectRatio(aspect: VideoAspect, width: number | null, height: number | null) {
  switch (aspect) {
    case "9:16":
      return 9 / 16;
    case "1:1":
      return 1;
    case "4:5":
      return 4 / 5;
    case "16:9":
      return 16 / 9;
    default:
      return width && height ? width / height : 16 / 9;
  }
}

export function formatClipTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${minutes}:${String(remainder).padStart(2, "0")}.${tenths}`;
}
