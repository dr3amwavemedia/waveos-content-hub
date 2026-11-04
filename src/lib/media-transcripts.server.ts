/**
 * Server-only transcript pipeline. Every completed transcript comes from a real
 * Lovable AI Gateway speech-to-text response; failures are stored as failed
 * with a safe message and can be retried within the attempt limit.
 */
import { GatewayError, generateResponse, transcribeAudio } from "@lovable.dev/ai-gateway";
import { recordAiUsage } from "@/lib/ai-usage.server";
import {
  MAX_ORIGINAL_FILE_BYTES,
  MAX_TRANSCRIPT_ATTEMPTS,
  MAX_TRANSCRIPT_AUDIO_SECONDS,
  TRANSCRIPT_SAMPLE_RATE,
  TRANSCRIPT_STALE_MS,
  encodeWav,
  groundKeyMoments,
  parseWav,
  planSpeechChunks,
  sanitizeSegments,
  wavSamples,
  type TranscriptSegment,
} from "@/lib/transcript-audio";

export const TRANSCRIBE_MODEL = "openai/gpt-transcribe" as const;
const KEY_MOMENT_MODEL = "openai/gpt-6-astra" as const;
const CHUNK_CONCURRENCY = 4;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;
export type TranscriptAuthContext = { userId: string; supabase: AnyClient };

export class TranscriptUserError extends Error {}

export async function authorizeTranscriptManager(
  context: TranscriptAuthContext,
  workspaceId: string,
  options: { requireAi: boolean },
) {
  const [{ data: member }, { data: manageable }, { data: entitled }] = await Promise.all([
    context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle(),
    context.supabase.rpc("can_staff_manage_workspace", { _user_id: context.userId, _workspace_id: workspaceId }),
    context.supabase.rpc("has_feature", { _workspace_id: workspaceId, _feature: "can_use_ai_tools" }),
  ]);
  const staff = (manageable as boolean | null) === true;
  const canManage = staff || ["owner", "admin", "editor"].includes(member?.role ?? "");
  if (!canManage) throw new TranscriptUserError("You do not have permission to manage transcripts in this workspace.");
  if (options.requireAi && !staff && !entitled) {
    throw new TranscriptUserError("Transcripts are available on Current and Tidal.");
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as AnyClient;
}

export interface TranscribableAsset {
  id: string;
  workspace_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string | null;
  source_provider: string | null;
  external_file_id: string | null;
  external_parent_id: string | null;
  source_web_url: string | null;
  duration_seconds: number | null;
}

export async function loadTranscribableAsset(context: TranscriptAuthContext, workspaceId: string, mediaAssetId: string) {
  const { data, error } = await context.supabase
    .from("media_assets")
    .select("id,workspace_id,name,mime_type,size_bytes,storage_path,source_provider,external_file_id,external_parent_id,source_web_url,duration_seconds")
    .eq("id", mediaAssetId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) throw new TranscriptUserError("This media is no longer available in the workspace.");
  const asset = data as TranscribableAsset;
  if (!asset.mime_type.startsWith("video/") && !asset.mime_type.startsWith("audio/")) {
    throw new TranscriptUserError("Only videos and audio can be transcribed.");
  }
  if (asset.duration_seconds != null && asset.duration_seconds > MAX_TRANSCRIPT_AUDIO_SECONDS) {
    throw new TranscriptUserError(`Transcripts are limited to clips up to ${MAX_TRANSCRIPT_AUDIO_SECONDS / 60} minutes.`);
  }
  return asset;
}

/** Atomically moves the transcript into processing, refusing duplicates and over-limit retries. */
async function claimTranscript(
  client: AnyClient,
  asset: TranscribableAsset,
  userId: string,
  audioSource: "device_extracted_audio" | "original_file",
) {
  await client
    .from("media_transcripts")
    .upsert({ workspace_id: asset.workspace_id, media_asset_id: asset.id }, { onConflict: "media_asset_id", ignoreDuplicates: true });
  const { data: existing, error } = await client
    .from("media_transcripts")
    .select("status,attempt_count,started_at,updated_at")
    .eq("media_asset_id", asset.id)
    .eq("workspace_id", asset.workspace_id)
    .single();
  if (error || !existing) throw new TranscriptUserError("The transcript could not be started.");
  const now = Date.now();
  if (existing.status === "processing" && now - new Date(existing.updated_at).getTime() < TRANSCRIPT_STALE_MS) {
    throw new TranscriptUserError("This clip is already being transcribed.");
  }
  if (existing.status === "completed") {
    throw new TranscriptUserError("This clip already has a transcript. Edit it instead.");
  }
  const recent = existing.started_at && now - new Date(existing.started_at).getTime() < 24 * 60 * 60 * 1000;
  const attempts = recent ? Number(existing.attempt_count ?? 0) : 0;
  if (attempts >= MAX_TRANSCRIPT_ATTEMPTS) {
    throw new TranscriptUserError("This clip reached today's transcript retry limit. Try again tomorrow.");
  }
  const staleIso = new Date(now - TRANSCRIPT_STALE_MS).toISOString();
  const nowIso = new Date(now).toISOString();
  const { data: claimed } = await client
    .from("media_transcripts")
    .update({
      status: "processing",
      attempt_count: attempts + 1,
      requested_by: userId,
      audio_source: audioSource,
      started_at: nowIso,
      updated_at: nowIso,
      error_code: null,
      error_message: null,
    })
    .eq("media_asset_id", asset.id)
    .eq("workspace_id", asset.workspace_id)
    .or(`status.neq.processing,updated_at.lt.${staleIso}`)
    .select("id")
    .maybeSingle();
  if (!claimed) throw new TranscriptUserError("This clip is already being transcribed.");
}

async function markFailed(client: AnyClient, asset: TranscribableAsset, code: string, message: string) {
  await client
    .from("media_transcripts")
    .update({ status: "failed", error_code: code, error_message: message, updated_at: new Date().toISOString() })
    .eq("media_asset_id", asset.id)
    .eq("workspace_id", asset.workspace_id);
}

function safeProviderFailure(error: unknown) {
  if (error instanceof GatewayError) {
    if (error.httpStatus === 402) return { code: "credits_exhausted", message: "AI credits are used up. Top up, then try again." };
    if (error.httpStatus === 429) return { code: "rate_limited", message: "Speech-to-text is busy right now. Try again in a few minutes." };
    return { code: `gateway_${error.code}`, message: "Speech-to-text could not finish this clip. Try again." };
  }
  if (error instanceof TranscriptUserError) return { code: "rejected", message: error.message };
  return { code: "unexpected", message: "Speech-to-text could not finish this clip. Try again." };
}

async function transcribeBlob(file: File) {
  const result = await transcribeAudio({ model: TRANSCRIBE_MODEL, file, response_format: "json" });
  if (typeof result === "string") return { text: result.trim(), language: null as string | null };
  return { text: (result.text ?? "").trim(), language: result.languages?.[0]?.code ?? null };
}

async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await run(items[index] as T);
      }
    }),
  );
  return results;
}

