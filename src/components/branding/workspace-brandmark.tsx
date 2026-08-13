import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function WorkspaceBrandmark({
  logoUrl,
  name,
  className,
}: {
  logoUrl: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [logoUrl]);

  return (
    <div
      className={cn(
        "flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/25 bg-card/90 shadow-[var(--shadow-glow)]",
        className,
      )}
    >
      {logoUrl && !imageFailed ? (
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="h-full w-full object-contain p-2"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
      )}
    </div>
  );
}
