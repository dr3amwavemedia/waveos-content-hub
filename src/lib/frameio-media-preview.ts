// Pure helpers shared by the Frame.io server resolver and the post-editor
// thumbnails. Kept free of app imports so unit tests can load them directly.

export type MediaPreviewKind = "image" | "video";

const httpsUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

/**
 * Read the thumbnail link from a Frame.io V4 `media_links` object. Frame.io
 * may return the link as `url`, `inline_url` or `download_url`; anything that
 * is not an https URL is ignored.
 */
export function frameioThumbnailLink(mediaLinks: unknown): string | null {
  if (!mediaLinks || typeof mediaLinks !== "object") return null;
  const thumbnail = (mediaLinks as Record<string, unknown>).thumbnail;
  if (!thumbnail || typeof thumbnail !== "object") return null;
  const link = thumbnail as Record<string, unknown>;
  return httpsUrl(link.url) ?? httpsUrl(link.inline_url) ?? httpsUrl(link.download_url);
}

/** How a fresh original Frame.io file should be shown when no thumbnail exists. */
export function frameioOriginalPreviewKind(mimeType: string | null | undefined): MediaPreviewKind | null {
  const type = (mimeType ?? "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return null;
}

/**
 * Decide which element renders a media thumbnail. A preview kind returned by
 * the server (Frame.io) always wins, so a Frame.io poster image for a video
 * asset is shown with <img>, never <video>.
 */
export function mediaThumbRenderKind(input: {
  url: string | null | undefined;
  failed?: boolean;
  sourceProvider: string;
  mimeType: string;
  previewKind?: MediaPreviewKind | null;
}): MediaPreviewKind | "placeholder" {
  if (!input.url || input.failed) return "placeholder";
  if (input.previewKind) return input.previewKind;
  if (input.sourceProvider === "frameio") return "placeholder";
  if (input.sourceProvider === "google_drive" || input.mimeType.startsWith("image/")) return "image";
  if (input.mimeType.startsWith("video/")) return "video";
  return "placeholder";
}
