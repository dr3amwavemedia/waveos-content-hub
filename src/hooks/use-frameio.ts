import { supabase } from "@/integrations/supabase/client";
import type { MediaPreviewKind } from "@/lib/frameio-media-preview";

async function frameioRequest<T>(body: Record<string, unknown>, path = "/api/frameio") {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Sign in again to manage Frame.io.");
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Frame.io request failed.");
  return result;
}

export const getFrameioServiceStatus = () =>
  frameioRequest<{ configured: boolean; connected: boolean; email: string | null }>({
    action: "status",
  });

export const startFrameioServiceConnection = () =>
  frameioRequest<{ url: string }>({ action: "connect" });

export const disconnectFrameioService = () =>
  frameioRequest<{ connected: false }>({ action: "disconnect" });

export type FrameioProviderFile = {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  thumbnailUrl: string | null;
  viewUrl: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  folderPath: string[];
};

export const getFrameioWorkspaceStatus = (workspaceId: string) =>
  frameioRequest<{ configured: boolean; connected: boolean; label?: string }>(
    {
      action: "status",
      workspaceId,
    },
    "/api/frameio/media",
  );

export const syncFrameioWorkspaceShare = (workspaceId: string) =>
  frameioRequest<{ ready: true }>({ action: "sync", workspaceId }, "/api/frameio/media");

export const listFrameioWorkspaceMedia = (workspaceId: string, query: string) =>
  frameioRequest<{ files: FrameioProviderFile[]; label: string }>(
    {
      action: "list",
      workspaceId,
      query,
    },
    "/api/frameio/media",
  );

export const importFrameioWorkspaceMedia = (workspaceId: string, fileIds: string[]) =>
  frameioRequest<{ imported: { id: string; name: string }[] }>(
    {
      action: "import",
      workspaceId,
      fileIds,
    },
    "/api/frameio/media",
  );

export type FrameioMediaPreview = { url: string; kind: MediaPreviewKind };

// Frame.io links are short-lived; reuse a fresh one briefly so the same tile
// shown in the picker and the post card does not request it twice.
const PREVIEW_CACHE_MS = 5 * 60 * 1000;
const previewCache = new Map<string, { at: number; value: Promise<FrameioMediaPreview> }>();

export function getFrameioMediaPreviewUrl(workspaceId: string, assetId: string) {
  const key = `${workspaceId}:${assetId}`;
  const cached = previewCache.get(key);
  if (cached && Date.now() - cached.at < PREVIEW_CACHE_MS) return cached.value;
  const value = frameioRequest<Partial<FrameioMediaPreview>>(
    { action: "preview_url", workspaceId, assetId },
    "/api/frameio/media",
  ).then((result) => {
    if (typeof result.url !== "string" || (result.kind !== "image" && result.kind !== "video"))
      throw new Error("Frame.io preview is not available yet.");
    return { url: result.url, kind: result.kind };
  });
  previewCache.set(key, { at: Date.now(), value });
  value.catch(() => previewCache.delete(key));
  return value;
}
