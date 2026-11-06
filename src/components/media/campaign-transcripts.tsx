import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TranscriptPanel, transcriptStatusLabel } from "@/components/media/transcript-panel";
import { transcribableMedia, useMediaTranscripts, useTranscriptRunner, useSaveTranscriptEdits } from "@/hooks/use-media-transcripts";
import type { MediaAsset } from "@/hooks/use-media";

/** Shared persisted transcript controls, styled by the surrounding device layout. */
export function CampaignTranscripts({ workspaceId, assets }: { workspaceId: string | null; assets: MediaAsset[] }) {
  const media = assets.filter(transcribableMedia);
  const query = useMediaTranscripts(workspaceId, media.map((asset) => asset.id));
  const runner = useTranscriptRunner(workspaceId);
  const save = useSaveTranscriptEdits(workspaceId);
  const [open, setOpen] = useState<string | null>(null);
  if (!media.length) return null;
  return <section className="mt-4 space-y-3 border-t border-border pt-4" aria-label="Campaign transcripts">
    <h3 className="text-sm font-semibold">Transcripts</h3>
    {query.isError && <p role="alert" className="text-sm text-destructive">Saved transcripts could not be loaded. <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>Retry</Button></p>}
    {media.map((asset) => <div key={asset.id} className="border-b border-border pb-3">
      <Button variant="ghost" className="h-auto w-full justify-between whitespace-normal text-left" aria-expanded={open === asset.id} onClick={() => setOpen(open === asset.id ? null : asset.id)}>
        <span className="min-w-0 break-words">{asset.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{transcriptStatusLabel(query.data?.[asset.id], runner.runs[asset.id])}</span>
      </Button>
      {open === asset.id && <TranscriptPanel transcript={query.data?.[asset.id]} run={runner.runs[asset.id]} canStart={!query.isPending && !query.isError && !runner.isRunning(asset.id)} onStart={() => void runner.start(asset)} onSave={(input) => save({ mediaAssetId: asset.id, ...input })} />}
    </div>)}
  </section>;
}