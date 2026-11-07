import { useEffect, useState } from "react";
import { Check, FileImage, FileVideo, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listExternalMedia, importExternalMedia, type ExternalProviderFile } from "@/hooks/use-external-media";
import { authorizedDriveSelection } from "@/lib/drive-authorized-selection";

export function DriveAuthorizedBrowser({ workspaceId, selected, onImported, onBack }: {
  workspaceId: string;
  selected: string[];
  onImported: (ids: string[]) => void;
  onBack: () => void;
}) {
  const [files, setFiles] = useState<ExternalProviderFile[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFiles([]);
    setChosen([]);
    setError(null);
    listExternalMedia("google_drive", workspaceId, "").then((result) => {
      if (active) setFiles(result.files);
    }).catch(() => {
      if (active) setError("Previously authorized files could not be loaded. Your connection is still saved. Try again or return to Google Picker.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceId, reload]);

  async function addChosen() {
    const picked = authorizedDriveSelection(files, chosen);
    if (!picked.length || importing) return;
    setImporting(true);
    setError(null);
    try {
      const result = await importExternalMedia("google_drive", workspaceId, picked);
      if (!result.imported.length) {
        setError("No files were added. Try again or return to Google Picker.");
        return;
      }
      onImported(result.imported.map((item) => item.id).filter((id) => !selected.includes(id)));
      setChosen([]);
    } catch {
      setError("These files could not be added. Your post is unchanged. Try again or return to Google Picker.");
    } finally { setImporting(false); }
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-foreground">Previously authorized Drive files</h3>
      <Button variant="outline" onClick={onBack} disabled={importing}>Back to Google Picker</Button>
    </div>
    <p className="text-xs text-muted-foreground">Only files previously shared with WaveOS can appear here, not your entire Drive. This shows media from the first 100 authorized entries. Use Google Picker to allow additional files.</p>
    {loading ? <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading authorized files…</div> : <>
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setReload((value) => value + 1)} disabled={importing}><RefreshCw className="size-4" />Try again</Button></div>}
      {!error && files.length === 0 && <p role="status" className="py-6 text-sm text-muted-foreground">No previously authorized media is available here. This does not mean your connection is broken. Google Picker is still needed to choose new files.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {files.map((file) => <Button key={file.id} variant="outline" aria-pressed={chosen.includes(file.id)} disabled={importing} onClick={() => setChosen((current) => current.includes(file.id) ? current.filter((id) => id !== file.id) : [...current, file.id])} className="h-auto min-h-14 justify-start whitespace-normal text-left">
          {file.mimeType.startsWith("video/") ? <FileVideo className="size-5 shrink-0" /> : <FileImage className="size-5 shrink-0" />}
          <span className="min-w-0 flex-1 break-words">{file.name}</span>
          {chosen.includes(file.id) && <Check className="size-4 shrink-0" />}
        </Button>)}
      </div>
      {chosen.length > 0 && <Button disabled={importing} onClick={addChosen}>{importing && <Loader2 className="size-4 animate-spin" />}Add {chosen.length} to selection</Button>}
    </>}
  </div>;
}