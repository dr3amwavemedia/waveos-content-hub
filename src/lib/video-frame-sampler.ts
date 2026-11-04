/**
 * Samples real still frames from a playable video URL for timeline thumbnails.
 * Returns an empty list when the browser cannot read pixels (for example a
 * cross-origin source without CORS) so callers can fall back to a plain track.
 */
export function sampleVideoFrames(
  url: string,
  count = 8,
  maxEdge = 160,
  timeoutMs = 15000,
): Promise<string[]> {
  if (typeof document === "undefined" || !url) return Promise.resolve([]);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    if (!url.startsWith("blob:")) video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const frames: string[] = [];
    let points: number[] = [];
    let index = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(frames);
    };
    const timer = window.setTimeout(finish, timeoutMs);
    video.onerror = finish;
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return finish();
      points = Array.from({ length: count }, (_, i) =>
        Math.min(video.duration - 0.05, (video.duration * (i + 0.5)) / count),
      );
      video.currentTime = points[0] ?? 0;
    };
    video.onseeked = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(video.videoWidth || 1, video.videoHeight || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((video.videoWidth || 1) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 1) * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", 0.55));
      } catch {
        // Tainted canvas: pixels are not readable for this source.
        frames.length = 0;
        return finish();
      }
      index += 1;
      if (index < points.length) video.currentTime = points[index]!;
      else finish();
    };
    video.src = url;
  });
}
