/**
 * Reads a clip's audio track in the browser and converts it to 16 kHz mono WAV
 * for server-side speech-to-text. Nothing is transcribed here.
 */
import { MAX_TRANSCRIPT_AUDIO_SECONDS, TRANSCRIPT_SAMPLE_RATE, encodeWav } from "@/lib/transcript-audio";

export const MAX_DEVICE_SOURCE_BYTES = 300 * 1024 * 1024;

export class AudioExtractionError extends Error {}

export type ExtractionProgress =
  | { phase: "downloading"; loaded: number; total: number | null }
  | { phase: "decoding" };

async function downloadWithProgress(url: string, onProgress: (progress: ExtractionProgress) => void) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new AudioExtractionError("The clip could not be downloaded to read its audio.");
  if ((response.headers.get("content-type") ?? "").includes("text/html")) {
    throw new AudioExtractionError("The media source returned a webpage instead of the clip.");
  }
  const total = Number(response.headers.get("content-length")) || null;
  if (total && total > MAX_DEVICE_SOURCE_BYTES) throw new AudioExtractionError("This clip is too large to read on this device.");
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress({ phase: "downloading", loaded: buffer.byteLength, total });
    return buffer;
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.byteLength;
    if (loaded > MAX_DEVICE_SOURCE_BYTES) {
      await reader.cancel();
      throw new AudioExtractionError("This clip is too large to read on this device.");
    }
    onProgress({ phase: "downloading", loaded, total });
  }
  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return merged.buffer;
}

export async function extractClipAudio(url: string, onProgress: (progress: ExtractionProgress) => void) {
  if (typeof window === "undefined") throw new AudioExtractionError("Audio can only be read in the browser.");
  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass || typeof OfflineAudioContext === "undefined") {
    throw new AudioExtractionError("This browser can't read audio from videos.");
  }
  const buffer = await downloadWithProgress(url, onProgress);
  onProgress({ phase: "decoding" });
  const context = new AudioContextClass();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(buffer);
  } catch {
    throw new AudioExtractionError("This browser couldn't read the audio track in this clip.");
  } finally {
    void context.close();
  }
  if (decoded.duration > MAX_TRANSCRIPT_AUDIO_SECONDS) {
    throw new AudioExtractionError(`Transcripts are limited to ${MAX_TRANSCRIPT_AUDIO_SECONDS / 60} minutes of audio.`);
  }
  const frames = Math.max(1, Math.ceil(decoded.duration * TRANSCRIPT_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frames, TRANSCRIPT_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  const channel = rendered.getChannelData(0);
  const samples = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i += 1) {
    const value = Math.max(-1, Math.min(1, channel[i] ?? 0));
    samples[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const wav = encodeWav(samples, TRANSCRIPT_SAMPLE_RATE);
  return { wav: new Blob([wav], { type: "audio/wav" }), seconds: decoded.duration, samples };
}