function responseText(response: unknown) {
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "output_text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") return text;
      }
    }
  }
  return "";
}

/** AI labels a few moments; quotes and timestamps always come from the real segments. */
async function pickKeyMoments(segments: TranscriptSegment[]) {
  if (segments.length < 2) return [];
  try {
    const list = segments
      .slice(0, 120)
      .map((segment, index) => `${index}) ${segment.text.slice(0, 240)}`)
      .join("\n");
    const response = await generateResponse({
      model: KEY_MOMENT_MODEL,
      instructions:
        "You pick the most useful moments from a social video transcript for a marketer: hooks, offers, calls to action, strong claims, emotional beats. Only choose from the numbered sections given. Never invent content.",
      input: [
        {
          role: "user",
          content: `Return JSON {"moments":[{"index":number,"label":"2-6 word label"}]} with up to 5 moments.\nSections:\n${list}`,
        },
      ],
      text: { format: { type: "json_object" } },
      max_output_tokens: 600,
    });
    const parsed = JSON.parse(responseText(response) || "{}") as { moments?: unknown };
    return groundKeyMoments(parsed.moments, segments);
  } catch (error) {
    console.warn("Transcript key moments unavailable", error instanceof GatewayError ? error.code : "parse_failed");
    return [];
  }
}

/** Timestamped path: audio extracted on the device, split and transcribed section by section. */
export async function transcribeDeviceAudio(
  context: TranscriptAuthContext,
  asset: TranscribableAsset,
  audio: Blob,
) {
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const info = parseWav(bytes);
  if (!info || info.channels !== 1 || info.sampleRate !== TRANSCRIPT_SAMPLE_RATE) {
    throw new TranscriptUserError("The extracted audio was not in the expected format.");
  }
  const samples = wavSamples(bytes, info);
  const seconds = samples.length / TRANSCRIPT_SAMPLE_RATE;
  if (seconds > MAX_TRANSCRIPT_AUDIO_SECONDS) {
    throw new TranscriptUserError(`Transcripts are limited to ${MAX_TRANSCRIPT_AUDIO_SECONDS / 60} minutes of audio.`);
  }
  if (asset.duration_seconds != null && seconds > asset.duration_seconds + 3) {
    throw new TranscriptUserError("The extracted audio is longer than this clip, so it was not used.");
  }

  const client = await admin();
  await claimTranscript(client, asset, context.userId, "device_extracted_audio");
  const startedAt = Date.now();
  try {
    const plan = planSpeechChunks(samples, TRANSCRIPT_SAMPLE_RATE);
    const spoken = plan.filter((chunk) => !chunk.silent);
    if (!spoken.length) {
      await client
        .from("media_transcripts")
        .update({
          status: "no_speech",
          provider: "lovable_ai_gateway",
          model: TRANSCRIBE_MODEL,
          audio_seconds: Math.round(seconds * 10) / 10,
          segments: [],
          has_timestamps: false,
          transcript_text: null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("media_asset_id", asset.id)
        .eq("workspace_id", asset.workspace_id);
      return { status: "no_speech" as const };
    }
    let language: string | null = null;
    const texts = await mapLimited(spoken, CHUNK_CONCURRENCY, async (chunk) => {
      const from = Math.floor(chunk.start * TRANSCRIPT_SAMPLE_RATE);
      const to = Math.min(samples.length, Math.ceil(chunk.end * TRANSCRIPT_SAMPLE_RATE));
      const wav = encodeWav(samples.subarray(from, to));
      const result = await transcribeBlob(new File([wav], "section.wav", { type: "audio/wav" }));
      language ??= result.language;
      return result.text;
    });
    const segments = sanitizeSegments(
      spoken.map((chunk, index) => ({ start: chunk.start, end: chunk.end, text: texts[index] ?? "" })),
    ).filter((segment) => segment.text.trim());
    await recordAiUsage({
      workspaceId: asset.workspace_id,
      userId: context.userId,
      feature: "media_transcript",
      model: TRANSCRIBE_MODEL,
      durationMs: Date.now() - startedAt,
      status: "succeeded",
    });
    if (!segments.length) {
      await client
        .from("media_transcripts")
        .update({
          status: "no_speech",
          provider: "lovable_ai_gateway",
          model: TRANSCRIBE_MODEL,
          audio_seconds: Math.round(seconds * 10) / 10,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("media_asset_id", asset.id)
        .eq("workspace_id", asset.workspace_id);
      return { status: "no_speech" as const };
    }
    const keyMoments = await pickKeyMoments(segments);
    await client
      .from("media_transcripts")
      .update({
        status: "completed",
        provider: "lovable_ai_gateway",
        model: TRANSCRIBE_MODEL,
        language,
        transcript_text: segments.map((segment) => segment.text.trim()).join(" "),
        segments,
        has_timestamps: true,
        key_moments: keyMoments,
        audio_seconds: Math.round(seconds * 10) / 10,
        edited_text: null,
        edited_segments: null,
        edited_by: null,
        edited_at: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("media_asset_id", asset.id)
      .eq("workspace_id", asset.workspace_id);
    return { status: "completed" as const };
  } catch (error) {
    const failure = safeProviderFailure(error);
    await recordAiUsage({
      workspaceId: asset.workspace_id,
      userId: context.userId,
      feature: "media_transcript",
      model: TRANSCRIBE_MODEL,
      durationMs: Date.now() - startedAt,
      status: "provider_error",
      safeErrorCode: failure.code,
    });
    await markFailed(client, asset, failure.code, failure.message);
    throw new TranscriptUserError(failure.message);
  }
}

const DIRECT_EXTENSIONS = new Set(["mp4", "m4a", "mp3", "wav", "webm", "mpeg", "mpga", "ogg", "oga", "flac"]);

/** Text-only path: the server fetches the original file (≤ 24 MB) from WaveOS storage, Drive, Dropbox or Frame.io. */
export async function transcribeOriginalFile(context: TranscriptAuthContext, asset: TranscribableAsset) {
  const extension = asset.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeExtension = asset.mime_type === "video/mp4" ? "mp4" : asset.mime_type === "video/webm" ? "webm" : extension;
  if (!DIRECT_EXTENSIONS.has(mimeExtension)) {
    throw new TranscriptUserError("This file type can only be transcribed from audio read on your device.");
  }
  if (asset.size_bytes > MAX_ORIGINAL_FILE_BYTES) {
    throw new TranscriptUserError("This file is too large to transcribe directly (24 MB limit). Use a phone or browser that can read its audio.");
  }

  const client = await admin();
  await claimTranscript(client, asset, context.userId, "original_file");
  const startedAt = Date.now();
  try {
    const { resolveMediaAssetUrl } = await import("@/lib/external-media.server");
    let url: string;
    try {
      url = await resolveMediaAssetUrl(asset);
    } catch {
      throw new TranscriptUserError(
        asset.source_provider === "waveos"
          ? "WaveOS could not open this file."
          : "The connected source didn't allow access to this file. Reconnect it, then try again.",
      );
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) throw new TranscriptUserError("The media source refused the download. Reconnect it, then try again.");
    if ((response.headers.get("content-type") ?? "").includes("text/html")) {
      throw new TranscriptUserError("The media source returned a webpage instead of the file.");
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_ORIGINAL_FILE_BYTES) throw new TranscriptUserError("This file is too large to transcribe directly (24 MB limit).");
    const blob = await response.blob();
    if (blob.size > MAX_ORIGINAL_FILE_BYTES) throw new TranscriptUserError("This file is too large to transcribe directly (24 MB limit).");
    const result = await transcribeBlob(new File([blob], `clip.${mimeExtension}`, { type: asset.mime_type }));
    await recordAiUsage({
      workspaceId: asset.workspace_id,
      userId: context.userId,
      feature: "media_transcript",
      model: TRANSCRIBE_MODEL,
      durationMs: Date.now() - startedAt,
      status: "succeeded",
    });
    const status = result.text ? "completed" : "no_speech";
    await client
      .from("media_transcripts")
      .update({
        status,
        provider: "lovable_ai_gateway",
        model: TRANSCRIBE_MODEL,
        language: result.language,
        transcript_text: result.text || null,
        segments: [],
        has_timestamps: false,
        key_moments: [],
        edited_text: null,
        edited_segments: null,
        edited_by: null,
        edited_at: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("media_asset_id", asset.id)
      .eq("workspace_id", asset.workspace_id);
    return { status };
  } catch (error) {
    const failure = safeProviderFailure(error);
    await recordAiUsage({
      workspaceId: asset.workspace_id,
      userId: context.userId,
      feature: "media_transcript",
      model: TRANSCRIBE_MODEL,
      durationMs: Date.now() - startedAt,
      status: "provider_error",
      safeErrorCode: failure.code,
    });
    await markFailed(client, asset, failure.code, failure.message);
    throw new TranscriptUserError(failure.message);
  }
}

/** Saves user corrections. Timestamps are kept from the machine transcript; only text changes. */
export async function saveTranscriptEdits(
  asset: { id: string; workspace_id: string },
  userId: string,
  edit: { segments?: Array<{ text: string }>; text?: string; reset?: boolean },
) {
  const client = await admin();
  const { data: row } = await client
    .from("media_transcripts")
    .select("status,segments,has_timestamps")
    .eq("media_asset_id", asset.id)
    .eq("workspace_id", asset.workspace_id)
    .maybeSingle();
  if (!row || row.status !== "completed") throw new TranscriptUserError("Only finished transcripts can be edited.");
  const nowIso = new Date().toISOString();
  if (edit.reset) {
    await client
      .from("media_transcripts")
      .update({ edited_text: null, edited_segments: null, edited_by: null, edited_at: null, updated_at: nowIso })
      .eq("media_asset_id", asset.id)
      .eq("workspace_id", asset.workspace_id);
    return;
  }
  const original = sanitizeSegments(row.segments);
  let editedSegments: TranscriptSegment[] | null = null;
  let editedText: string;
  if (row.has_timestamps && original.length) {
    if (!edit.segments || edit.segments.length !== original.length) {
      throw new TranscriptUserError("The transcript changed while you were editing. Reload and try again.");
    }
    editedSegments = original.map((segment, index) => ({
      ...segment,
      text: String(edit.segments?.[index]?.text ?? "").slice(0, 2000),
    }));
    editedText = editedSegments.map((segment) => segment.text.trim()).filter(Boolean).join(" ");
  } else {
    editedText = String(edit.text ?? "").slice(0, 40000);
  }
  await client
    .from("media_transcripts")
    .update({
      edited_text: editedText,
      edited_segments: editedSegments,
      edited_by: userId,
      edited_at: nowIso,
      updated_at: nowIso,
    })
    .eq("media_asset_id", asset.id)
    .eq("workspace_id", asset.workspace_id);
}
