/**
 * Video Maker clip selection, preview loading and edit-recipe persistence shared
 * by the mobile editor and the existing desktop layout.
 */
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/app/workspace-context";
import { getMediaPreviewUrl, useMediaAssets, useUploadAsset, type MediaAsset } from "@/hooks/use-media";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_VIDEO_RECIPE, normalizeVideoRecipe, type VideoEditRecipe } from "@/lib/video-edit-recipe";

export function useVideoMaker() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const videos = useMediaAssets(workspaceId, { kind: "video" });
  const upload = useUploadAsset(workspaceId);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [directPreviewUrl, setDirectPreviewUrl] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewMode, setPreviewMode] = useState<"direct" | "local_fallback" | null>(null);
  const blobPreviewRef = useRef<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [recipe, setRecipe] = useState<VideoEditRecipe>(DEFAULT_VIDEO_RECIPE);
  const [recipeDirty, setRecipeDirty] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);

  useEffect(() => {
    let active = true;
    if (blobPreviewRef.current) {
      URL.revokeObjectURL(blobPreviewRef.current);
      blobPreviewRef.current = null;
    }
    if (!selected) {
      setPreviewUrl(null);
      setDirectPreviewUrl(null);
      setPreviewMode(null);
      setPreviewPending(false);
      setPreviewError(null);
      return () => {
        active = false;
      };
    }
    setPreviewUrl(null);
    setDirectPreviewUrl(null);
    setPreviewMode(null);
    setPreviewPending(true);
    setPreviewError(null);
    void getMediaPreviewUrl(selected)
      .then((url) => {
        if (!active) return;
        if (!url) throw new Error("No preview URL was returned for this video.");
        setDirectPreviewUrl(url);
        setPreviewUrl(url);
        setPreviewMode("direct");
      })
      .catch(() => {
        if (active) {
          setPreviewError(
            "WaveOS could not open the original preview URL for this clip.",
          );
        }
      })
      .finally(() => {
        if (active) setPreviewPending(false);
      });
    return () => {
      active = false;
      if (blobPreviewRef.current) {
        URL.revokeObjectURL(blobPreviewRef.current);
        blobPreviewRef.current = null;
      }
    };
  }, [previewAttempt, selected]);

  // Real timeline thumbnails sampled from the playable source; plain track if unreadable.

  async function prepareLocalPreview() {
    if (!selected || !directPreviewUrl || previewPending) return;
    setPreviewPending(true);
    setPreviewError(null);
    try {
      const response = await fetch(directPreviewUrl, { credentials: "omit" });
      if (!response.ok) throw new Error("The video file could not be downloaded for preview.");
      const sourceBlob = await response.blob();
      if (sourceBlob.type.includes("text/html")) {
        throw new Error("The provider returned a webpage instead of the video file.");
      }
      const blob =
        sourceBlob.type && sourceBlob.type !== "application/octet-stream"
          ? sourceBlob
          : new Blob([await sourceBlob.arrayBuffer()], { type: selected.mime_type || "video/mp4" });
      if (blobPreviewRef.current) URL.revokeObjectURL(blobPreviewRef.current);
      const objectUrl = URL.createObjectURL(blob);
      blobPreviewRef.current = objectUrl;
      setPreviewUrl(objectUrl);
      setPreviewMode("local_fallback");
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : "WaveOS could not prepare a local browser preview for this clip.",
      );
    } finally {
      setPreviewPending(false);
    }
  }

  function selectVideo(asset: MediaAsset) {
    setSelected(asset);
    const stored =
      asset.source_metadata && typeof asset.source_metadata === "object"
        ? asset.source_metadata.video_maker_edit
        : undefined;
    setRecipe(normalizeVideoRecipe(stored, asset.duration_seconds));
    setRecipeDirty(false);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() =>
        previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }

  function continueToPost(destination: "feed" | "story") {
    if (!selected) return;
    void navigate({ to: "/create", search: { media: selected.id, destination } });
  }

  async function uploadVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!file.type.startsWith("video/") && extension !== "mp4" && extension !== "mov") {
      toast.error("Choose an MP4 or MOV video.");
      return;
    }
    try {
      const asset = await upload.mutateAsync({ file, folderId: null, tags: [] });
      selectVideo(asset);
      toast.success("Video uploaded and ready to edit.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Video could not be uploaded.");
    }
  }

  function updateRecipe(patch: Partial<VideoEditRecipe>) {
    setRecipe((current) => ({ ...current, ...patch }));
    setRecipeDirty(true);
  }

  async function saveRecipe() {
    if (!selected || !workspaceId || savingRecipe) return;
    setSavingRecipe(true);
    try {
      const nextMetadata = {
        ...(selected.source_metadata ?? {}),
        video_maker_edit: recipe,
        video_maker_edit_updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("media_assets")
        .update({ source_metadata: nextMetadata as never })
        .eq("id", selected.id)
        .eq("workspace_id", workspaceId)
        .select()
        .single();
      if (error) throw error;
      setSelected(data as MediaAsset);
      setRecipeDirty(false);
      toast.success("Edit setup saved with this clip.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Video changes could not be saved.");
    } finally {
      setSavingRecipe(false);
    }
  }


  return {
    navigate,
    activeWorkspace,
    workspaceId,
    videos,
    upload,
    inputRef,
    previewRef,
    videoRef,
    selected,
    setSelected,
    previewUrl,
    setPreviewUrl,
    directPreviewUrl,
    setDirectPreviewUrl,
    previewPending,
    setPreviewPending,
    previewMode,
    setPreviewMode,
    blobPreviewRef,
    previewError,
    setPreviewError,
    previewAttempt,
    setPreviewAttempt,
    recipe,
    setRecipe,
    recipeDirty,
    setRecipeDirty,
    savingRecipe,
    setSavingRecipe,
    prepareLocalPreview,
    selectVideo,
    continueToPost,
    uploadVideo,
    updateRecipe,
    saveRecipe,
  };
}

export type VideoMakerController = ReturnType<typeof useVideoMaker>;
