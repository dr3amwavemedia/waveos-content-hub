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
  path: string | null;
  modifiedAt: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

export type ExternalProviderFolder = {
  id: string;
  name: string;
  parentId: string | null;
  path: string | null;
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
  if (!response.ok) {
    const friendlyErrors: Record<string, string> = {
      oauth_state_failed: "Google Drive could not start. Please try again.",
      saved_draft_required: "Save this post as a draft, then try Google Drive again.",
      google_drive_reconnect_required: "Reconnect Google Drive, then try again.",
      not_authorized: "You no longer have access to this workspace. Sign in again.",
    };
    throw new Error(
      (json.error && friendlyErrors[json.error]) ??
        (provider === "google_drive"
          ? "Google Drive could not start. Please try again."
          : "External media request failed."),
    );
  }
  return json;
}

export function getExternalMediaStatus(provider: ExternalMediaProvider, workspaceId: string) {
  return providerRequest<{
    configured: boolean;
    connected: boolean;
    reconnectRequired: boolean;
    diagnosis?: "not_connected" | "missing_permission" | "expired_authorization" | "connection_record_present";
    suggestedAction?: "reconnect_with_provider_consent" | "check_picker_or_provider_api";
    account: { email: string | null; updatedAt: string | null } | null;
  }>(provider, "", { action: "status", workspaceId });
}

export function startExternalMediaConnection(provider: ExternalMediaProvider, workspaceId: string) {
  return providerRequest<{ url: string }>(provider, "", { action: "connect", workspaceId });
}

export function startGoogleDriveMobilePicker(workspaceId: string, returnPath: string) {
  return providerRequest<{ url: string }>("google_drive", "", {
    action: "mobile_picker",
    workspaceId,
    returnPath,
  });
}

export function disconnectExternalMedia(provider: ExternalMediaProvider, workspaceId: string) {
  return providerRequest<{ connected: false; revoked: boolean }>(provider, "", {
    action: "disconnect",
    workspaceId,
  });
}

export function listExternalMedia(
  provider: ExternalMediaProvider,
  workspaceId: string,
  query: string,
  folderId?: string | null,
) {
  return providerRequest<{ files: ExternalProviderFile[]; folders: ExternalProviderFolder[] }>(
    provider,
    "/files",
    {
      action: "list",
      workspaceId,
      query,
      folderId: folderId ?? null,
    },
  );
}

export function getGooglePickerToken(workspaceId: string) {
  return providerRequest<{
    accessToken: string;
    clientId: string;
    appId: string;
    apiKey: string;
  }>("google_drive", "/files", { action: "picker_token", workspaceId });
}

export function getExternalMediaPreviewUrl(
  provider: ExternalMediaProvider,
  workspaceId: string,
  assetId: string,
  mode: "thumbnail" | "content",
) {
  return providerRequest<{ url: string }>(provider, "/files", {
    action: "preview_url",
    workspaceId,
    assetId,
    mode,
  });
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
