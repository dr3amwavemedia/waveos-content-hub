import { useEffect, useState, type ReactNode } from "react";
import { AudioLines, CircleAlert, Loader2, Pencil, RotateCcw, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  isTranscriptStale,
  type MediaTranscriptRow,
  type TranscriptRunState,
} from "@/hooks/use-media-transcripts";
import {
  MAX_TRANSCRIPT_ATTEMPTS,
  effectiveTranscript,
  formatTranscriptStamp,
  sanitizeSegments,
  type TranscriptKeyMoment,
} from "@/lib/transcript-audio";

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function transcriptStatusLabel(row: MediaTranscriptRow | undefined, run: TranscriptRunState | undefined) {
  if (run && run.phase !== "error") return "Working";
  if (run?.phase === "error") return "Failed";
  if (!row || row.status === "queued") return "Not transcribed";
  if (row.status === "processing") return isTranscriptStale(row) ? "Stopped" : "Transcribing";
  if (row.status === "completed") return row.edited_at ? "Edited by you" : "Transcribed";
  if (row.status === "no_speech") return "No speech";
  return "Failed";
}

function RunProgress({ run }: { run: TranscriptRunState }) {
  if (run.phase === "downloading") {
    const value = run.total ? Math.min(1, run.loaded / run.total) : null;
    return (
      <ProgressLine
        label="Reading the clip's audio on this device"
        detail={run.total ? `${formatMegabytes(run.loaded)} of ${formatMegabytes(run.total)}` : formatMegabytes(run.loaded)}
        value={value}
      />
    );
  }
  if (run.phase === "decoding") return <ProgressLine label="Decoding audio on this device" detail="" value={null} />;
  if (run.phase === "transcribing") {
    return (
      <ProgressLine
        label="Speech-to-text is transcribing"
        detail={
          run.source === "device"
            ? run.sections
              ? `${run.sections} speech section${run.sections === 1 ? "" : "s"}`
              : "No speech sections found"
            : "Original file, text only"
        }
        value={null}
      />
    );
  }
  return null;
}

function ProgressLine({ label, detail, value }: { label: string; detail: string; value: number | null }) {
  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-neon-cyan/25 bg-neon-cyan/5 p-3">
      <div className="flex items-center gap-2 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-neon-cyan" />
        <span className="font-medium">{label}</span>
        <span className="ml-auto text-muted-foreground">{detail}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        {value == null ? (
          <div className="h-full w-1/3 animate-pulse rounded-full neon-fill" />
        ) : (
          <div className="h-full neon-fill transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
        )}
      </div>
    </div>
  );
}

