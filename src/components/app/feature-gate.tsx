import { Lock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import type { FeatureKey } from "@/lib/permissions";

interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  /**
   * How to render when the user does not have the feature.
   * - "preview": show the locked preview card (default for Layer 2 promotion)
   * - "hidden": render nothing
   * - "auto": follow the tier's visibility rule (Layer 2 → preview, others → hidden)
   */
  mode?: "preview" | "hidden" | "auto";
  title?: string;
  description?: string;
  preview?: ReactNode;
}

export function FeatureGate({ feature, children, mode = "auto", title, description, preview }: FeatureGateProps) {
  const { can, visibility, isLoading } = usePermissions();
  if (isLoading) return null;
  if (can(feature)) return <>{children}</>;

  const resolvedMode = mode === "auto" ? visibility(feature) : mode;
  if (resolvedMode === "hidden") return null;

  return (
    <LockedPreview title={title} description={description}>
      {preview}
    </LockedPreview>
  );
}

export function LockedPreview({
  title = "Available with a Full Retainer",
  description = "Upgrade to a 6- or 12-month Dream Wave Media retainer to unlock this workspace tool.",
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-surface/60 to-surface/20 p-6">
      {children && <div className="pointer-events-none mb-6 select-none opacity-40 blur-[1.5px]">{children}</div>}
      <div className="relative flex flex-col items-start gap-3 rounded-xl border border-primary/20 bg-background/70 p-5 backdrop-blur-md">
        <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
          <Lock className="h-3.5 w-3.5" /> Preview
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          onClick={() => {
            window.location.href = "mailto:dr3amwavemedia@outlook.com?subject=Upgrade%20my%20WaveOS%20access";
          }}
        >
          <Sparkles className="h-4 w-4" /> Learn about full access
        </button>
      </div>
    </div>
  );
}
