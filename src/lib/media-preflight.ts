/** Read-only media checks for the picker. These are WaveOS upload limits, not social-network limits. */
export const WAVEOS_DIRECT_UPLOAD_LIMIT_BYTES = 300 * 1024 * 1024;
export const WAVEOS_TEMPORARY_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;

export type MediaPreflightInput = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  sourceProvider: "waveos" | "google_drive" | "dropbox" | "frameio";
};

export type MediaPreflightResult = {
  status: "ok" | "warning" | "unknown";
  title: string;
  explanation: string;
  recommendation: string;
};

export function preflightMediaAsset(asset: MediaPreflightInput): MediaPreflightResult {
  const isVideo = asset.mimeType.startsWith("video/");
  const size = Number(asset.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) {
    return {
      status: "unknown",
      title: "File size unavailable",
      explanation: "WaveOS cannot verify this file's size yet.",
      recommendation: "Check the original file and destination requirements before publishing.",
    };
  }
  if (asset.sourceProvider === "waveos" && size > WAVEOS_DIRECT_UPLOAD_LIMIT_BYTES) {
    return {
      status: "warning",
      title: "Exceeds WaveOS's direct-upload limit",
      explanation: "WaveOS's current direct-upload limit is 300 MB. This is not a universal Instagram, Facebook, or other social-network limit.",
      recommendation: "Use an existing connected cloud source if supported, or export an appropriately sized copy from your editor. Automatic compression is not available yet.",
    };
  }
  if (isVideo && size > WAVEOS_DIRECT_UPLOAD_LIMIT_BYTES) {
    return {
      status: "warning",
      title: "Large cloud video: destination check needed",
      explanation: "The file is available from your cloud provider, but each social publishing connection may have different size, format, and duration limits.",
      recommendation: "Review the selected destination before publishing. WaveOS does not yet automatically compress or compare video quality.",
    };
  }
  if (isVideo && !/^(video\/mp4|video\/quicktime)$/i.test(asset.mimeType)) {
    return {
      status: "warning",
      title: "Video format may need conversion",
      explanation: "Not every social posting connection accepts this video format.",
      recommendation: "Check the destination's supported codecs and containers. Exporting H.264 in MP4 is often a compatible option.",
    };
  }
  return {
    status: "ok",
    title: "No WaveOS size warning",
    explanation: "The file is below WaveOS's 300 MB direct-upload warning threshold.",
    recommendation: "Final eligibility still depends on each social destination's size, codec, duration, and account requirements.",
  };
}
