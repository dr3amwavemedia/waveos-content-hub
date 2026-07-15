import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  tags: string[];
  uploaded_by: string | null;
  created_at: string;
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
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MediaAsset[];
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
    }) => {
      if (!workspaceId) throw new Error("No workspace");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      // Probe dimensions/duration client-side for images and videos.
      const probe = await probeMedia(input.file);

      const cleanName = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const path = `${workspaceId}/${crypto.randomUUID()}-${cleanName}`;

      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, input.file, {
          cacheControl: "3600",
          contentType: input.file.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data, error } = await supabase
        .from("media_assets")
        .insert({
          workspace_id: workspaceId,
          folder_id: input.folderId,
          name: input.file.name,
          storage_path: path,
          mime_type: input.file.type || "application/octet-stream",
          size_bytes: input.file.size,
          width: probe.width,
          height: probe.height,
          duration_seconds: probe.duration,
          tags: input.tags,
          uploaded_by: auth.user.id,
        })
        .select()
        .single();
      if (error) {
        // Best-effort cleanup on DB failure
        await supabase.storage.from("media").remove([path]);
        throw error;
      }
      return data as MediaAsset;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media", "assets", workspaceId] }),
  });
}

export function useDeleteAsset(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (asset: MediaAsset) => {
      await supabase.storage.from("media").remove([asset.storage_path]);
      const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media", "assets", workspaceId] }),
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
  const { data, error } = await supabase.storage
    .from("media")
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
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
        v.onloadedmetadata = () =>
          resolve({ w: v.videoWidth, h: v.videoHeight, d: v.duration });
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
