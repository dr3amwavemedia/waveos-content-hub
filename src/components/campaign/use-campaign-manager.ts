/**
 * Campaign Manager state and actions shared by the phone layout and the
 * existing desktop layout, so presentation changes never fork business logic.
 */
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspace } from "@/components/app/workspace-context";
import { useWorkflowDraft } from "@/hooks/use-workflow-draft";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCampaignPlan,
  validateCampaignPlanningInput,
  type CampaignGoal,
  type CampaignPlanningInput,
  type CampaignPlanningItem,
} from "@/lib/phase-one-planning";
import { waveAssist } from "@/lib/wave-assist.functions";
import {
  createCampaignPostDrafts,
  generateCampaignDirection,
  saveCampaignMediaCorrections,
} from "@/lib/campaign-ideas.functions";
import {
  campaignLaunchBlocker,
  campaignStepCompletion,
  moveListItem,
  orderCampaignMedia,
  type CampaignBuilderState,
} from "@/lib/campaign-builder-steps";
import {
  getMediaPreviewUrl,
  useMediaAssets,
  useMediaFolders,
  useUploadAsset,
  type MediaAsset,
} from "@/hooks/use-media";

export const db = supabase as unknown as {
  // Phase 1 additive tables can land before regenerated client definitions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export const PLATFORM_OPTIONS = ["instagram", "facebook", "linkedin", "tiktok", "youtube", "x"];
export const DAY_OPTIONS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const MAX_SAMPLED_VIDEOS = 6;
export const GOAL_LABELS: Record<CampaignGoal, string> = {
  awareness: "Brand Awareness",
  engagement: "Increase Engagement",
  leads: "Generate Leads",
  launch: "Promote a Service",
  retention: "Keep Customers",
};

export function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export const DEFAULT_INPUT: CampaignPlanningInput = {
  name: "",
  goal: "awareness",
  startDate: dateOffset(1),
  endDate: dateOffset(30),
  platforms: ["instagram"],
  maxPosts: 8,
  postingHours: ["09:00", "15:00"],
  excludedDays: ["saturday", "sunday"],
  approvalRequired: true,
  optimizationMode: "approval_required",
  contentFormats: ["feed", "story"],
};

export interface CampaignPlanRow {
  id: string;
  name: string;
  goal: CampaignGoal;
  start_date: string;
  end_date: string;
  platforms: string[];
  max_posts: number;
  posting_hours: string[];
  excluded_days: string[];
  approval_required: boolean;
  optimization_mode: "automatic" | "approval_required";
  status: string;
  created_at: string;
  primary_caption?: string | null;
}

export interface CampaignLinkedContentRow {
  id: string;
  title: string | null;
  status: string;
  scheduled_at: string | null;
  media_asset_ids: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  primary_caption?: string | null;
  internal_notes?: string | null;
}

export type MediaRecommendation = {
  mediaId: string;
  reason: string;
  platforms: string[];
  suggestedDay: string;
  caption: string;
  hashtags: string[];
  contentType: string;
  visualSummary: string;
  likelyPurpose: string;
  hookPotential: "low" | "medium" | "high";
  suggestedPlatforms: string[];
  placement: "feed" | "story" | "both";
  confidence: "low" | "medium" | "high";
  inspectionMode: "photo" | "video_frames" | "metadata_only";
  /** Set by the server from stored transcripts, never by the model. */
  transcriptEvidence?: "user_corrected_transcript" | "speech_to_text_transcript" | "none";
};

export type CampaignDirection = {
  angle: string;
  audienceInsight: string;
  pillars: Array<{ name: string; purpose: string; examples: string[] }>;
  hooks: string[];
  notes: string[];
  mediaRecommendations: MediaRecommendation[];
};

export type AnalysisProgress = {
  phase: "frames" | "ai";
  framesDone: number;
  framesTotal: number;
  assetCount: number;
};


export function useCampaignManager() {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const queryClient = useQueryClient();
  const [input, setInput] = useState<CampaignPlanningInput>(DEFAULT_INPUT);
  const [preview, setPreview] = useState<CampaignPlanningItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const editRevisionRef = useRef(0);
  const [mobileStep, setMobileStep] = useState(0);
  const campaignDirectionFn = useServerFn(generateCampaignDirection);
  const saveCorrectionsFn = useServerFn(saveCampaignMediaCorrections);
  const createDraftsFn = useServerFn(createCampaignPostDrafts);
  const [draftsBusy, setDraftsBusy] = useState(false);
  const [draftsCreated, setDraftsCreated] = useState(false);
  const captionAssistFn = useServerFn(waveAssist);
  const [campaignDirection, setCampaignDirection] = useState<CampaignDirection | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [selectedMediaIds,setSelectedMediaIds]=useState<string[]>([]);
  const [confirmedMediaIds,setConfirmedMediaIds]=useState<string[]>([]);
  const [showSharedMediaPicker,setShowSharedMediaPicker]=useState(false);
  const [mediaFolder,setMediaFolder]=useState<string>("all");
  const mediaInputRef=useRef<HTMLInputElement|null>(null);
  const mediaFolders=useMediaFolders(workspaceId);
  const mediaAssets=useMediaAssets(workspaceId,{folderId:mediaFolder==="all"?undefined:mediaFolder==="root"?null:mediaFolder});
  const allMediaAssets = useMediaAssets(workspaceId);
  const uploadMedia=useUploadAsset(workspaceId);
  const [directionBusy, setDirectionBusy] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [mediaSectionOpen, setMediaSectionOpen] = useState(false);
  const [bulkCaptionBusy, setBulkCaptionBusy] = useState(false);
  const [captionBusyId, setCaptionBusyId] = useState<string | null>(null);
  const [campaignCaptionDrafts, setCampaignCaptionDrafts] = useState<Record<string, string>>({});
  const [continuedFrom, setContinuedFrom] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<{ name: string; contentLinked: boolean } | null>(null);
  type BuilderDraft = CampaignPlanningInput & {
    builder?: { selectedMediaIds: string[]; confirmedMediaIds: string[]; campaignDirection: CampaignDirection | null; preview: CampaignPlanningItem[]; campaignCaptionDrafts: Record<string, string>; continuedFrom: string | null };
  };
  const draftPayload: BuilderDraft = { ...input, builder: { selectedMediaIds, confirmedMediaIds, campaignDirection, preview, campaignCaptionDrafts, continuedFrom } };
  const workflowDraft = useWorkflowDraft<BuilderDraft>({
    workspaceId,
    workflowKey: "campaign-manager",
  });
  const autoSaveDraft = workflowDraft.save.mutateAsync;

  useEffect(() => {
    if (!dirty || !workspaceId) return;
    const revision = editRevisionRef.current;
    setAutoSaveState("saving");
    const timer = window.setTimeout(() => {
      void autoSaveDraft(draftPayload).then(() => {
        if (editRevisionRef.current === revision) setDirty(false);
        setAutoSaveState("saved");
      }).catch(() => setAutoSaveState("error"));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [autoSaveDraft, dirty, input, workspaceId, selectedMediaIds, confirmedMediaIds, campaignDirection, preview, campaignCaptionDrafts, continuedFrom]);

  const campaigns = useQuery({
    queryKey: ["campaign-plans", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const base = db
        .from("campaign_plans")
        .select("id,name,goal,start_date,end_date,platforms,max_posts,posting_hours,excluded_days,approval_required,optimization_mode,status,created_at")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(12);
      const primary = await base;
      if (!primary.error) return (primary.data ?? []) as CampaignPlanRow[];

      const message = String(primary.error?.message ?? "");
      if (/optimization_mode|schema cache|column/i.test(message)) {
        const fallback = await db
          .from("campaign_plans")
          .select("id,name,goal,start_date,end_date,platforms,max_posts,posting_hours,excluded_days,approval_required,status,created_at")
          .eq("workspace_id", workspaceId!)
          .order("created_at", { ascending: false })
          .limit(12);
        if (fallback.error) throw fallback.error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (fallback.data ?? []).map((row: any) => ({
          ...row,
          optimization_mode: "approval_required",
        })) as CampaignPlanRow[];
      }
      throw primary.error;
    },
  });

  const linkedCampaignContent = useQuery({
    queryKey: ["campaign-linked-content", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await db
        .from("content_items")
        .select("id,title,status,scheduled_at,media_asset_ids,metadata,created_at,primary_caption")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as CampaignLinkedContentRow[];
    },
  });

  useEffect(() => {
    if (!selectedCampaignId && campaigns.data?.[0]?.id) {
      setSelectedCampaignId(campaigns.data[0].id);
    }
  }, [campaigns.data, selectedCampaignId]);

  const assetLookup = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    for (const asset of allMediaAssets.data ?? []) map.set(asset.id, asset);
    for (const asset of mediaAssets.data ?? []) map.set(asset.id, asset);
    return map;
  }, [allMediaAssets.data, mediaAssets.data]);

  const campaignContentByPlan = useMemo(() => {
    const grouped = new Map<string, CampaignLinkedContentRow[]>();
    for (const item of linkedCampaignContent.data ?? []) {
      const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
      const campaignPlanId =
        typeof metadata.campaignPlanId === "string" ? metadata.campaignPlanId : null;
      if (!campaignPlanId) continue;
      const current = grouped.get(campaignPlanId) ?? [];
      current.push(item);
      grouped.set(campaignPlanId, current);
    }
    return grouped;
  }, [linkedCampaignContent.data]);

  const selectedCampaign =
    (campaigns.data ?? []).find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignContent = selectedCampaignId
    ? campaignContentByPlan.get(selectedCampaignId) ?? []
    : [];
  useEffect(() => {
    setCampaignCaptionDrafts((current) => {
      const next = { ...current };
      for (const item of selectedCampaignContent) {
        if (!(item.id in next)) next[item.id] = item.primary_caption ?? "";
      }
      return next;
    });
  }, [selectedCampaignContent]);

  const selectedCampaignCounts = selectedCampaignContent.reduce(
    (counts, item) => {
      counts.total += 1;
      if (item.status === "draft" || item.status === "changes_requested") counts.drafts += 1;
      if (item.status === "in_review") counts.review += 1;
      if (item.status === "approved") counts.approved += 1;
      if (item.status === "scheduled") counts.scheduled += 1;
      if (item.status === "published") counts.published += 1;
      return counts;
    },
    { total: 0, drafts: 0, review: 0, approved: 0, scheduled: 0, published: 0 },
  );

  const errors = useMemo(() => validateCampaignPlanningInput(input), [input]);

  const sequenceMediaIds = useMemo(
    () =>
      orderCampaignMedia(
        selectedMediaIds,
        campaignDirection ? campaignDirection.mediaRecommendations.map((rec) => rec.mediaId) : null,
      ),
    [campaignDirection, selectedMediaIds],
  );

  const builderState: CampaignBuilderState = {
    name: input.name,
    platformCount: input.platforms.length,
    formatCount: input.contentFormats.length,
    selectedMediaCount: selectedMediaIds.length,
    recommendationCount: campaignDirection?.mediaRecommendations.length ?? 0,
    confirmedCount: campaignDirection
      ? campaignDirection.mediaRecommendations.filter((rec) => confirmedMediaIds.includes(rec.mediaId)).length
      : 0,
    planSlotCount: preview.length,
    saved: Boolean(savedNotice),
  };
  const stepCompletion = campaignStepCompletion(builderState);
  const launchBlocker = campaignLaunchBlocker(builderState);

  const savePlan = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Select a workspace first.");
      if (errors.length) throw new Error(errors[0]);
      if (!selectedMediaIds.length) throw new Error("Choose campaign content before saving.");
      if (launchBlocker) throw new Error(launchBlocker);
      const plannedItems = preview.length ? preview : buildCampaignPlan(input);
      if (!plannedItems.length) {
        throw new Error("No planning slots remain after excluded days and times are applied.");
      }
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Sign in to save a campaign.");
      const { data: plan, error: planError } = await db
        .from("campaign_plans")
        .insert({
          workspace_id: workspaceId,
          created_by: auth.user.id,
          name: input.name.trim(),
          goal: input.goal,
          start_date: input.startDate,
          end_date: input.endDate,
          platforms: input.platforms,
          max_posts: input.maxPosts,
          posting_hours: input.postingHours,
          excluded_days: input.excludedDays,
          approval_required: input.approvalRequired,
          optimization_mode: input.optimizationMode,
          status: "draft",
        })
        .select("id")
        .single();
      if (planError) throw planError;
      const { error: itemsError } = await db.from("campaign_plan_items").insert(
        plannedItems.map((item) => ({
          workspace_id: workspaceId,
          campaign_plan_id: plan.id,
          position: item.sequence,
          planned_date: item.plannedDate,
          planned_time: item.localTime,
          platform: item.platform,
          content_pillar: item.pillar,
          working_title: item.workingTitle,
          copy_brief: item.copyBrief,
          approval_required: item.approvalRequired,
          status: "draft",
        })),
      );
      if (itemsError) {
        await db.from("campaign_plans").delete().eq("id", plan.id).eq("workspace_id", workspaceId);
        throw itemsError;
      }

      // Posts follow the edited sequence from the Plan step.
      const selectedAssets = sequenceMediaIds
        .map((id) => assetLookup.get(id))
        .filter((asset): asset is MediaAsset => Boolean(asset))
        .slice(0, input.maxPosts);
      if (!selectedAssets.length) {
        await db.from("campaign_plans").delete().eq("id", plan.id).eq("workspace_id", workspaceId);
        throw new Error("Selected campaign media could not be loaded.");
      }

      const linkedRows = selectedAssets.map((asset, index) => {
        const plannedItem = plannedItems[index % plannedItems.length];
        // A caption the user reviewed in the Plan step; never the internal brief.
        const reviewed = campaignDirection?.mediaRecommendations.find((rec) => rec.mediaId === asset.id);
        const contentFormat =
          reviewed?.placement === "story" ? "story" : reviewed?.placement === "feed" ? "feed" : plannedItem?.contentFormat ?? null;
        return {
          workspace_id: workspaceId,
          created_by: auth.user.id,
          title: `${input.name} · ${asset.name}`.slice(0, 180),
          primary_caption: null,
          hashtags: [],
          ...(reviewed?.caption.trim()
            ? {
                primary_caption: reviewed.caption.trim(),
                hashtags: reviewed.hashtags.map((tag) => tag.replace(/^#/, "")),
              }
            : {}),
          media_asset_ids: [asset.id],
          status: "draft",
          metadata: {
            source: "campaign_manager",
            campaignPlanId: plan.id,
            campaignName: input.name,
            mediaFolderId: mediaFolder === "all" || mediaFolder === "root" ? null : mediaFolder,
            plannedDate: plannedItem?.plannedDate ?? null,
            plannedTime: plannedItem?.localTime ?? null,
            platform: plannedItem?.platform ?? null,
            contentFormat,
            contentPillar: plannedItem?.pillar ?? null,
            captionState: reviewed?.caption.trim() ? "generated_for_review" : "needs_generation",
            campaignBrief: plannedItem?.copyBrief ?? null,
            campaignSequence: index + 1,
          },
        };
      });
      const { data: createdContent, error: contentError } = await db
        .from("content_items")
        .insert(linkedRows)
        .select("id,metadata,primary_caption");
      if (contentError) {
        console.error("Campaign saved but linked content could not be created", {
          campaignPlanId: plan.id,
          message: contentError.message,
        });
        return { planId: plan.id as string, contentLinked: false };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variantRows = (createdContent ?? []).flatMap((content: any) => {
        const metadata =
          content.metadata && typeof content.metadata === "object" ? content.metadata : {};
        const platform = typeof metadata.platform === "string" ? metadata.platform : null;
        if (!platform || !PLATFORM_OPTIONS.includes(platform)) return [];
        return [{
          content_item_id: content.id,
          workspace_id: workspaceId,
          platform,
          enabled: true,
          caption: typeof content.primary_caption === "string" ? content.primary_caption : "",
          platform_options:
            metadata.contentFormat === "story" ? { contentType: "story" } : {},
        }];
      });
      if (variantRows.length) {
        const { error: variantError } = await db.from("post_variants").insert(variantRows);
        if (variantError) {
          console.error("Campaign content saved but platform variants could not be created", {
            campaignPlanId: plan.id,
            message: variantError.message,
          });
        }
      }

      // Confirmed understanding guides future analysis; a failure here never undoes the save.
      if (campaignDirection?.mediaRecommendations.length) {
        try {
          await saveCorrectionsFn({
            data: {
              workspaceId,
              corrections: campaignDirection.mediaRecommendations.map((rec) => ({
                mediaId: rec.mediaId,
                contentType: rec.contentType,
                visualSummary: rec.visualSummary,
                likelyPurpose: rec.likelyPurpose,
              })),
            },
          });
        } catch (error) {
          console.warn("Campaign saved but media corrections could not be stored", error);
        }
      }
      return { planId: plan.id as string, contentLinked: true };
    },
    onSuccess: async (result) => {
      await workflowDraft.discard.mutateAsync();
      setSavedNotice({ name: input.name.trim(), contentLinked: result.contentLinked });
      setDirty(false);
      setPreview([]);
      setInput(DEFAULT_INPUT);
      setSelectedMediaIds([]);
      setCampaignDirection(null);
      setConfirmedMediaIds([]);
      setContinuedFrom(null);
      setSelectedCampaignId(result.planId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign-plans", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-linked-content", workspaceId] }),
      ]);
      if (result.contentLinked) {
        toast.success("Campaign saved. Continue below in the campaign workspace.");
      } else {
        toast.warning("Campaign saved, but its content could not be linked yet. Reopen the campaign and reconnect the media.");
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Campaign plan could not be saved."),
  });

  function update<K extends keyof CampaignPlanningInput>(key: K, value: CampaignPlanningInput[K]) {
    editRevisionRef.current += 1;
    setInput((current) => ({ ...current, [key]: value }));
    setPreview([]);
    setDirty(true);
    setSavedNotice(null);
  }

  function toggleList(key: "platforms" | "excludedDays" | "contentFormats", value: string) {
    const values = input[key] as readonly string[];
    update(
      key,
      (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]) as CampaignPlanningInput[typeof key],
    );
  }

  function changeSelectedMedia(next: string[] | ((current: string[]) => string[])) {
    editRevisionRef.current += 1;
    setSelectedMediaIds(next);
    setDirty(true);
    setSavedNotice(null);
  }

  async function uploadCampaignFiles(event: ChangeEvent<HTMLInputElement>) {
    const inputElement = event.currentTarget;
    const files = Array.from(inputElement.files ?? []);
    const folderId = mediaFolder === "all" || mediaFolder === "root" ? null : mediaFolder;
    for (const file of files) {
      try {
        const asset = await uploadMedia.mutateAsync({ file, folderId, tags: ["campaign"] });
        changeSelectedMedia((ids) => Array.from(new Set([...ids, asset.id])));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed.");
      }
    }
    inputElement.value = "";
  }

  async function extractVideoFrames(asset: MediaAsset) {
    if (!asset.mime_type.startsWith("video/")) return [] as string[];
    let url: string;
    try {
      const previewUrl = await getMediaPreviewUrl(asset, 60 * 30, "content");
      if (!previewUrl) return [];
      url = previewUrl;
    } catch {
      return [];
    }
    return await new Promise<string[]>((resolve) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      const frames: string[] = [];
      let points: number[] = [];
      let index = 0;
      const finish = () => {
        video.removeAttribute("src");
        video.load();
        resolve(frames);
      };
      const timeout = window.setTimeout(finish, 12000);
      video.onerror = () => {
        window.clearTimeout(timeout);
        finish();
      };
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          window.clearTimeout(timeout);
          finish();
          return;
        }
        points = [0.15,0.5,0.85].map((ratio)=>Math.max(0.05,Math.min(video.duration-0.05,video.duration*ratio)));
        video.currentTime = points[index]!;
      };
      video.onseeked = () => {
        try {
          const maxEdge = 480;
          const scale = Math.min(1, maxEdge / Math.max(video.videoWidth || 1, video.videoHeight || 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round((video.videoWidth || 1) * scale));
          canvas.height = Math.max(1, Math.round((video.videoHeight || 1) * scale));
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video,0,0,canvas.width,canvas.height);
            const frame = canvas.toDataURL("image/jpeg",0.6);
            if (frame.length <= 350000) frames.push(frame);
          }
        } catch {
          // Cross-origin or decode failure: metadata-only fallback is intentional.
        }
        index += 1;
        if (index < points.length) video.currentTime = points[index]!;
        else {
          window.clearTimeout(timeout);
          finish();
        }
      };
      video.src = url;
    });
  }

  async function saveCampaignCaption(item: CampaignLinkedContentRow, caption: string) {
    if (!workspaceId || captionBusyId) return;
    const nextCaption = caption.trim();
    if (!nextCaption) {
      toast.error("Add or generate a caption first.");
      return;
    }
    const metadata =
      item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const plannedPlatform =
      typeof metadata.platform === "string" && PLATFORM_OPTIONS.includes(metadata.platform)
        ? metadata.platform
        : "instagram";
    setCaptionBusyId(item.id);
    try {
      const { error: contentError } = await db
        .from("content_items")
        .update({
          primary_caption: nextCaption,
          metadata: { ...metadata, captionState: "ready_for_review" },
        })
        .eq("id", item.id)
        .eq("workspace_id", workspaceId);
      if (contentError) throw contentError;

      const { data: variants, error: readError } = await db
        .from("post_variants")
        .select("id,platform")
        .eq("content_item_id", item.id)
        .eq("workspace_id", workspaceId);
      if (readError) throw readError;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variant = (variants ?? []).find((row: any) => row.platform === plannedPlatform);
      if (variant?.id) {
        const { error } = await db
          .from("post_variants")
          .update({ caption: nextCaption, enabled: true })
          .eq("id", variant.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("post_variants").insert({
          content_item_id: item.id,
          workspace_id: workspaceId,
          platform: plannedPlatform,
          enabled: true,
          caption: nextCaption,
          platform_options:
            metadata.contentFormat === "story" ? { contentType: "story" } : {},
        });
        if (error) throw error;
      }

      setCampaignCaptionDrafts((current) => ({ ...current, [item.id]: nextCaption }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign-linked-content", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["content-item", item.id] }),
      ]);
      toast.success("Campaign caption saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Caption could not be saved.");
    } finally {
      setCaptionBusyId(null);
    }
  }

  async function generateCampaignCaption(item: CampaignLinkedContentRow) {
    if (!workspaceId || captionBusyId) return;
    const metadata =
      item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const plannedPlatform =
      typeof metadata.platform === "string" && PLATFORM_OPTIONS.includes(metadata.platform)
        ? metadata.platform
        : "instagram";
    const brief =
      (typeof metadata.campaignBrief === "string" ? metadata.campaignBrief.trim() : "") ||
      (typeof metadata.contentPillar === "string" ? metadata.contentPillar : "") ||
      item.title ||
      "Create an organic social caption for this campaign post.";

    setCaptionBusyId(item.id);
    try {
      const generated = await captionAssistFn({
        data: {
          mode: "caption_suite",
          input: brief,
          workspaceId,
          platforms: [plannedPlatform],
          mediaAssetIds: item.media_asset_ids ?? [],
        },
      });
      const primaryCaption = generated.primaryCaption ?? generated.suggestion;
      setCampaignCaptionDrafts((current) => ({ ...current, [item.id]: primaryCaption }));

      const { error: contentError } = await db
        .from("content_items")
        .update({
          primary_caption: primaryCaption,
          metadata: { ...metadata, captionState: "generated_for_review" },
        })
        .eq("id", item.id)
        .eq("workspace_id", workspaceId);
      if (contentError) throw contentError;

      const platformCaption =
        generated.variants?.find((row) => row.platform === plannedPlatform)?.caption ??
        primaryCaption;
      const { data: variants, error: readError } = await db
        .from("post_variants")
        .select("id,platform")
        .eq("content_item_id", item.id)
        .eq("workspace_id", workspaceId);
      if (readError) throw readError;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variant = (variants ?? []).find((row: any) => row.platform === plannedPlatform);
      if (variant?.id) {
        const { error } = await db
          .from("post_variants")
          .update({ caption: platformCaption, enabled: true })
          .eq("id", variant.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("post_variants").insert({
          content_item_id: item.id,
          workspace_id: workspaceId,
          platform: plannedPlatform,
          enabled: true,
          caption: platformCaption,
          platform_options:
            metadata.contentFormat === "story" ? { contentType: "story" } : {},
        });
        if (error) throw error;
      }

      await queryClient.invalidateQueries({ queryKey: ["campaign-linked-content", workspaceId] });
      toast.success(item.primary_caption ? "Caption rewritten." : "Caption generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Caption could not be generated.");
    } finally {
      setCaptionBusyId(null);
    }
  }

  async function generateMissingCampaignCaptions() {
    if (!workspaceId || !selectedCampaignId || bulkCaptionBusy) return;
    const missing = selectedCampaignContent.filter((item) => !item.primary_caption?.trim());
    if (!missing.length) {
      toast.info("Every linked campaign post already has a caption.");
      return;
    }
    setBulkCaptionBusy(true);
    let completed = 0;
    try {
      for (const item of missing) {
        const metadata =
          item.metadata && typeof item.metadata === "object" ? item.metadata : {};
        const plannedPlatform =
          typeof metadata.platform === "string" && PLATFORM_OPTIONS.includes(metadata.platform)
            ? metadata.platform
            : "instagram";
        const brief =
          (typeof metadata.campaignBrief === "string" ? metadata.campaignBrief.trim() : "") ||
          (typeof metadata.contentPillar === "string" ? metadata.contentPillar : "") ||
          item.title ||
          "Create an organic social caption for this campaign post.";

        const generated = await captionAssistFn({
          data: {
            mode: "caption_suite",
            input: brief,
            workspaceId,
            platforms: [plannedPlatform],
          },
        });
        const primaryCaption = generated.primaryCaption ?? generated.suggestion;
        const { error: contentError } = await db
          .from("content_items")
          .update({
            primary_caption: primaryCaption,
            metadata: { ...metadata, captionState: "generated_for_review" },
          })
          .eq("id", item.id)
          .eq("workspace_id", workspaceId);
        if (contentError) throw contentError;

        const { data: existingVariants, error: variantReadError } = await db
          .from("post_variants")
          .select("id,platform")
          .eq("content_item_id", item.id)
          .eq("workspace_id", workspaceId);
        if (variantReadError) throw variantReadError;
        const variant = (existingVariants ?? []).find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (row: any) => row.platform === plannedPlatform,
        );
        const platformCaption =
          generated.variants?.find((row) => row.platform === plannedPlatform)?.caption ??
          primaryCaption;
        if (variant?.id) {
          const { error } = await db
            .from("post_variants")
            .update({ caption: platformCaption, enabled: true })
            .eq("id", variant.id);
          if (error) throw error;
        } else {
          const { error } = await db.from("post_variants").insert({
            content_item_id: item.id,
            workspace_id: workspaceId,
            platform: plannedPlatform,
            enabled: true,
            caption: platformCaption,
            platform_options:
              metadata.contentFormat === "story" ? { contentType: "story" } : {},
          });
          if (error) throw error;
        }
        completed += 1;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign-linked-content", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["content-items", workspaceId] }),
      ]);
      toast.success(
        `Generated ${completed} campaign caption${completed === 1 ? "" : "s"} for review.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Generated ${completed} captions before the campaign caption pass stopped.`,
      );
    } finally {
      setBulkCaptionBusy(false);
    }
  }

  function continueSavedCampaign(campaign: CampaignPlanRow) {
    const linked = campaignContentByPlan.get(campaign.id) ?? [];
    const mediaIds = Array.from(
      new Set(linked.flatMap((item) => item.media_asset_ids ?? [])),
    ).slice(0, campaign.max_posts);
    setInput({
      name: campaign.name,
      goal: campaign.goal,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      platforms: campaign.platforms,
      maxPosts: campaign.max_posts,
      postingHours: campaign.posting_hours?.length ? campaign.posting_hours : ["09:00", "15:00"],
      excludedDays: campaign.excluded_days ?? [],
      approvalRequired: campaign.approval_required,
      optimizationMode: campaign.optimization_mode ?? "approval_required",
      contentFormats: ["feed", "story"],
    });
    setSelectedMediaIds(mediaIds);
    setCampaignDirection(null);
    setConfirmedMediaIds([]);
    setPreview([]);
    setSavedNotice(null);
    setContinuedFrom(campaign.name);
    setMobileStep(3);
    window.requestAnimationFrame(() => {
      document.getElementById("campaign-builder-workflow")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function generateDirection() {
    if (!workspaceId || !input.platforms.length || directionBusy) return;
    setDirectionBusy(true);
    setDraftsCreated(false);
    setSavedNotice(null);
    try {
      const selectedAssets = selectedMediaIds
        .map((id) => assetLookup.get(id))
        .filter((asset): asset is MediaAsset => Boolean(asset));
      const videosToSample = selectedAssets
        .filter((asset) => asset.mime_type.startsWith("video/"))
        .slice(0, MAX_SAMPLED_VIDEOS);
      setAnalysisProgress({
        phase: videosToSample.length ? "frames" : "ai",
        framesDone: 0,
        framesTotal: videosToSample.length,
        assetCount: selectedMediaIds.length,
      });
      const videoFrames = (
        await Promise.all(
          videosToSample.map(async (asset) => {
            const frames = await extractVideoFrames(asset);
            setAnalysisProgress((current) =>
              current ? { ...current, framesDone: current.framesDone + 1 } : current,
            );
            return { mediaId: asset.id, frames };
          }),
        )
      ).filter((entry)=>entry.frames.length>0);
      setAnalysisProgress((current) => (current ? { ...current, phase: "ai" } : current));
      const direction = await campaignDirectionFn({
        data: {
          workspaceId,
          name: input.name,
          goal: input.goal,
          platforms: input.platforms,
          mediaIds: selectedMediaIds,
          videoFrames,
        },
      });
      setCampaignDirection(direction as CampaignDirection);
      editRevisionRef.current += 1;
      setDirty(true);
      setConfirmedMediaIds([]);
      toast.success("Organic campaign direction is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campaign direction could not be generated.");
    } finally {
      setDirectionBusy(false);
      setAnalysisProgress(null);
    }
  }

  function updateMediaRecommendation(index: number, patch: Partial<MediaRecommendation>) {
    editRevisionRef.current += 1;
    setDirty(true);
    setCampaignDirection((current) => current ? {
      ...current,
      mediaRecommendations: current.mediaRecommendations.map((recommendation, itemIndex) =>
        itemIndex === index ? { ...recommendation, ...patch } : recommendation,
      ),
    } : current);
    const mediaId = campaignDirection?.mediaRecommendations[index]?.mediaId;
    const understandingChanged = "contentType" in patch || "visualSummary" in patch || "likelyPurpose" in patch;
    if (mediaId && understandingChanged) setConfirmedMediaIds((current) => current.filter((id) => id !== mediaId));
    setDraftsCreated(false);
    setSavedNotice(null);
  }

  function moveSequenceItem(index: number, delta: -1 | 1) {
    if (campaignDirection) {
      setCampaignDirection({
        ...campaignDirection,
        mediaRecommendations: moveListItem(campaignDirection.mediaRecommendations, index, delta),
      });
    } else {
      changeSelectedMedia((current) => moveListItem(orderCampaignMedia(current, null), index, delta));
    }
    setSavedNotice(null);
  }

  async function saveServerDraft() {
    try {
      await workflowDraft.save.mutateAsync(draftPayload);
      setDirty(false);
      toast.success("Private server draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Draft could not be saved.");
    }
  }

  function restoreServerDraft() {
    const restored = workflowDraft.data?.payload;
    if (!restored) return;
    const { builder, ...planning } = restored;
    setInput(planning);
    setSelectedMediaIds(builder?.selectedMediaIds ?? []);
    setConfirmedMediaIds(builder?.confirmedMediaIds ?? []);
    setCampaignDirection(builder?.campaignDirection ?? null);
    setPreview(builder?.preview ?? []);
    setCampaignCaptionDrafts(builder?.campaignCaptionDrafts ?? {});
    setContinuedFrom(builder?.continuedFrom ?? null);
    setDirty(false);
  }

  function generatePlan() {
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    const next = buildCampaignPlan(input);
    if (!next.length) {
      toast.error("No planning slots remain. Change the dates, excluded days, or times.");
      return;
    }
    setPreview(next);
    setDirty(true);
  }

  function goToStep(index: number) {
    setMobileStep(index);
    if (window.matchMedia("(min-width: 640px)").matches) {
      document.getElementById(`campaign-step-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function startNewCampaign() {
    setSelectedCampaignId(null);
    setInput(DEFAULT_INPUT);
    setSelectedMediaIds([]);
    setCampaignDirection(null);
    setConfirmedMediaIds([]);
    setPreview([]);
    setContinuedFrom(null);
    setSavedNotice(null);
    setMobileStep(0);
    window.requestAnimationFrame(() =>
      document.getElementById("campaign-builder-workflow")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }


  /** Unlinked AI drafts kept for the desktop layout's existing "Create feed & story drafts" action. */
  async function createPostDrafts() {
    if (!workspaceId || !campaignDirection?.mediaRecommendations.length || draftsBusy || draftsCreated) return;
    if (confirmedMediaIds.length !== campaignDirection.mediaRecommendations.length) {
      toast.error("Confirm or correct what WaveOS understood about every asset first.");
      return;
    }
    setDraftsBusy(true);
    try {
      const result = await createDraftsFn({
        data: {
          workspaceId,
          campaignName: input.name,
          recommendations: campaignDirection.mediaRecommendations.map((rec) => ({
            mediaId: rec.mediaId,
            caption: rec.caption,
            hashtags: rec.hashtags,
            platforms: rec.platforms,
            suggestedDay: rec.suggestedDay,
            contentType: rec.contentType,
            visualSummary: rec.visualSummary,
            likelyPurpose: rec.likelyPurpose,
            placement: rec.placement,
          })),
        },
      });
      setDraftsCreated(true);
      toast.success(`Created ${result.count} post draft${result.count === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Post drafts could not be created.");
    } finally {
      setDraftsBusy(false);
    }
  }

  return {
    input,
    setInput,
    preview,
    setPreview,
    dirty,
    setDirty,
    autoSaveState,
    setAutoSaveState,
    mobileStep,
    setMobileStep,
    campaignDirection,
    setCampaignDirection,
    analysisProgress,
    setAnalysisProgress,
    selectedMediaIds,
    setSelectedMediaIds,
    confirmedMediaIds,
    setConfirmedMediaIds,
    showSharedMediaPicker,
    setShowSharedMediaPicker,
    mediaFolder,
    setMediaFolder,
    directionBusy,
    setDirectionBusy,
    selectedCampaignId,
    setSelectedCampaignId,
    mediaSectionOpen,
    setMediaSectionOpen,
    bulkCaptionBusy,
    setBulkCaptionBusy,
    captionBusyId,
    setCaptionBusyId,
    campaignCaptionDrafts,
    setCampaignCaptionDrafts,
    continuedFrom,
    setContinuedFrom,
    savedNotice,
    setSavedNotice,
    workspaceId,
    queryClient,
    editRevisionRef,
    campaignDirectionFn,
    saveCorrectionsFn,
    captionAssistFn,
    mediaInputRef,
    mediaFolders,
    mediaAssets,
    allMediaAssets,
    uploadMedia,
    workflowDraft,
    autoSaveDraft,
    campaigns,
    linkedCampaignContent,
    assetLookup,
    campaignContentByPlan,
    selectedCampaign,
    selectedCampaignContent,
    selectedCampaignCounts,
    errors,
    sequenceMediaIds,
    builderState,
    stepCompletion,
    launchBlocker,
    savePlan,
    toggleList,
    changeSelectedMedia,
    uploadCampaignFiles,
    extractVideoFrames,
    saveCampaignCaption,
    generateCampaignCaption,
    generateMissingCampaignCaptions,
    continueSavedCampaign,
    generateDirection,
    updateMediaRecommendation,
    moveSequenceItem,
    saveServerDraft,
    restoreServerDraft,
    generatePlan,
    goToStep,
    startNewCampaign,
    activeWorkspace,
    update,
    draftsBusy,
    setDraftsBusy,
    draftsCreated,
    setDraftsCreated,
    createPostDrafts,
  };
}

export type CampaignManagerController = ReturnType<typeof useCampaignManager>;
