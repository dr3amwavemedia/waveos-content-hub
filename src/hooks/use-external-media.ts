import { supabase } from "@/integrations/supabase/client";

export type ExternalMediaProvider = "google_drive" | "dropbox";

export type ExternalProviderFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailUrl: string | null;
  webUrl: string | null;
  parentId: string | null;
};

async function providerRequest<T>(
  provider: ExternalMediaProvider,
  suffix: string,
  body: Record<string, unknown>,
) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again to connect external media.");
  const response = await fetch(`/api/external-media/${provider}${suffix}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(json.error ?? "External media request failed.");
  return json;
}

export function getExternalMediaStatus(provider: ExternalMediaProvider, workspaceId: string) {
  return providerRequest<{
    configured: boolean;
    connected: boolean;
    account: { email: string | null; updatedAt: string | null } | null;
  }>(provider, "", { action: "status", workspaceId });
}

export function startExternalMediaConnection(provider: ExternalMediaProvider, workspaceId: string) {
  return providerRequest<{ url: string }>(provider, "", { action: "connect", workspaceId });
}

export function disconnectExternalMedia(provider: ExternalMediaProvider, workspaceId: string) {
  return providerRequest<{ connected: false }>(provider, "", { action: "disconnect", workspaceId });
}

export function listExternalMedia(
  provider: ExternalMediaProvider,
  workspaceId: string,
  query: string,
) {
  return providerRequest<{ files: ExternalProviderFile[] }>(provider, "/files", {
    action: "list",
    workspaceId,
    query,
  });
}

export function getGooglePickerToken(workspaceId: string) {
  return providerRequest<{
    accessToken: string;
    clientId: string;
    appId: string;
    apiKey: string;
  }>("google_drive", "/files", { action: "picker_token", workspaceId });
}

export function importExternalMedia(
  provider: ExternalMediaProvider,
  workspaceId: string,
  files: ExternalProviderFile[],
) {
  return providerRequest<{ imported: { id: string; name: string }[] }>(provider, "/files", {
    action: "import",
    workspaceId,
    files,
  });
}
