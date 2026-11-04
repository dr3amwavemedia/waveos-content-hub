import { createFileRoute, Link } from "@tanstack/react-router";
import { MediaPicker } from "@/routes/_authenticated/create";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Check,
  Clock3,
  Loader2,
  Megaphone,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,
  Images,
  FolderOpen,
  Video,
  CheckCircle2,
  FileText,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { RequireFeature } from "@/components/app/require-feature";
import { UnsavedChangesGuard } from "@/components/app/unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/app/workspace-context";
import { useWorkflowDraft } from "@/hooks/use-workflow-draft";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCampaignPlan,
  CAMPAIGN_GOALS,
  validateCampaignPlanningInput,
  type CampaignGoal,
  type CampaignPlanningInput,
  type CampaignPlanningItem,
} from "@/lib/phase-one-planning";
import { waveAssist } from "@/lib/wave-assist.functions";
import { cn } from "@/lib/utils";
import { createCampaignPostDrafts, generateCampaignDirection } from "@/lib/campaign-ideas.functions";
import { MobileWorkflowSteps, MobileWorkflowSection, MobileWorkflowFooter } from "@/components/app/mobile-workflow";
import {
  getMediaPreviewUrl,
  useMediaAssets,
  useMediaFolders,
  useUploadAsset,
  type MediaAsset,
} from "@/hooks/use-media";

