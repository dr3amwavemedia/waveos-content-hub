import { supabase } from "@/integrations/supabase/client";

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
  frameioRequest<{ configured: boolean; connected: boolean; email: string | null }>({ action: "status" });

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
};

export const getFrameioWorkspaceStatus = (workspaceId: string) =>
  frameioRequest<{ configured: boolean; connected: boolean; label?: string }>({
    action: "status",
    workspaceId,
  }, "/api/frameio/media");

export const syncFrameioWorkspaceShare = (workspaceId: string) =>
  frameioRequest<{ ready: true }>({ action: "sync", workspaceId }, "/api/frameio/media");

export const listFrameioWorkspaceMedia = (workspaceId: string, query: string) =>
  frameioRequest<{ files: FrameioProviderFile[]; label: string }>({
    action: "list",
    workspaceId,
    query,
  }, "/api/frameio/media");

export const importFrameioWorkspaceMedia = (workspaceId: string, fileIds: string[]) =>
  frameioRequest<{ imported: { id: string; name: string }[] }>({
    action: "import",
    workspaceId,
    fileIds,
  }, "/api/frameio/media");
