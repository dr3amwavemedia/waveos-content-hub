import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

// Tiny reminder shown next to links that leave the portal so clients always
// know how to get back. Keep the copy short and literal — it is a memory aid,
// not documentation.
export function PortalReturnHint({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      This opens in a new tab — check your browser tabs to come back to your WaveOS portal.
    </p>
  );
}
