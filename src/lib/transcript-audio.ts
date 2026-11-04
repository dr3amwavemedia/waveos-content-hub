/**
 * Pure helpers for timestamped transcripts. Audio is 16 kHz mono 16-bit PCM
 * WAV; the server splits it at quiet points so each transcribed section keeps
 * its real position in the clip. No speech-to-text happens here.
 */

export const TRANSCRIPT_SAMPLE_RATE = 16000;
export const MAX_TRANSCRIPT_AUDIO_SECONDS = 600;
/** Original files sent whole to speech-to-text must stay under the provider upload limit. */
export const MAX_ORIGINAL_FILE_BYTES = 24 * 1024 * 1024;
export const MAX_TRANSCRIPT_ATTEMPTS = 6;
export const TRANSCRIPT_STALE_MS = 15 * 60 * 1000;

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptKeyMoment {
  segmentIndex: number;
  start: number;
  end: number;
  label: string;
  quote: string;
}

export interface AudioChunkPlan {
  start: number;
  end: number;
  silent: boolean;
}

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

/** Reads a PCM WAV header; returns null for anything that is not 16-bit PCM. */
export function parseWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let format: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format || format.audioFormat !== 1 || format.bitsPerSample !== 16) return null;
      return {
        sampleRate: format.sampleRate,
        channels: format.channels,
        bitsPerSample: format.bitsPerSample,
        dataOffset: body,
        dataLength: Math.min(size, bytes.length - body),
      };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

export function encodeWav(samples: Int16Array, sampleRate = TRANSCRIPT_SAMPLE_RATE) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) view.setInt16(44 + i * 2, samples[i] ?? 0, true);
  return bytes;
}

/** Reads mono 16-bit samples from a parsed WAV body (copying, so alignment never matters). */
export function wavSamples(bytes: Uint8Array, info: WavInfo) {
  const count = Math.floor(info.dataLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset + info.dataOffset, count * 2);
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i += 1) samples[i] = view.getInt16(i * 2, true);
  return samples;
}

/**
 * Splits audio into speech sections between minSeconds and maxSeconds, cutting
 * in the middle of quiet gaps. Sections without voiced frames are marked
 * silent so they are never sent to speech-to-text (which can invent words for silence).
 */
export function planSpeechChunks(
  samples: Int16Array,
  sampleRate: number,
  options: { minSeconds?: number; maxSeconds?: number; frameMs?: number } = {},
): AudioChunkPlan[] {
  const minSeconds = options.minSeconds ?? 4;
  const maxSeconds = options.maxSeconds ?? 15;
  const frameSize = Math.max(1, Math.round((sampleRate * (options.frameMs ?? 50)) / 1000));
  const frameSeconds = frameSize / sampleRate;
  const frameCount = Math.ceil(samples.length / frameSize);
  if (frameCount === 0) return [];

  const rms = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    const from = frame * frameSize;
    const to = Math.min(samples.length, from + frameSize);
    for (let i = from; i < to; i += 1) {
      const value = (samples[i] ?? 0) / 32768;
      sum += value * value;
    }
    rms[frame] = Math.sqrt(sum / Math.max(1, to - from));
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const threshold = Math.max(0.008, floor * 2.5);
  const voiced = (frame: number) => (rms[frame] ?? 0) > threshold;

  const cuts: number[] = [0];
  let silenceRun = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    silenceRun = voiced(frame) ? 0 : silenceRun + 1;
    const chunkFrames = frame - (cuts[cuts.length - 1] ?? 0);
    const length = chunkFrames * frameSeconds;
    if (length >= minSeconds && silenceRun >= Math.round(0.3 / frameSeconds)) {
      cuts.push(frame - Math.floor(silenceRun / 2));
      silenceRun = 0;
    } else if (length >= maxSeconds) {
      const lookback = Math.round(4 / frameSeconds);
      let quietest = frame;
      for (let candidate = frame; candidate > frame - lookback; candidate -= 1) {
        if ((rms[candidate] ?? 1) < (rms[quietest] ?? 1)) quietest = candidate;
      }
      cuts.push(quietest);
      silenceRun = 0;
    }
  }
  cuts.push(frameCount);

  const chunks: AudioChunkPlan[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const fromFrame = cuts[i] ?? 0;
    const toFrame = cuts[i + 1] ?? frameCount;
    if (toFrame <= fromFrame) continue;
    let voicedFrames = 0;
    for (let frame = fromFrame; frame < toFrame; frame += 1) if (voiced(frame)) voicedFrames += 1;
    const chunk = {
      start: round(fromFrame * frameSeconds),
      end: round(Math.min(samples.length / sampleRate, toFrame * frameSeconds)),
      silent: voicedFrames * frameSeconds < 0.2,
    };
    const previous = chunks[chunks.length - 1];
    if (previous && chunk.end - chunk.start < 1) {
      previous.end = chunk.end;
      previous.silent = previous.silent && chunk.silent;
    } else {
      chunks.push(chunk);
    }
  }
  return chunks;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatTranscriptStamp(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function sanitizeSegments(value: unknown, maxSeconds = MAX_TRANSCRIPT_AUDIO_SECONDS * 2): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item): TranscriptSegment[] => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const start = Number(row.start);
      const end = Number(row.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > maxSeconds) return [];
      return [{ start: round(start), end: round(end), text: String(row.text ?? "").slice(0, 2000) }];
    })
    .sort((a, b) => a.start - b.start)
    .slice(0, 400);
}

