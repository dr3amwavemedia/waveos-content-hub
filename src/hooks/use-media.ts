import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getExternalMediaPreviewUrl } from "@/hooks/use-external-media";

export interface MediaFolder {
  id: string;
  workspace_id: string;
  parent_folder_id: string | null;
  name: string;
  created_at: string;
}

export interface MediaAsset {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  name: string;
  storage_path: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  tags: string[];
  uploaded_by: string | null;
  created_at: string;
  source_provider: "waveos" | "google_drive" | "dropbox" | "frameio";
  external_file_id: string | null;
  external_parent_id: string | null;
  source_web_url: string | null;
  thumbnail_url: string | null;
  source_metadata: Record<string, unknown>;
}

export const MEDIA_FILE_LIMIT_BYTES = 300 * 1024 * 1024;
export const WORKSPACE_MEDIA_LIMIT_BYTES = 500 * 1024 * 1024;
export const TEMPORARY_POST_UPLOAD_TAG = "temporary-post-upload";

function formatMegabytes(bytes: number) {
  return `${Math.max(0, bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function friendlyMediaUploadError(error: { message?: string }) {
  const message = error.message ?? "";
  if (
    message.includes("media_file_limit_exceeded") ||
    message.toLowerCase().includes("maximum allowed size")
  ) {
    return new Error("This file is too large. WaveOS accepts files up to 300 MB.");
  }
  if (message.includes("workspace_media_quota_exceeded")) {
    return new Error(
      "This workspace has reached its 500 MB local media allowance. Delete an unused local file or link it from Google Drive or Dropbox.",
    );
  }
  if (message.includes("global_media_safety_limit_exceeded")) {
    return new Error(
      "WaveOS shared storage is temporarily full. Use Google Drive or Dropbox, or contact support.",
    );
  }
  return error instanceof Error ? error : new Error(message || "Media could not be uploaded.");
}

export function useMediaFolders(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["media", "folders", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_folders")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MediaFolder[];
    },
  });
}

export function useMediaAssets(
  workspaceId: string | null | undefined,
  filters: {
    folderId?: string | null; // null = root, undefined = all
    search?: string;
    tag?: string | null;
    kind?: "all" | "image" | "video";
    source?: "waveos" | "google_drive" | "dropbox";
  } = {},
) {
  return useQuery({
    queryKey: ["media", "assets", workspaceId, filters],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = supabase
        .from("media_assets")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (filters.folderId === null) q = q.is("folder_id", null);
      else if (filters.folderId) q = q.eq("folder_id", filters.folderId);
      if (filters.search) q = q.ilike("name", `%${filters.search}%`);
      if (filters.tag) q = q.contains("tags", [filters.tag]);
      if (filters.kind === "image") q = q.like("mime_type", "image/%");
      if (filters.kind === "video") q = q.like("mime_type", "video/%");
      if (filters.source) q = q.eq("source_provider", filters.source);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MediaAsset[];
    },
  });
}

export function useMediaStorageUsage(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["media", "storage-usage", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .select("size_bytes")
        .eq("workspace_id", workspaceId!)
        .eq("source_provider", "waveos")
        .not("storage_path", "is", null)
        .is("archived_at", null);
      if (error) throw error;
      const usedBytes = (data ?? []).reduce((sum, asset) => sum + Number(asset.size_bytes ?? 0), 0);
      return {
        usedBytes,
        limitBytes: WORKSPACE_MEDIA_LIMIT_BYTES,
        remainingBytes: Math.max(WORKSPACE_MEDIA_LIMIT_BYTES - usedBytes, 0),
      };
    },
  });
}

export function useCreateFolder(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; parentId: string | null }) => {
      if (!workspaceId) throw new Error("No workspace");
      const { data, error } = await supabase
        .from("media_folders")
        .insert({
          workspace_id: workspaceId,
          parent_folder_id: input.parentId,
          name: input.name,
        })
        .select()
        .single();
      if (error) throw error;
      return data as MediaFolder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media", "folders", workspaceId] }),
  });
}

export function useUploadAsset(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      folderId: string | null;
      tags: string[];
      temporary?: boolean;
    }) => {
      if (!workspaceId) throw new Error("No workspace");
      if (input.file.size > MEDIA_FILE_LIMIT_BYTES) {
        throw new Error(
          `“${input.file.name}” is ${formatMegabytes(input.file.size)}. WaveOS accepts files up to 300 MB.`,
        );
      }
      const supportedTypes = new Set(["image/jpeg", "image/png", "video/mp4", "video/quicktime"]);
      const extension = input.file.name.split(".").pop()?.toLowerCase() ?? "";
      if (
        !supportedTypes.has(input.file.type.toLowerCase()) &&
        !["jpg", "jpeg", "png", "mp4", "mov"].includes(extension)
      ) {
        throw new Error("Use a JPG, PNG, MP4 or MOV file.");
      }
      const normalizedMimeType = supportedTypes.has(input.file.type.toLowerCase())
        ? input.file.type.toLowerCase()
        : (
            {
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              mp4: "video/mp4",
              mov: "video/quicktime",
            } as Record<string, string>
          )[extension];
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const { data: existing, error: usageError } = await supabase
        .from("media_assets")
        .select("size_bytes")
        .eq("workspace_id", workspaceId)
        .eq("source_provider", "waveos")
        .not("storage_path", "is", null)
        .is("archived_at", null);
      if (usageError) throw usageError;
      const usedBytes = (existing ?? []).reduce(
        (sum, asset) => sum + Number(asset.size_bytes ?? 0),
        0,
      );
      if (usedBytes + input.file.size > WORKSPACE_MEDIA_LIMIT_BYTES) {
        const remaining = Math.max(WORKSPACE_MEDIA_LIMIT_BYTES - usedBytes, 0);
        throw new Error(
          `Not enough local storage for “${input.file.name}”. This workspace has ${formatMegabytes(remaining)} remaining of its 500 MB allowance. Delete an unused local file or link it from Google Drive or Dropbox.`,
        );
      }

      // Probe dimensions/duration client-side for images and videos.
      const probe = await probeMedia(input.file);

      const cleanName = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const path = `${workspaceId}/${crypto.randomUUID()}-${cleanName}`;

      const { error: upErr } = await supabase.storage.from("media").upload(path, input.file, {
        cacheControl: "3600",
        contentType: normalizedMimeType,
        upsert: false,
      });
      if (upErr) throw friendlyMediaUploadError(upErr);

      const { data, error } = await supabase
        .from("media_assets")
        .insert({
          workspace_id: workspaceId,
          folder_id: input.folderId,
          name: input.file.name,
          storage_path: path,
          mime_type: normalizedMimeType,
          size_bytes: input.file.size,
          width: probe.width,
          height: probe.height,
          duration_seconds: probe.duration,
          tags: input.temporary
            ? Array.from(new Set([...input.tags, TEMPORARY_POST_UPLOAD_TAG]))
            : input.tags,
          uploaded_by: auth.user.id,
        })
        .select()
        .single();
      if (error) {
        // Best-effort cleanup on DB failure
        await supabase.storage.from("media").remove([path]);
        throw friendlyMediaUploadError(error);
      }
      return data as MediaAsset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media", "assets", workspaceId] });
      qc.invalidateQueries({ queryKey: ["media", "storage-usage", workspaceId] });
      qc.invalidateQueries({ queryKey: ["your-content", "media", workspaceId] });
    },
  });
}

export function useDeleteAsset(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (asset: MediaAsset) => {
      if (asset.storage_path) {
        await supabase.storage.from("media").remove([asset.storage_path]);
      }
      const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media", "assets", workspaceId] });
      qc.invalidateQueries({ queryKey: ["media", "storage-usage", workspaceId] });
      qc.invalidateQueries({ queryKey: ["your-content", "media", workspaceId] });
    },
  });
}

export function useUpdateAssetTags(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; tags: string[]; folderId?: string | null }) => {
      const patch: { tags: string[]; folder_id?: string | null } = { tags: input.tags };
      if (input.folderId !== undefined) patch.folder_id = input.folderId;
      const { error } = await supabase.from("media_assets").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media", "assets", workspaceId] }),
  });
}

export async function getSignedMediaUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from("media").createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function getMediaPreviewUrl(
  asset: MediaAsset,
  expiresIn = 3600,
  mode: "thumbnail" | "content" = "content",
) {
  if (asset.source_provider === "waveos") {
    if (!asset.storage_path) throw new Error("Media file is missing its storage path.");
    return getSignedMediaUrl(asset.storage_path, expiresIn);
  }
  if (asset.source_provider === "google_drive" || asset.source_provider === "dropbox") {
    const result = await getExternalMediaPreviewUrl(
      asset.source_provider,
      asset.workspace_id,
      asset.id,
      mode,
    );
    return result.url;
  }
  if (asset.source_provider === "frameio") return asset.thumbnail_url ?? asset.source_web_url;
  return asset.thumbnail_url ?? asset.source_web_url;
}

async function probeMedia(file: File): Promise<{
  width: number | null;
  height: number | null;
  duration: number | null;
}> {
  if (typeof window === "undefined") return { width: null, height: null, duration: null };
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const img = new Image();
      const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = url;
      });
      return { width: dims?.w ?? null, height: dims?.h ?? null, duration: null };
    }
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      const meta = await new Promise<{ w: number; h: number; d: number } | null>((resolve) => {
        v.onloadedmetadata = () => resolve({ w: v.videoWidth, h: v.videoHeight, d: v.duration });
        v.onerror = () => resolve(null);
        v.src = url;
      });
      return { width: meta?.w ?? null, height: meta?.h ?? null, duration: meta?.d ?? null };
    }
    return { width: null, height: null, duration: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}
