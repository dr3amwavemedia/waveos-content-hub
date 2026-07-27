import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { VISION_ASSETS_BUCKET } from "./types";

interface VisionLogoProps {
  storagePath: string;
  alt: string;
  fit?: "contain" | "cover";
  shareToken?: string;
  className?: string;
  fallback?: string;
}

/**
 * Resolves a signed URL for a Vision Studio logo. Owners (authenticated with
 * RLS access to storage.objects) use `createSignedUrl` directly. Public
 * viewers hit `/api/public/vision-asset` which verifies the share token and
 * returns a scoped signed URL from the service role.
 */
export function VisionLogo({
  storagePath,
  alt,
  fit = "contain",
  shareToken,
  className,
  fallback,
}: VisionLogoProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setUrl(null);
    if (!storagePath) return;
    (async () => {
      try {
        if (shareToken) {
          const params = new URLSearchParams({ token: shareToken, path: storagePath });
          const response = await fetch(`/api/public/vision-asset?${params.toString()}`);
          if (!response.ok) throw new Error("asset unavailable");
          const json = (await response.json()) as { url?: string };
          if (!cancelled && json.url) setUrl(json.url);
          else if (!cancelled) setFailed(true);
        } else {
          const { data, error } = await supabase.storage
            .from(VISION_ASSETS_BUCKET)
            .createSignedUrl(storagePath, 3600);
          if (error || !data?.signedUrl) throw error ?? new Error("no url");
          if (!cancelled) setUrl(data.signedUrl);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath, shareToken]);

  if (failed || !storagePath) {
    return fallback ? (
      <span className={cn("truncate text-sm font-medium text-white/80", className)}>{fallback}</span>
    ) : null;
  }
  if (!url) {
    return <span className={cn("block h-full w-full animate-pulse rounded-lg bg-white/5", className)} />;
  }
  return (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      className={cn(
        fit === "cover" ? "h-full w-full object-cover" : "h-full w-full object-contain",
        className,
      )}
    />
  );
}