/**
 * Keeps only model-picked moments that point at a real segment; the quote and
 * timestamps always come from the transcript, only the label is AI-written.
 */
export function groundKeyMoments(raw: unknown, segments: TranscriptSegment[], limit = 5): TranscriptKeyMoment[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<number>();
  const moments: TranscriptKeyMoment[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const index = Number(row.index);
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 80) : "";
    const segment = Number.isInteger(index) ? segments[index] : undefined;
    if (!segment || !segment.text.trim() || !label || seen.has(index)) continue;
    seen.add(index);
    moments.push({ segmentIndex: index, start: segment.start, end: segment.end, label, quote: segment.text.trim().slice(0, 240) });
    if (moments.length >= limit) break;
  }
  return moments.sort((a, b) => a.start - b.start);
}

export interface StoredTranscriptRow {
  status: string;
  transcript_text: string | null;
  segments: unknown;
  has_timestamps: boolean;
  key_moments: unknown;
  edited_text: string | null;
  edited_segments: unknown;
  edited_at: string | null;
}

/** The transcript the AI should read: a user correction always wins over the machine transcript. */
export function effectiveTranscript(row: StoredTranscriptRow) {
  const edited = row.edited_at != null;
  const segments = sanitizeSegments(edited && row.edited_segments ? row.edited_segments : row.segments);
  const text = (edited && row.edited_text != null ? row.edited_text : row.transcript_text) ?? segments.map((s) => s.text).join(" ");
  return {
    evidence: edited ? ("user_corrected_transcript" as const) : ("speech_to_text_transcript" as const),
    text: text.trim(),
    segments,
    hasTimestamps: row.has_timestamps && segments.length > 0,
  };
}

/** Bounded transcript excerpt for AI prompts, with [m:ss] markers when timestamps exist. */
export function transcriptExcerptForAi(row: StoredTranscriptRow, maxChars = 1200) {
  if (row.status !== "completed") return null;
  const transcript = effectiveTranscript(row);
  if (!transcript.text) return null;
  let excerpt = transcript.hasTimestamps
    ? transcript.segments
        .filter((segment) => segment.text.trim())
        .map((segment) => `[${formatTranscriptStamp(segment.start)}] ${segment.text.trim()}`)
        .join(" ")
    : transcript.text;
  const truncated = excerpt.length > maxChars;
  if (truncated) excerpt = `${excerpt.slice(0, maxChars).trimEnd()}…`;
  const keyMoments = (Array.isArray(row.key_moments) ? row.key_moments : [])
    .slice(0, 5)
    .map((moment) => {
      const m = moment as Partial<TranscriptKeyMoment>;
      return { at: formatTranscriptStamp(Number(m.start ?? 0)), label: String(m.label ?? ""), quote: String(m.quote ?? "").slice(0, 160) };
    });
  return { evidence: transcript.evidence, excerpt, truncated, hasTimestamps: transcript.hasTimestamps, keyMoments };
}

/**
 * Turns transcript sections inside a trim range into short caption cues. Word
 * timing inside a section is spread evenly, so it is an estimate.
 */
export function captionCuesFromSegments(segments: TranscriptSegment[], trimStart: number, trimEnd: number, wordsPerCue = 7) {
  const cues: Array<{ id: string; start: number; end: number; text: string }> = [];
  segments.forEach((segment, segmentIndex) => {
    const words = segment.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const groups = Math.ceil(words.length / wordsPerCue);
    const step = (segment.end - segment.start) / groups;
    for (let group = 0; group < groups; group += 1) {
      const start = round(segment.start + step * group);
      const end = round(segment.start + step * (group + 1));
      if (end <= trimStart || start >= trimEnd) continue;
      cues.push({
        id: `tx-${segmentIndex}-${group}`,
        start: Math.max(start, trimStart),
        end: Math.min(end, trimEnd),
        text: words.slice(group * wordsPerCue, (group + 1) * wordsPerCue).join(" ").slice(0, 160),
      });
    }
  });
  return cues.filter((cue) => cue.end > cue.start);
}