export const Route = createFileRoute("/_authenticated/campaigns")({
  component: () => (
    <RequireFeature
      feature="can_use_campaign_manager"
      title="Campaign Manager is available with Current or Tidal"
      description="Upgrade your WaveOS plan to build and organize multi-post campaigns."
    >
      <CampaignManagerPage />
    </RequireFeature>
  ),
  head: () => ({
    meta: [
      { title: "Campaign Manager — WaveOS" },
      {
        name: "description",
        content: "Build reviewable internal social campaign plans without auto-publishing.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Campaign Manager — WaveOS" },
      { property: "og:description", content: "Build and review your next social campaign plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const db = supabase as unknown as {
  // Phase 1 additive tables can land before regenerated client definitions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

const PLATFORM_OPTIONS = ["instagram", "facebook", "linkedin", "tiktok", "youtube", "x"];
const DAY_OPTIONS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_INPUT: CampaignPlanningInput = {
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

interface CampaignPlanRow {
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
  internal_notes?: string | null;
}

interface CampaignLinkedContentRow {
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

function CampaignManagerPage() {
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
  const createDraftsFn = useServerFn(createCampaignPostDrafts);
  const captionAssistFn = useServerFn(waveAssist);
  const [campaignDirection, setCampaignDirection] = useState<{
    angle:string;
    audienceInsight:string;
    pillars:Array<{name:string;purpose:string;examples:string[]}>;
    hooks:string[];
    notes:string[];
    mediaRecommendations:Array<{
      mediaId:string;
      reason:string;
      platforms:string[];
      suggestedDay:string;
      caption:string;
      hashtags:string[];
      contentType:string;
      visualSummary:string;
      likelyPurpose:string;
      hookPotential:"low"|"medium"|"high";
      suggestedPlatforms:string[];
      placement:"feed"|"story"|"both";
      confidence:"low"|"medium"|"high";
      inspectionMode:"photo"|"video_frames"|"metadata_only";
    }>;
  } | null>(null);
  const [selectedMediaIds,setSelectedMediaIds]=useState<string[]>([]);
  const [confirmedMediaIds,setConfirmedMediaIds]=useState<string[]>([]);
  const [showSharedMediaPicker,setShowSharedMediaPicker]=useState(false);
  const [mediaFolder,setMediaFolder]=useState<string>("all");
  const mediaInputRef=useRef<HTMLInputElement|null>(null);
  const mediaFolders=useMediaFolders(workspaceId);
  const mediaAssets=useMediaAssets(workspaceId,{folderId:mediaFolder==="all"?undefined:mediaFolder==="root"?null:mediaFolder});
  const uploadMedia=useUploadAsset(workspaceId);
  const [directionBusy, setDirectionBusy] = useState(false);
  const [draftsBusy,setDraftsBusy]=useState(false);
  const [draftsCreated,setDraftsCreated]=useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [mediaSectionOpen, setMediaSectionOpen] = useState(false);
  const [bulkCaptionBusy, setBulkCaptionBusy] = useState(false);
  const mobileSteps = ["Campaign name", "Your goal", "Platforms & formats", "Posting frequency", "Planning schedule", "Review campaign"];
  const workflowDraft = useWorkflowDraft<CampaignPlanningInput>({
    workspaceId,
    workflowKey: "campaign-manager",
  });
  const autoSaveDraft = workflowDraft.save.mutateAsync;

  useEffect(() => {
    if (!dirty || !workspaceId) return;
    const revision = editRevisionRef.current;
    setAutoSaveState("saving");
    const timer = window.setTimeout(() => {
      void autoSaveDraft(input).then(() => {
        if (editRevisionRef.current === revision) setDirty(false);
        setAutoSaveState("saved");
      }).catch(() => setAutoSaveState("error"));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [autoSaveDraft, dirty, input, workspaceId]);

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
        .select("id,title,status,scheduled_at,media_asset_ids,metadata,created_at,primary_caption,internal_notes")
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

  const savePlan = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Select a workspace first.");
      if (errors.length) throw new Error(errors[0]);
      if (!selectedMediaIds.length) throw new Error("Choose campaign content before saving.");
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

      const selectedAssets = (mediaAssets.data ?? [])
        .filter((asset) => selectedMediaIds.includes(asset.id))
        .slice(0, input.maxPosts);
      if (!selectedAssets.length) {
        await db.from("campaign_plans").delete().eq("id", plan.id).eq("workspace_id", workspaceId);
        throw new Error("Selected campaign media could not be loaded.");
      }

      const linkedRows = selectedAssets.map((asset, index) => {
        const plannedItem = plannedItems[index % plannedItems.length];
        return {
          workspace_id: workspaceId,
          created_by: auth.user.id,
          title: `${input.name} · ${asset.name}`.slice(0, 180),
          internal_notes: plannedItem?.copyBrief ?? null,
          primary_caption: null,
          hashtags: [],
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
            contentFormat: plannedItem?.contentFormat ?? null,
            contentPillar: plannedItem?.pillar ?? null,
            captionState: "needs_generation",
          },
        };
      });
      const { data: createdContent, error: contentError } = await db
        .from("content_items")
        .insert(linkedRows)
        .select("id,metadata");
      if (contentError) {
        console.error("Campaign saved but linked content could not be created", {
          campaignPlanId: plan.id,
          message: contentError.message,
        });
        return { planId: plan.id as string, contentLinked: false };
      }

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
          caption: "",
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
      return { planId: plan.id as string, contentLinked: true };
    },
    onSuccess: async (result) => {
      await workflowDraft.discard.mutateAsync();
      setDirty(false);
      setPreview([]);
      setInput(DEFAULT_INPUT);
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
  }

  function toggleList(key: "platforms" | "excludedDays" | "contentFormats", value: string) {
    const values = input[key] as readonly string[];
    update(
      key,
      (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]) as CampaignPlanningInput[typeof key],
    );
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
          item.internal_notes?.trim() ||
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
    setDraftsCreated(false);
    setPreview([]);
    setMobileStep(5);
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
    try {
      const selectedAssets=(mediaAssets.data??[]).filter((asset)=>selectedMediaIds.includes(asset.id));
      const videoFrames = (
        await Promise.all(
          selectedAssets
            .filter((asset)=>asset.mime_type.startsWith("video/"))
            .slice(0,6)
            .map(async(asset)=>({mediaId:asset.id,frames:await extractVideoFrames(asset)})),
        )
      ).filter((entry)=>entry.frames.length>0);
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
      setCampaignDirection(direction);
      setConfirmedMediaIds([]);
      toast.success("Organic campaign direction is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campaign direction could not be generated.");
    } finally {
      setDirectionBusy(false);
    }
  }

  async function createPostDrafts() {
    if (!workspaceId || !campaignDirection?.mediaRecommendations.length || draftsBusy || draftsCreated) return;
    if (confirmedMediaIds.length !== campaignDirection.mediaRecommendations.length) {
      toast.error("Confirm or correct what WaveOS understood about every asset first.");
      return;
    }
    setDraftsBusy(true);
    try {
      const result=await createDraftsFn({
        data:{
          workspaceId,
          campaignName:input.name,
          recommendations:campaignDirection.mediaRecommendations.map((rec)=>({
            mediaId:rec.mediaId,
            caption:rec.caption,
            hashtags:rec.hashtags,
            platforms:rec.platforms,
            suggestedDay:rec.suggestedDay,
            contentType:rec.contentType,
            visualSummary:rec.visualSummary,
            likelyPurpose:rec.likelyPurpose,
            placement:rec.placement,
          })),
        },
      });
      setDraftsCreated(true);
      toast.success(`Created ${result.count} post draft${result.count===1?"":"s"}.`);
    } catch(error) {
      toast.error(error instanceof Error?error.message:"Post drafts could not be created.");
    } finally {
      setDraftsBusy(false);
    }
  }

  function updateMediaRecommendation(
    index: number,
    patch: Partial<NonNullable<typeof campaignDirection>["mediaRecommendations"][number]>,
  ) {
    setCampaignDirection((current) => current ? {
      ...current,
      mediaRecommendations: current.mediaRecommendations.map((recommendation, itemIndex) =>
        itemIndex === index ? { ...recommendation, ...patch } : recommendation,
      ),
    } : current);
    const mediaId = campaignDirection?.mediaRecommendations[index]?.mediaId;
    if (mediaId) setConfirmedMediaIds((current) => current.filter((id) => id !== mediaId));
    setDraftsCreated(false);
  }

  async function saveServerDraft() {
    try {
      await workflowDraft.save.mutateAsync(input);
      setDirty(false);
      toast.success("Private server draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Draft could not be saved.");
    }
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

  if (!activeWorkspace) return null;

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard dirty={dirty} subject="this campaign plan" />
      <header className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-purple-500/5 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Megaphone className="h-4 w-4" /> Campaign intelligence
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Build a campaign from your content</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Choose the content you already have, then let WaveOS use your brand and performance history to recommend what to post, where, when, and how to caption it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-muted-foreground" role="status">{autoSaveState==="saving"?"Saving draft…":autoSaveState==="saved"?"Draft saved":autoSaveState==="error"?"Auto-save paused":""}</span>
          <Button
            variant="outline"
            onClick={() => void saveServerDraft()}
            disabled={workflowDraft.save.isPending}
          >
            {workflowDraft.save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save draft
          </Button>
          <Button onClick={() => void generateDirection()} disabled={!input.platforms.length || directionBusy || selectedMediaIds.length===0}>
            {directionBusy ? <Loader2 className="animate-spin" /> : <Sparkles />} Analyze & Build Campaign
          </Button>
          <Button className="hidden sm:inline-flex" onClick={generatePlan} disabled={errors.length > 0}>
            <Sparkles /> Build plan
          </Button>
        </div>
        </div>
      </header>

      <section className="rounded-2xl border border-primary/20 bg-[linear-gradient(145deg,rgba(8,35,60,.92),rgba(28,20,59,.9))] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <ListChecks className="h-4 w-4" /> Campaign command center
            </div>
            <h2 className="mt-1 text-xl font-semibold">Keep building after the plan is saved</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Reopen a campaign, see its linked posts, and move each piece from draft to review,
              approval, scheduling, and published content.
            </p>
          </div>
          <Button variant="outline" onClick={() => {
            setSelectedCampaignId(null);
            setInput(DEFAULT_INPUT);
            setSelectedMediaIds([]);
            setCampaignDirection(null);
            setPreview([]);
            setMobileStep(0);
          }}>
            <Megaphone /> New campaign
          </Button>
        </div>

        {(campaigns.data ?? []).length > 0 ? (
          <>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {(campaigns.data ?? []).map((campaign) => {
                const contentCount = campaignContentByPlan.get(campaign.id)?.length ?? 0;
                const active = selectedCampaignId === campaign.id;
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => {
                      setSelectedCampaignId(campaign.id);
                      window.requestAnimationFrame(() => {
                        document.getElementById("campaign-command-detail")?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      });
                    }}
                    className={cn(
                      "min-w-[15rem] rounded-xl border p-3 text-left transition-colors",
                      active
                        ? "border-primary/50 bg-primary/15"
                        : "border-border bg-background/35 hover:border-primary/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{campaign.name}</span>
                      <span className="rounded-full bg-black/20 px-2 py-1 text-[9px] uppercase text-muted-foreground">
                        {campaign.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {contentCount} linked post{contentCount === 1 ? "" : "s"} · {campaign.max_posts} max
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {campaign.start_date} → {campaign.end_date}
                    </p>
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary">
                      Tap to open <ArrowRight className="h-3 w-3" />
                    </p>
                  </button>
                );
              })}
            </div>

            {selectedCampaign && (
              <div id="campaign-command-detail" className="scroll-mt-24 mt-3 rounded-2xl border border-primary/15 bg-background/35 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold">{selectedCampaign.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground capitalize">
                      {selectedCampaign.goal} · {selectedCampaign.platforms.join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => continueSavedCampaign(selectedCampaign)}>
                      <ArrowRight /> Continue building
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={bulkCaptionBusy || !selectedCampaignContent.some((item) => !item.primary_caption?.trim())}
                      onClick={() => void generateMissingCampaignCaptions()}
                    >
                      {bulkCaptionBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                      Generate missing captions
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/content"><Images /> Content library</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/calendar"><CalendarDays /> Calendar</Link>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {[
                    ["Linked", selectedCampaignCounts.total],
                    ["Draft", selectedCampaignCounts.drafts],
                    ["Review", selectedCampaignCounts.review],
                    ["Approved", selectedCampaignCounts.approved],
                    ["Scheduled", selectedCampaignCounts.scheduled],
                    ["Published", selectedCampaignCounts.published],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-border bg-black/10 p-2 text-center">
                      <p className="text-lg font-semibold">{value}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                {selectedCampaignContent.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {selectedCampaignContent.slice(0, 8).map((item, index) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface/50 p-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{item.title || `Campaign post ${index + 1}`}</p>
                          <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                            {item.status.replaceAll("_", " ")}
                            {typeof item.metadata?.platform === "string" ? ` · ${item.metadata.platform}` : ""}
                            {typeof item.metadata?.plannedDate === "string" ? ` · ${item.metadata.plannedDate}` : ""}
                            {typeof item.metadata?.plannedTime === "string" ? ` ${item.metadata.plannedTime}` : ""}
                          </p>
                          {!item.primary_caption && (
                            <p className="mt-1 text-[10px] font-medium text-amber-300">Caption still needs Brand Voice generation</p>
                          )}
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            to="/create"
                            search={{
                              id: item.id,
                              media: undefined,
                              studio: undefined,
                              destination: undefined,
                              brief: undefined,
                              briefWorkspace: undefined,
                            }}
                          >
                            Open <ArrowRight />
                          </Link>
                        </Button>
                      </div>
                    ))}
                    {selectedCampaignContent.length > 8 && (
                      <p className="px-1 text-xs text-muted-foreground">
                        +{selectedCampaignContent.length - 8} more linked posts in the Content Library.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    This campaign does not have linked content yet. Choose media below, then analyze
                    the campaign or create linked drafts so the workflow can continue.
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Next step</p>
                  <p className="mt-1 text-sm">
                    {selectedCampaignCounts.total === 0
                      ? "Attach content and build the campaign direction."
                      : selectedCampaignCounts.drafts > 0
                        ? "Open the drafts, finish captions and media, then submit them for review."
                        : selectedCampaignCounts.review > 0
                          ? "Review the submitted posts and approve or request changes."
                          : selectedCampaignCounts.approved > 0
                            ? "Schedule the approved posts on the campaign calendar."
                            : selectedCampaignCounts.scheduled > 0
                              ? "The campaign is scheduled. Monitor publishing and performance."
                              : "Review the published campaign and use the results for the next one."}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : campaigns.isError ? (
          <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/5 p-5 text-sm text-amber-100">
            WaveOS could not load your saved campaigns. Your campaigns were not deleted. Refresh this
            page or try again in a moment.
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            No saved campaigns were returned for this workspace. Build a campaign below, or refresh if
            you expected an existing campaign to appear.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface/70 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setMediaSectionOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={mediaSectionOpen}
        >
          <div>
            <div className="flex items-center gap-2 font-semibold"><Images className="h-4 w-4 text-primary" /> Campaign content</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedMediaIds.length
                ? `${selectedMediaIds.length} piece${selectedMediaIds.length === 1 ? "" : "s"} selected · tap to change`
                : "Choose a folder or select individual photos/videos when you're ready."}
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background/50">
            {mediaSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {mediaSectionOpen && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Choose campaign media</p>
                <p className="mt-1 text-xs text-muted-foreground">Select multiple photos/videos from a folder or upload new pieces.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={()=>setShowSharedMediaPicker(true)}>
                  <Images className="h-4 w-4" /> Drive / Dropbox / Frame.io
                </Button>
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  {uploadMedia.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload media
                  <input ref={mediaInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.mp4,.mov,image/jpeg,image/png,video/mp4,video/quicktime" className="hidden" onChange={async(e)=>{const files=Array.from(e.target.files??[]); const folderId=mediaFolder==="all"||mediaFolder==="root"?null:mediaFolder; for(const file of files){try{const asset=await uploadMedia.mutateAsync({file,folderId,tags:["campaign"]}); setSelectedMediaIds(ids=>Array.from(new Set([...ids,asset.id])));}catch(error){toast.error(error instanceof Error?error.message:"Upload failed.");}} e.currentTarget.value="";}} />
                </label>
              </div>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <Button type="button" variant={mediaFolder==="all"?"default":"outline"} size="sm" onClick={()=>setMediaFolder("all")}>All media</Button>
          <Button type="button" variant={mediaFolder==="root"?"default":"outline"} size="sm" onClick={()=>setMediaFolder("root")}>Uncategorized</Button>
          {(mediaFolders.data??[]).map(folder=><Button key={folder.id} type="button" variant={mediaFolder===folder.id?"default":"outline"} size="sm" onClick={()=>setMediaFolder(folder.id)}>{folder.name}</Button>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={mediaAssets.isLoading || !(mediaAssets.data ?? []).length}
            onClick={() => {
              setSelectedMediaIds(
                (mediaAssets.data ?? []).map((asset) => asset.id).slice(0, input.maxPosts),
              );
              setMediaSectionOpen(false);
            }}
          >
            <FolderOpen className="h-4 w-4" /> Use this entire folder
          </Button>
          <span className="text-xs text-muted-foreground">
            Up to {input.maxPosts} pieces will be connected to this campaign.
          </span>
        </div>
        <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-xl pr-1">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {(mediaAssets.data??[]).slice(0,36).map(asset=><CampaignMediaTile key={asset.id} asset={asset} selected={selectedMediaIds.includes(asset.id)} onToggle={()=>setSelectedMediaIds(ids=>ids.includes(asset.id)?ids.filter(id=>id!==asset.id):[...ids,asset.id])} />)}
          </div>
        </div>
        {!mediaAssets.isLoading && !(mediaAssets.data??[]).length && <p className="mt-4 text-sm text-muted-foreground">No media in this folder yet. Upload files or choose another folder.</p>}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{selectedMediaIds.length} selected{selectedMediaIds.length===0 ? " · choose at least one piece of content" : ""}</span>{selectedMediaIds.length>0&&<button type="button" className="text-primary" onClick={()=>setSelectedMediaIds([])}>Clear selection</button>}</div>
          </div>
        )}
      </section>

      {showSharedMediaPicker && workspaceId && (
        <MediaPicker
          workspaceId={workspaceId}
          picked={selectedMediaIds}
          onClose={()=>setShowSharedMediaPicker(false)}
          onConfirm={(ids)=>{
            setSelectedMediaIds(ids.slice(0,24));
            setShowSharedMediaPicker(false);
            setMediaSectionOpen(false);
            void mediaAssets.refetch();
          }}
        />
      )}

      {campaignDirection && (
        <details className="rounded-xl border border-primary/25 bg-primary/5 p-4" open>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold">Wave Assist · Campaign Direction</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{campaignDirection.angle}</p>
          </summary>
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audience insight</p><p className="mt-1 text-sm">{campaignDirection.audienceInsight}</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {campaignDirection.pillars.map((pillar) => (
                <div key={pillar.name} className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="font-semibold">{pillar.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pillar.purpose}</p>
                  <ul className="mt-2 space-y-1 text-sm">{pillar.examples.map((example,index)=><li key={index}>• {example}</li>)}</ul>
                </div>
              ))}
            </div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hooks to explore</p><div className="mt-2 flex flex-wrap gap-2">{campaignDirection.hooks.map((hook,index)=><span key={index} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs">{hook}</span>)}</div></div>
            {campaignDirection.mediaRecommendations.length > 0 && <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommended content plan</p>
              <div className="mt-2 space-y-3">
                {campaignDirection.mediaRecommendations.map((rec,index)=><div key={rec.mediaId+index} className="rounded-xl border border-border bg-background/60 p-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{(mediaAssets.data??[]).find(a=>a.id===rec.mediaId)?.name ?? `Selected media ${index+1}`}</p><p className="mt-1 text-xs text-muted-foreground">{rec.reason}</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{rec.suggestedDay}</span></div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                    <label className="rounded-lg bg-surface/70 p-2"><span className="text-muted-foreground">What WaveOS thinks this is</span><input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 font-medium" value={rec.contentType} onChange={(event)=>updateMediaRecommendation(index,{contentType:event.target.value})}/></label>
                    <label className="rounded-lg bg-surface/70 p-2"><span className="text-muted-foreground">Placement</span><select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 font-medium capitalize" value={rec.placement} onChange={(event)=>updateMediaRecommendation(index,{placement:event.target.value as "feed"|"story"|"both"})}><option value="feed">Feed post</option><option value="story">Story</option><option value="both">Feed + Story</option></select></label>
                    <div className="rounded-lg bg-surface/70 p-2"><span className="text-muted-foreground">Hook potential</span><div className="mt-1 font-medium capitalize">{rec.hookPotential}</div></div>
                  </div>
                  <label className="mt-3 block text-xs"><span className="font-medium">What it shows</span><textarea className="mt-1 min-h-16 w-full rounded-md border border-border bg-background px-2 py-1.5 text-muted-foreground" value={rec.visualSummary} onChange={(event)=>updateMediaRecommendation(index,{visualSummary:event.target.value})}/></label>
                  <label className="mt-2 block text-xs"><span className="font-medium">Main message or purpose</span><input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5" value={rec.likelyPurpose} onChange={(event)=>updateMediaRecommendation(index,{likelyPurpose:event.target.value})}/></label>
                  <label className="mt-3 block text-xs"><span className="font-medium">Proposed caption / angle</span><textarea className="mt-1 min-h-24 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={rec.caption} onChange={(event)=>updateMediaRecommendation(index,{caption:event.target.value})}/></label>
                  <div className="mt-2 flex flex-wrap gap-1">{rec.hashtags.map(tag=><span key={tag} className="text-xs text-primary">{tag.startsWith("#")?tag:`#${tag}`}</span>)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground"><span>{rec.platforms.join(" · ")}</span><span>•</span><span className="capitalize">{rec.confidence} confidence</span><span>•</span><span>{rec.inspectionMode==="video_frames"?"Video visually inspected":rec.inspectionMode==="photo"?"Photo visually inspected":"Metadata only"}</span></div>
                  <Button type="button" size="sm" className="mt-3" variant={confirmedMediaIds.includes(rec.mediaId)?"secondary":"outline"} onClick={()=>setConfirmedMediaIds((current)=>current.includes(rec.mediaId)?current.filter((id)=>id!==rec.mediaId):[...current,rec.mediaId])}>
                    <Check className="h-4 w-4" /> {confirmedMediaIds.includes(rec.mediaId)?"Confirmed · edit again":"Confirm understanding"}
                  </Button>
                </div>)}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{confirmedMediaIds.length} of {campaignDirection.mediaRecommendations.length} assets confirmed. Corrections stay private to this workspace and guide future campaign analysis.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={()=>void createPostDrafts()} disabled={draftsBusy||draftsCreated||confirmedMediaIds.length!==campaignDirection.mediaRecommendations.length}>
                  {draftsBusy?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}
                  {draftsCreated?"Campaign drafts created":"Create feed & story drafts"}
                </Button>
                <Button asChild variant="outline">
                  <a href="/create">Open Create Post</a>
                </Button>
              </div>
            </div>}
          </div>
        </details>
      )}

      {workflowDraft.data?.payload && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">A private server draft is available</div>
            <div className="text-xs text-muted-foreground">
              Last saved {new Date(workflowDraft.data.updated_at).toLocaleString()}.
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const restored = workflowDraft.data?.payload;
                if (!restored) return;
                setInput(restored);
                setPreview([]);
                setDirty(false);
              }}
            >
              Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={() => workflowDraft.discard.mutate()}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,.72fr)]">
        <section id="campaign-builder-workflow" className="scroll-mt-24 space-y-5 sm:surface-card sm:p-6">
          <MobileWorkflowSteps steps={mobileSteps} step={mobileStep} onChange={setMobileStep} />
          <div className="grid gap-4 sm:grid-cols-2">
            <MobileWorkflowSection active={mobileStep === 0}>
            <Field label="Campaign name">
              <input
                className={inputClass}
                value={input.name}
                maxLength={120}
                placeholder="Spring service launch"
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 1}>
            <div className="grid grid-cols-2 gap-3 sm:hidden" aria-label="Campaign goal">
              {CAMPAIGN_GOALS.map((goal) => <Button key={goal} variant="outline" aria-pressed={input.goal === goal} className={cn("min-h-24 whitespace-normal rounded-xl", input.goal === goal && "border-primary bg-primary/10 text-primary")} onClick={() => update("goal", goal)}>{({ awareness: "Brand Awareness", engagement: "Increase Engagement", leads: "Generate Leads", launch: "Promote a Service", retention: "Keep Customers" })[goal]}</Button>)}
            </div>
            <div className="hidden sm:block">
            <Field label="Primary goal">
              <select
                className={inputClass}
                value={input.goal}
                onChange={(event) => update("goal", event.target.value as CampaignGoal)}
              >
                {CAMPAIGN_GOALS.map((goal) => (
                  <option key={goal} value={goal}>
                    {goal[0].toUpperCase() + goal.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            </div>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 4}>
            <Field label="Start date">
              <input
                className={inputClass}
                type="date"
                value={input.startDate}
                onChange={(event) => update("startDate", event.target.value)}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 4}>
            <Field label="End date">
              <input
                className={inputClass}
                type="date"
                value={input.endDate}
                onChange={(event) => update("endDate", event.target.value)}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 3}>
            <Field label="Maximum posts">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={60}
                value={input.maxPosts}
                onChange={(event) => update("maxPosts", Number(event.target.value))}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 4}>
            <Field label="Planning times" hint="Local workspace times, comma separated">
              <input
                className={inputClass}
                value={input.postingHours.join(", ")}
                placeholder="09:00, 15:00"
                onChange={(event) =>
                  update(
                    "postingHours",
                    event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  )
                }
              />
            </Field>
            </MobileWorkflowSection>
          </div>

          <MobileWorkflowSection active={mobileStep === 2}>
          <ChoiceGroup
            label="Platforms"
            values={PLATFORM_OPTIONS}
            selected={input.platforms}
            onToggle={(value) => toggleList("platforms", value)}
          />
          <div className="mt-4">
            <ChoiceGroup
              label="Campaign content"
              values={["feed", "story"]}
              selected={input.contentFormats}
              onToggle={(value) => toggleList("contentFormats", value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Use both to balance lasting feed content with timely, conversational Stories.
            </p>
          </div>
          </MobileWorkflowSection>
          <MobileWorkflowSection active={mobileStep === 4}>
          <ChoiceGroup
            label="Days to exclude"
            values={DAY_OPTIONS}
            selected={input.excludedDays}
            onToggle={(value) => toggleList("excludedDays", value)}
          />
          </MobileWorkflowSection>

          <MobileWorkflowSection active={mobileStep === 5}>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4 text-sm sm:hidden">
            <dt className="text-muted-foreground">Campaign</dt><dd className="break-words">{input.name || "Not named"}</dd>
            <dt className="text-muted-foreground">Goal</dt><dd className="capitalize">{input.goal}</dd>
            <dt className="text-muted-foreground">Platforms</dt><dd className="break-words capitalize">{input.platforms.join(", ") || "None"}</dd>
            <dt className="text-muted-foreground">Formats</dt><dd className="break-words capitalize">{input.contentFormats.join(", ") || "None"}</dd>
            <dt className="text-muted-foreground">Maximum posts</dt><dd>{input.maxPosts}</dd>
            <dt className="text-muted-foreground">Dates</dt><dd>{input.startDate} – {input.endDate}</dd>
          </dl>
          <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border bg-background/40 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Approval required</span>
              <span className="block text-xs text-muted-foreground">
                Mark every draft item as requiring review before any future scheduling step.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={input.approvalRequired}
              onChange={(event) => update("approvalRequired", event.target.checked)}
            />
          </label>
          <fieldset className="mt-3 rounded-xl border border-border bg-background/40 p-4">
            <legend className="px-1 text-sm font-semibold">Campaign optimization</legend>
            <p className="mt-1 text-xs text-muted-foreground">Only upcoming, unpublished items can ever be changed. Published posts are never altered.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button type="button" variant={input.optimizationMode==="approval_required"?"secondary":"outline"} className="h-auto min-h-14 whitespace-normal" onClick={()=>update("optimizationMode","approval_required")}>Approval Required</Button>
              <Button type="button" variant={input.optimizationMode==="automatic"?"secondary":"outline"} className="h-auto min-h-14 whitespace-normal" onClick={()=>update("optimizationMode","automatic")}>Automatic Optimization</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{input.optimizationMode==="automatic"?"WaveOS may optimize future unpublished items and will notify you.":"WaveOS recommends changes and waits for your approval."}</p>
          </fieldset>
          </MobileWorkflowSection>

          {errors.length > 0 && (
            <ul className={cn("rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning", mobileStep !== 5 && "hidden sm:block")}>
              {errors.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          )}
          <MobileWorkflowFooter step={mobileStep} total={mobileSteps.length} onChange={setMobileStep} canNext={mobileStep === 0 ? Boolean(input.name.trim()) : mobileStep === 2 ? input.platforms.length > 0 && input.contentFormats.length > 0 : mobileStep === 3 ? input.maxPosts > 0 && input.maxPosts <= 60 : true} final={<Button className="min-h-12" onClick={generatePlan} disabled={errors.length > 0}><Sparkles /> Build plan</Button>} />
        </section>

        <aside className="space-y-5">
          <section className="surface-card hidden p-5 sm:block">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Guardrails
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• Nothing here schedules or publishes automatically.</li>
              <li>• Times are user-selected planning windows, not performance claims.</li>
              <li>• Approval status is preserved on every generated item.</li>
              <li>• AI suggestions are creative direction only; they never schedule or publish.</li>
            </ul>
          </section>

          <section className="surface-card p-5">
            <div className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-primary" /> What Campaign Manager does
            </div>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. Choose the campaign goal, platforms, cadence, and content.</li>
              <li>2. Analyze the selected media and build creative direction.</li>
              <li>3. Turn the plan into linked post drafts with captions and media.</li>
              <li>4. Review, approve, schedule, and follow the campaign from the command center.</li>
            </ol>
          </section>
        </aside>
      </div>

      {preview.length > 0 && (
        <section className="surface-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="font-semibold">Draft plan · {preview.length} items</h2>
              <p className="text-xs text-muted-foreground">
                Review every working title before saving.
              </p>
            </div>
            <Button onClick={() => savePlan.mutate()} disabled={savePlan.isPending || selectedMediaIds.length === 0}>
              {savePlan.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Save for review
            </Button>
          </div>
          <div className="divide-y divide-border">
            {preview.map((item) => (
              <article
                key={`${item.plannedDate}-${item.localTime}-${item.sequence}`}
                className="grid gap-3 p-4 sm:grid-cols-[6rem_8rem_minmax(0,1fr)] sm:p-5"
              >
                <div className="text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> {item.plannedDate}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" /> {item.localTime}
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary">{item.platform}</span>
                    <span className="rounded-full border border-border bg-elevated px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{item.contentFormat}</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold">{item.workingTitle}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.copyBrief}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function ChoiceGroup({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => {
          const active = selected.includes(value);
          return (
            <Button variant="outline"
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={cn(
                "min-h-10 rounded-full border px-3 text-xs font-semibold capitalize",
                active
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-elevated",
              )}
            >
              {active && <Check className="mr-1 inline h-3.5 w-3.5" />}
              {value}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";


function CampaignMediaTile({asset,selected,onToggle}:{asset:MediaAsset;selected:boolean;onToggle:()=>void}) {
  const [url,setUrl]=useState<string|null>(null);
  useEffect(()=>{let cancelled=false; void getMediaPreviewUrl(asset,3600,"thumbnail").then(value=>{if(!cancelled)setUrl(value);}).catch(()=>{if(!cancelled)setUrl(null);}); return ()=>{cancelled=true;};},[asset]);
  const isVideo=asset.mime_type.startsWith("video/");
  return <button type="button" onClick={onToggle} className={cn("relative aspect-square overflow-hidden rounded-xl border bg-elevated",selected?"border-primary ring-2 ring-primary/30":"border-border")}>
    {url ? (isVideo ? <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" /> : <img src={url} alt={asset.name} className="h-full w-full object-cover" />) : <div className="flex h-full items-center justify-center text-muted-foreground">{isVideo?<Video className="h-5 w-5"/>:<Images className="h-5 w-5"/>}</div>}
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6 text-left text-[10px] text-white"><span className="line-clamp-1">{asset.name}</span></div>
    {selected&&<span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground"><CheckCircle2 className="h-4 w-4"/></span>}
  </button>;
}