export function TranscriptPanel({
  transcript,
  run,
  canStart,
  onStart,
  onSave,
  onSeek,
  actions,
  className,
}: {
  transcript: MediaTranscriptRow | undefined;
  run: TranscriptRunState | undefined;
  canStart: boolean;
  onStart: () => void;
  onSave: (input: { segments?: Array<{ text: string }>; text?: string; reset?: boolean }) => Promise<void>;
  onSeek?: (seconds: number) => void;
  actions?: ReactNode;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draftSegments, setDraftSegments] = useState<string[]>([]);
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);
  const view = transcript?.status === "completed" ? effectiveTranscript(transcript) : null;
  const keyMoments = (Array.isArray(transcript?.key_moments) ? transcript?.key_moments : []) as TranscriptKeyMoment[];
  const running = Boolean(run && run.phase !== "error");
  const stale = transcript ? isTranscriptStale(transcript) : false;
  const serverBusy = transcript?.status === "processing" && !stale;

  useEffect(() => {
    if (!editing || !view) return;
    setDraftSegments(view.segments.map((segment) => segment.text));
    setDraftText(view.text);
    // Only reset drafts when editing starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function save(input: { segments?: Array<{ text: string }>; text?: string; reset?: boolean }) {
    setSaving(true);
    try {
      await onSave(input);
      setEditing(false);
      toast.success(input.reset ? "Original transcript restored." : "Transcript corrections saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The transcript could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const status = transcriptStatusLabel(transcript, run);
  return (
    <div className={cn("rounded-xl border border-border bg-background/40 p-3", className)}>
      <div className="flex items-center gap-2">
        <AudioLines className="h-4 w-4 text-neon-cyan" />
        <p className="text-sm font-semibold">Transcript</p>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            status === "Transcribed" || status === "Edited by you"
              ? "bg-success/15 text-success"
              : status === "Failed" || status === "Stopped"
                ? "bg-warning/15 text-warning"
                : "bg-surface text-muted-foreground",
          )}
        >
          {status}
        </span>
      </div>

      <div className="mt-2 space-y-2">
        {running && run && <RunProgress run={run} />}

        {!running && run?.phase === "error" && (
          <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {run.message}
          </p>
        )}

        {!running && serverBusy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Speech-to-text is still working on this clip.
          </p>
        )}

        {!running && !view && !serverBusy && (
          <>
            {transcript?.status === "failed" && transcript.error_message && run?.phase !== "error" && (
              <p className="text-xs text-warning">{transcript.error_message}</p>
            )}
            {stale && <p className="text-xs text-warning">The last attempt stopped before finishing.</p>}
            {transcript?.status === "no_speech" ? (
              <p className="text-xs text-muted-foreground">No speech was found in this clip's audio.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={onStart} disabled={!canStart}>
                  <AudioLines /> {transcript?.status === "failed" || stale || run?.phase === "error" ? "Try again" : "Transcribe"}
                </Button>
                {transcript && transcript.attempt_count > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    Attempt {transcript.attempt_count} of {MAX_TRANSCRIPT_ATTEMPTS} today
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {view && !editing && (
          <>
            <p className="text-[11px] text-muted-foreground">
              {view.evidence === "user_corrected_transcript" ? "Corrected by you · " : "Speech-to-text · "}
              {view.hasTimestamps ? "timed to short speech sections" : "no timestamps (read from the original file)"}
            </p>
            {keyMoments.length > 0 && (
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-neon-violet" /> Key moments
                </p>
                <ul className="mt-1 space-y-1">
                  {keyMoments.map((moment) => (
                    <li key={`${moment.segmentIndex}-${moment.start}`}>
                      <button
                        type="button"
                        disabled={!onSeek}
                        onClick={() => onSeek?.(moment.start)}
                        className="w-full rounded-lg border border-border bg-surface/40 p-2 text-left text-xs disabled:cursor-default"
                      >
                        <span className="font-semibold tabular-nums text-neon-cyan">{formatTranscriptStamp(moment.start)}</span>{" "}
                        <span className="font-medium">{moment.label}</span>
                        <span className="mt-0.5 block text-muted-foreground">“{moment.quote}”</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[10px] text-muted-foreground">Labels written by AI; quotes come from the transcript.</p>
              </div>
            )}
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface/30 p-2 text-xs leading-5">
              {view.hasTimestamps ? (
                view.segments.map((segment, index) => (
                  <p key={index}>
                    <button
                      type="button"
                      disabled={!onSeek}
                      onClick={() => onSeek?.(segment.start)}
                      className="mr-1.5 font-semibold tabular-nums text-neon-cyan disabled:cursor-default"
                    >
                      {formatTranscriptStamp(segment.start)}
                    </button>
                    {segment.text || <span className="text-muted-foreground">(blank)</span>}
                  </p>
                ))
              ) : (
                <p className="whitespace-pre-wrap">{view.text}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit transcript
              </Button>
              {transcript?.edited_at && (
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => void save({ reset: true })}>
                  <RotateCcw /> Restore original
                </Button>
              )}
              {actions}
            </div>
          </>
        )}

        {view && editing && (
          <>
            <p className="text-[11px] text-muted-foreground">Fix words only; timestamps stay as transcribed. Your corrections are used ahead of the original.</p>
            {view.hasTimestamps ? (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {sanitizeSegments(transcript?.segments).map((segment, index) => (
                  <label key={index} className="block text-xs">
                    <span className="font-semibold tabular-nums text-neon-cyan">{formatTranscriptStamp(segment.start)}</span>
                    <textarea
                      rows={2}
                      value={draftSegments[index] ?? ""}
                      onChange={(event) =>
                        setDraftSegments((current) => current.map((text, i) => (i === index ? event.target.value : text)))
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                rows={6}
                aria-label="Transcript text"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              />
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={saving}
                onClick={() =>
                  void save(view.hasTimestamps ? { segments: draftSegments.map((text) => ({ text })) } : { text: draftText })
                }
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />} Save corrections
              </Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
