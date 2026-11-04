import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const MAX_AUDIO_UPLOAD_BYTES = 600 * 16000 * 2 + 4096;

function safeMessage(error: unknown) {
  return error instanceof Error && error.name !== "Error" ? "Speech-to-text could not finish this clip. Try again." : error instanceof Error ? error.message : "Speech-to-text could not finish this clip. Try again.";
}

/** Timestamped transcript from 16 kHz mono WAV audio read on the user's device. */
export const transcribeMediaAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Invalid transcript request.");
    const workspaceId = uuid.parse(input.get("workspaceId"));
    const mediaAssetId = uuid.parse(input.get("mediaAssetId"));
    const audio = input.get("audio");
    if (!(audio instanceof Blob) || audio.size < 1024) throw new Error("No audio was received.");
    if (audio.size > MAX_AUDIO_UPLOAD_BYTES) throw new Error("Transcripts are limited to 10 minutes of audio.");
    return { workspaceId, mediaAssetId, audio };
  })
  .handler(async ({ data, context }) => {
    const server = await import("@/lib/media-transcripts.server");
    try {
      await server.authorizeTranscriptManager(context, data.workspaceId, { requireAi: true });
      const asset = await server.loadTranscribableAsset(context, data.workspaceId, data.mediaAssetId);
      return await server.transcribeDeviceAudio(context, asset, data.audio);
    } catch (error) {
      throw new Error(error instanceof server.TranscriptUserError ? error.message : safeMessage(error));
    }
  });

/** Text-only transcript of the original file when the device cannot read its audio. */
export const transcribeMediaOriginal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: uuid, mediaAssetId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const server = await import("@/lib/media-transcripts.server");
    try {
      await server.authorizeTranscriptManager(context, data.workspaceId, { requireAi: true });
      const asset = await server.loadTranscribableAsset(context, data.workspaceId, data.mediaAssetId);
      return await server.transcribeOriginalFile(context, asset);
    } catch (error) {
      throw new Error(error instanceof server.TranscriptUserError ? error.message : safeMessage(error));
    }
  });

export const saveMediaTranscriptEdits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: uuid,
        mediaAssetId: uuid,
        segments: z.array(z.object({ text: z.string().max(2000) })).max(400).optional(),
        text: z.string().max(40000).optional(),
        reset: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const server = await import("@/lib/media-transcripts.server");
    try {
      await server.authorizeTranscriptManager(context, data.workspaceId, { requireAi: false });
      const asset = await server.loadTranscribableAsset(context, data.workspaceId, data.mediaAssetId);
      await server.saveTranscriptEdits(asset, context.userId, data);
      return { saved: true };
    } catch (error) {
      throw new Error(error instanceof server.TranscriptUserError ? error.message : "The transcript could not be saved.");
    }
  });
