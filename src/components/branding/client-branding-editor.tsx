import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image, Loader2, Palette, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_WORKSPACE_ACCENT, useWorkspaceBranding } from "@/hooks/use-workspace-branding";

const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export function ClientBrandingEditor({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const qc = useQueryClient();
  const branding = useWorkspaceBranding(workspaceId);
  const [accentColor, setAccentColor] = useState(DEFAULT_WORKSPACE_ACCENT);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);

  useEffect(() => {
    setAccentColor(branding.data?.accentColor ?? DEFAULT_WORKSPACE_ACCENT);
    setPendingLogo(null);
  }, [branding.data?.accentColor, workspaceId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!/^#[0-9a-f]{6}$/i.test(accentColor)) throw new Error("Choose a valid brand color.");
      let logoPath = branding.data?.logoPath ?? null;
      if (pendingLogo) {
        if (!/^image\/(png|jpeg|webp)$/.test(pendingLogo.type)) throw new Error("Use a PNG, JPG, or WebP logo.");
        if (pendingLogo.size > 5 * 1024 * 1024) throw new Error("Logo must be smaller than 5 MB.");
        const extension = pendingLogo.name.split(".").pop()?.toLowerCase() || "png";
        logoPath = `${workspaceId}/logo.${extension}`;
        const { error } = await supabase.storage.from("workspace-branding").upload(logoPath, pendingLogo, {
          contentType: pendingLogo.type,
          upsert: true,
        });
        if (error) throw error;
      }
      const { error } = await db.from("workspace_branding").upsert({
        workspace_id: workspaceId,
        logo_path: logoPath,
        accent_color: accentColor.toUpperCase(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["workspace-branding", workspaceId] });
      setPendingLogo(null);
      toast.success(`${workspaceName} branding updated.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update branding."),
  });

  const previewUrl = pendingLogo ? URL.createObjectURL(pendingLogo) : branding.data?.logoUrl;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Palette className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">{workspaceName} workspace identity</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">The logo appears on the client overview and workspace switcher. The accent color personalizes buttons, highlights, and glow effects.</p>
          </div>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-primary/25 bg-elevated shadow-[var(--shadow-glow)]">
          {previewUrl ? <img src={previewUrl} alt={`${workspaceName} logo preview`} className="h-full w-full object-contain p-3" /> : <Image className="h-8 w-8 text-primary" />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client logo</span>
            <span className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-elevated px-4 py-3 text-sm font-medium text-foreground hover:border-primary/40">
              <Upload className="h-4 w-4 text-primary" /> {pendingLogo ? pendingLogo.name : branding.data?.logoPath ? "Replace logo" : "Upload logo"}
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => setPendingLogo(event.target.files?.[0] ?? null)} />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand accent</span>
            <span className="flex items-center gap-3 rounded-xl border border-border bg-elevated px-3 py-2">
              <input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" aria-label="Brand accent color" />
              <input value={accentColor} onChange={(event) => setAccentColor(event.target.value)} maxLength={7} className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase text-foreground outline-none" aria-label="Brand accent hex value" />
            </span>
          </label>
        </div>
      </div>
      <div className="flex justify-end border-t border-border pt-4">
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending || branding.isLoading} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save client branding
        </button>
      </div>
    </div>
  );
}
