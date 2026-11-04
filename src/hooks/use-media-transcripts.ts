import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMediaPreviewUrl, type MediaAsset } from "@/hooks/use-media";
import { AudioExtractionError, extractClipAudio } from "@/lib/audio-extract";
import {
  transcribeMediaAudio,
  transcribeMediaOriginal,
  saveMediaTranscriptEdits,
} from "@/lib/media-transcripts.functions";
import { TRANSCRIPT_SAMPLE_RATE, TRANSCRIPT_STALE_MS, planSpeechChunks } from "@/lib/transcript-audio";

export interface MediaTranscriptRow {
  id: string;
  workspace_id: string;
  media_asset_id: string;
  status: "queued" | "processing" | "completed" | "no_speech" | "failed";
  audio_source: "device_extracted_audio" | "original_file" | null;
  model: string | null;
  language: string | null;
  transcript_text: string | null;
  segments: unknown;
  has_timestamps: boolean;
  key_moments: unknown;
  audio_seconds: number | null;
  edited_text: string | null;
  edited_segments: unknown;
  edited_at: string | null;
  error_message: string | null;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export type TranscriptRunState =
  | { phase: "downloading"; loaded: number; total: number | null }
  | { phase: "decoding" }
  | { phase: "transcribing"; source: "device" | "original"; sections: number | null }
  | { phase: "error"; message: string };

export function isTranscriptStale(row: Pick<MediaTranscriptRow, "status" | "updated_at">) {
  return row.status === "processing" && Date.now() - new Date(row.updated_at).getTime() > TRANSCRIPT_STALE_MS;
}

export function transcribableMedia(asset: Pick<MediaAsset, "mime_type">) {
  return asset.mime_type.startsWith("video/") || asset.mime_type.startsWith("audio/");
}

export function useMediaTranscripts(workspaceId: string | null | undefined, assetIds: string[]) {
  const ids = Array.from(new Set(assetIds)).sort();
  return useQuery({
    queryKey: ["media-transcripts", workspaceId, ids],
    enabled: Boolean(workspaceId) && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_transcripts")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .in("media_asset_id", ids);
      if (error) throw error;
      const map: Record<string, MediaTranscriptRow> = {};
      for (const row of (data ?? []) as unknown as MediaTranscriptRow[]) map[row.media_asset_id] = row;
      return map;
    },
    refetchInterval: (query) => {
      const rows = Object.values((query.state.data ?? {}) as Record<string, MediaTranscriptRow>);
      return rows.some((row) => row.status === "processing" && !isTranscriptStale(row)) ? 5000 : false;
    },
  });
}

/**
 * Runs a transcript: reads the clip's audio on this device for timestamped
 * sections, or asks the server to transcribe the original file (text only)
 * when this device can't read the audio. Progress reflects real steps only.
 */
export function useTranscriptRunner(workspaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const audioFn = useServerFn(transcribeMediaAudio);
  const originalFn = useServerFn(transcribeMediaOriginal);
  const [runs, setRuns] = useState<Record<string, TranscriptRunState>>({});
  const setRun = (id: string, state: TranscriptRunState | null) =>
    setRuns((current) => {
      const next = { ...current };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["media-transcripts", workspaceId] });

  async function start(asset: MediaAsset) {
    if (!workspaceId) return;
    const current = runs[asset.id];
    if (current && current.phase !== "error") return;
    setRun(asset.id, { phase: "downloading", loaded: 0, total: asset.size_bytes || null });
    let deviceProblem: string | null = null;
    try {
      const url = await getMediaPreviewUrl(asset, 60 * 30, "content");
      if (!url) throw new AudioExtractionError("WaveOS couldn't open this clip on this device.");
      const { wav, samples } = await extractClipAudio(url, (progress) => setRun(asset.id, progress));
      const sections = planSpeechChunks(samples, TRANSCRIPT_SAMPLE_RATE).filter((chunk) => !chunk.silent).length;
      setRun(asset.id, { phase: "transcribing", source: "device", sections });
      const form = new FormData();
      form.append("workspaceId", workspaceId);
      form.append("mediaAssetId", asset.id);
      form.append("audio", wav, "audio.wav");
      await audioFn({ data: form });
    } catch (error) {
      if (error instanceof AudioExtractionError) {
        deviceProblem = error.message;
      } else {
        setRun(asset.id, { phase: "error", message: error instanceof Error ? error.message : "The transcript could not be made." });
        await refresh();
        return;
      }
    }
    if (deviceProblem) {
      setRun(asset.id, { phase: "transcribing", source: "original", sections: null });
      try {
        await originalFn({ data: { workspaceId, mediaAssetId: asset.id } });
      } catch (error) {
        setRun(asset.id, {
          phase: "error",
          message: `${deviceProblem} ${error instanceof Error ? error.message : "The original file couldn't be transcribed either."}`,
        });
        await refresh();
        return;
      }
    }
    setRun(asset.id, null);
    await refresh();
  }

  return { runs, start, isRunning: (id: string) => Boolean(runs[id] && runs[id]?.phase !== "error") };
}

export function useSaveTranscriptEdits(workspaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveMediaTranscriptEdits);
  return async (input: { mediaAssetId: string; segments?: Array<{ text: string }>; text?: string; reset?: boolean }) => {
    if (!workspaceId) return;
    await saveFn({ data: { workspaceId, ...input } });
    await queryClient.invalidateQueries({ queryKey: ["media-transcripts", workspaceId] });
  };
}
