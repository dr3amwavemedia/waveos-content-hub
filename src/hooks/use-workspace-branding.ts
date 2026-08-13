import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";

import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_WORKSPACE_ACCENT = "#4DB8FF";

export type WorkspaceBranding = {
  workspaceId: string;
  logoPath: string | null;
  logoUrl: string | null;
  accentColor: string;
};

export function workspaceBrandingError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "";
  if (message.includes("workspace_branding") || message.includes("schema cache"))
    return "Workspace branding is still being activated. Please try again after the latest database update finishes.";
  if (message.toLowerCase().includes("row-level security") || message.toLowerCase().includes("permission"))
    return "Your account does not have permission to change this workspace's branding.";
  return message || "Could not update workspace branding.";
}

const db = supabase as unknown as {
  // workspace_branding is added by the pending migration and will be included
  // the next time generated Supabase types are refreshed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function workspaceLogoUrl(path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("workspace-branding")
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export function useWorkspaceBranding(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace-branding", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceBranding> => {
      const { data, error } = await db
        .from("workspace_branding")
        .select("workspace_id,logo_path,accent_color")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      const logoPath = typeof data?.logo_path === "string" ? data.logo_path : null;
      return {
        workspaceId: workspaceId!,
        logoPath,
        logoUrl: workspaceLogoUrl(logoPath),
        accentColor:
          typeof data?.accent_color === "string"
            ? data.accent_color
            : DEFAULT_WORKSPACE_ACCENT,
      };
    },
  });
}

export function workspaceThemeStyle(accentColor: string | undefined) {
  const accent = /^#[0-9a-f]{6}$/i.test(accentColor ?? "")
    ? accentColor!
    : DEFAULT_WORKSPACE_ACCENT;
  const rgb = [1, 3, 5].map((offset) => Number.parseInt(accent.slice(offset, offset + 2), 16));
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return {
    "--primary": accent,
    "--primary-glow": `color-mix(in oklab, ${accent} 72%, white)`,
    "--primary-foreground": luminance > 0.58 ? "#07111f" : "#ffffff",
    "--accent": `color-mix(in oklab, ${accent} 82%, black)`,
    "--ring": `color-mix(in oklab, ${accent} 55%, transparent)`,
    "--border": `color-mix(in oklab, ${accent} 14%, transparent)`,
    "--border-strong": `color-mix(in oklab, ${accent} 28%, transparent)`,
    "--sidebar-primary": accent,
    "--sidebar-primary-foreground": luminance > 0.58 ? "#07111f" : "#ffffff",
    "--sidebar-ring": `color-mix(in oklab, ${accent} 55%, transparent)`,
    "--sidebar-border": `color-mix(in oklab, ${accent} 12%, transparent)`,
  } as CSSProperties;
}
