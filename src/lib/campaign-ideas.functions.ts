import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const campaignIdeaSchema = z.object({
  angle: z.string().trim().min(1).max(500),
  audienceInsight: z.string().trim().min(1).max(500),
  pillars: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    purpose: z.string().trim().min(1).max(400),
    examples: z.array(z.string().trim().min(1).max(300)).min(1).max(4),
  })).min(2).max(5),
  hooks: z.array(z.string().trim().min(1).max(250)).min(3).max(8),
  notes: z.preprocess(
    (value) => typeof value === "string" ? [value] : value,
    z.array(z.string().trim().min(1).max(350)).max(5),
  ),
  mediaRecommendations: z.array(z.object({
    mediaId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
    platforms: z.array(z.string().trim().min(1).max(40)).min(1).max(6),
    suggestedDay: z.string().trim().min(1).max(80),
    caption: z.string().trim().min(1).max(1200),
    hashtags: z.array(z.string().trim().min(1).max(80)).max(15),
    contentType: z.string().trim().min(1).max(120).default("unknown"),
    visualSummary: z.string().trim().min(1).max(500).default("No visual summary available."),
    likelyPurpose: z.string().trim().min(1).max(240).default("General campaign content"),
    hookPotential: z.enum(["low","medium","high"]).default("medium"),
    suggestedPlatforms: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
    confidence: z.enum(["low","medium","high"]).default("medium"),
    inspectionMode: z.enum(["photo","video_frames","metadata_only"]).default("metadata_only"),
  })).max(24).default([]),
});

export const generateCampaignDirection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({
    workspaceId: z.string().uuid(),
    name: z.string().trim().max(120),
    goal: z.enum(["awareness", "engagement", "leads", "launch", "retention"]),
    platforms: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
    brief: z.string().trim().max(2000).optional(),
    mediaIds: z.array(z.string().uuid()).max(24).default([]),
    videoFrames: z.array(z.object({
      mediaId: z.string().uuid(),
      frames: z.array(z.string().max(350_000)).min(1).max(3),
    })).max(6).default([]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured");

    const [{ data: member }, { data: manageable }, { data: entitled }] = await Promise.all([
      context.supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase.rpc(
        "can_staff_manage_workspace" as never,
        { _user_id: context.userId, _workspace_id: data.workspaceId } as never,
      ),
      context.supabase.rpc("has_feature", {
        _workspace_id: data.workspaceId,
        _feature: "can_use_ai_tools",
      }),
    ]);
    const staff = (manageable as unknown as boolean | null) === true;
    if (!member && !staff) throw new Error("forbidden");
    if (!staff && !entitled) throw new Error("AI Campaign Direction is available on Current and Tidal.");

    const [{ data: profile }, { data: intelligenceProfile }, { data: historyRows }] = await Promise.all([
      context.supabase
        .from("brand_profiles")
        .select("business_name,industry,service_area,primary_services,target_audience,brand_summary,tone_traits,preferred_phrases,words_to_avoid,default_ctas")
        .eq("workspace_id", data.workspaceId)
        .maybeSingle(),
      context.supabase
        .from("social_intelligence_profiles" as never)
        .select("available_range_start,available_range_end,record_count,metadata")
        .eq("workspace_id", data.workspaceId)
        .maybeSingle(),
      context.supabase
        .from("social_intelligence_snapshots" as never)
        .select("metric_key,value,range_start,range_end,evidence")
        .eq("workspace_id", data.workspaceId)
        .eq("availability", "available")
        .order("range_end", { ascending: false })
        .limit(1200),
    ]);

    type HistoryRow = {
      metric_key: string;
      value: number | string | null;
      range_start: string | null;
      range_end: string | null;
      evidence: { mode?: string; historicalBackfill?: boolean } | null;
    };
    const rows = ((historyRows ?? []) as HistoryRow[])
      .filter((row) => row.evidence?.mode === "combined" && row.range_end && row.value !== null)
      .map((row) => ({ ...row, numericValue: Number(row.value) }))
      .filter((row) => Number.isFinite(row.numericValue));

    const rankedDays = (metric: string) =>
      rows
        .filter((row) => row.metric_key === metric)
        .sort((a, b) => b.numericValue - a.numericValue)
        .slice(0, 8)
        .map((row) => ({ date: row.range_end, value: row.numericValue }));

    const intelligence = intelligenceProfile as {
      available_range_start?: string | null;
      available_range_end?: string | null;
      record_count?: number | null;
      metadata?: {
        historicalBackfill?: {
          topPosts?: Array<{
            postId?: string;
            platform?: string;
            publishedAt?: string;
            metrics?: Record<string, unknown>;
          }>;
          dailyRecords?: number;
        };
      } | null;
    } | null;

    const selectedMedia = data.mediaIds.length
      ? await context.supabase
          .from("media_assets")
          .select("id,name,mime_type,tags,storage_path,thumbnail_url,source_web_url,source_provider,duration_seconds,width,height,source_metadata")
          .eq("workspace_id", data.workspaceId)
          .in("id", data.mediaIds)
      : { data: [], error: null };
    if (selectedMedia.error) throw selectedMedia.error;

    const frameMap = new Map(data.videoFrames.map((entry) => [entry.mediaId, entry.frames]));
    const mediaContext = await Promise.all(
      (selectedMedia.data ?? []).map(async (asset) => {
        let previewUrl = asset.thumbnail_url ?? asset.source_web_url ?? null;
        if (!previewUrl && asset.storage_path && asset.mime_type?.startsWith("image/")) {
          const { data: signed } = await context.supabase.storage
            .from("media")
            .createSignedUrl(asset.storage_path, 60 * 20);
          previewUrl = signed?.signedUrl ?? null;
        }
        return {
          id: asset.id,
          name: asset.name,
          mimeType: asset.mime_type,
          tags: asset.tags ?? [],
          durationSeconds: asset.duration_seconds,
          width: asset.width,
          height: asset.height,
          previewUrl,
          storedIntelligence:
            asset.source_metadata && typeof asset.source_metadata === "object"
              ? (asset.source_metadata as Record<string, unknown>).waveos_campaign_intelligence ?? null
              : null,
          inspectionMode: asset.mime_type?.startsWith("video/")
            ? (frameMap.has(asset.id) ? "video_frames" : "metadata_only")
            : (previewUrl ? "photo" : "metadata_only"),
          videoFrames: frameMap.get(asset.id) ?? [],
        };
      }),
    );

    const performanceContext = {
      availableRangeStart: intelligence?.available_range_start ?? null,
      availableRangeEnd: intelligence?.available_range_end ?? null,
      dailyRecords: intelligence?.metadata?.historicalBackfill?.dailyRecords ?? intelligence?.record_count ?? 0,
      strongestEngagementDays: rankedDays("engagements"),
      strongestReachDays: rankedDays("reach"),
      strongestViewDays: rankedDays("views"),
      topPosts: (intelligence?.metadata?.historicalBackfill?.topPosts ?? []).slice(0, 20),
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are WaveOS Campaign Director. Build an organic social campaign direction that feels like a smart creative strategist, not a template generator. When selected media is provided, act as a content planner: rank the supplied pieces, identify which are strongest for the requested platforms, recommend a sensible day or sequence for each, and write a usable caption and hashtag set for each selected recommendation. For each recommended asset also return contentType, visualSummary, likelyPurpose, hookPotential (low/medium/high), suggestedPlatforms, confidence (low/medium/high), and inspectionMode (photo/video_frames/metadata_only). Never invent visual details you cannot actually infer. Treat video_frames as true visual inspection, photo as image inspection, and metadata_only as uninspected media.  Use the saved brand profile as personality/audience context and use supplied historical performance evidence to learn from what has actually attracted attention. When historical evidence exists, favor patterns supported by the strongest observed days/posts while still introducing fresh creative angles; never imply causation from correlation and never invent missing metrics. If evidence is sparse, say so internally through conservative recommendations rather than fabricating performance conclusions. Favor specific human angles, recognizable situations, behind-the-scenes, storytelling, useful education, proof/process, personality, culture, transformation, and audience-relevant moments. Avoid generic marketing filler, fake urgency, invented offers, invented results, made-up statistics, and repetitive sales CTAs. Suggested days may use historical evidence and campaign sequencing, but never call them guaranteed optimal posting times. Return JSON only with keys: angle, audienceInsight, pillars (name,purpose,examples), hooks, notes, mediaRecommendations (mediaId,reason,platforms,suggestedDay,caption,hashtags,contentType,visualSummary,likelyPurpose,hookPotential,suggestedPlatforms,confidence,inspectionMode).",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Brand profile: ${JSON.stringify(profile ?? {})}
Campaign name/idea: ${data.name || "Untitled campaign"}
Goal: ${data.goal}
Platforms: ${data.platforms.join(", ")}
Optional brief: ${data.brief ?? "None supplied"}
Historical performance evidence: ${JSON.stringify(performanceContext)}
Selected media: ${JSON.stringify(mediaContext.map(({previewUrl,videoFrames,...rest})=>rest))}
Available photo previews and extracted video frames are supplied below when possible.`,
              },
              ...mediaContext
                .filter((item) => item.previewUrl && item.mimeType?.startsWith("image/"))
                .slice(0, 12)
                .map((item) => ({
                  type: "image_url" as const,
                  image_url: { url: item.previewUrl! },
                })),
              ...mediaContext
                .filter((item) => item.videoFrames.length > 0)
                .slice(0, 6)
                .flatMap((item) => item.videoFrames.map((frame) => ({
                  type: "image_url" as const,
                  image_url: { url: frame },
                }))),
            ],
          },
        ],
      }),
    });
    if (response.status === 429) throw new Error("Rate limit reached. Try again in a moment.");
    if (response.status === 402) throw new Error("AI credits exhausted. Please top up in Settings.");
    if (!response.ok) throw new Error("Campaign AI could not be completed.");

    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("Campaign AI returned no usable direction.");
    const clean = raw.replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
    const parsed = campaignIdeaSchema.parse(JSON.parse(clean));

    // Persist reusable media intelligence without replacing provider metadata.
    for (const recommendation of parsed.mediaRecommendations) {
      const asset = (selectedMedia.data ?? []).find((item) => item.id === recommendation.mediaId);
      if (!asset) continue;
      const existing =
        asset.source_metadata && typeof asset.source_metadata === "object"
          ? (asset.source_metadata as Record<string, unknown>)
          : {};
      const nextMetadata = {
        ...existing,
        waveos_campaign_intelligence: {
          analyzedAt: new Date().toISOString(),
          contentType: recommendation.contentType,
          visualSummary: recommendation.visualSummary,
          likelyPurpose: recommendation.likelyPurpose,
          hookPotential: recommendation.hookPotential,
          suggestedPlatforms: recommendation.suggestedPlatforms.length
            ? recommendation.suggestedPlatforms
            : recommendation.platforms,
          confidence: recommendation.confidence,
          inspectionMode: recommendation.inspectionMode,
        },
      };
      const { error: updateError } = await context.supabase
        .from("media_assets")
        .update({ source_metadata: nextMetadata as never })
        .eq("id", asset.id)
        .eq("workspace_id", data.workspaceId);
      if (updateError) console.warn("Could not persist campaign media intelligence", asset.id);
    }

    return parsed;
  });


const campaignDraftInput = z.object({
  workspaceId: z.string().uuid(),
  campaignName: z.string().trim().max(120).optional(),
  recommendations: z.array(z.object({
    mediaId: z.string().uuid(),
    caption: z.string().trim().min(1).max(1200),
    hashtags: z.array(z.string().trim().min(1).max(80)).max(15),
    platforms: z.array(z.string().trim().min(1).max(40)).max(6),
    suggestedDay: z.string().trim().max(80),
    contentType: z.string().trim().max(120).optional(),
  })).min(1).max(24),
});

export const createCampaignPostDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => campaignDraftInput.parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: member }, { data: manageable }] = await Promise.all([
      context.supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase.rpc(
        "can_staff_manage_workspace" as never,
        { _user_id: context.userId, _workspace_id: data.workspaceId } as never,
      ),
    ]);
    const canManage =
      (manageable as unknown as boolean | null) === true ||
      ["owner","admin","editor"].includes(member?.role ?? "");
    if (!canManage) throw new Error("You do not have permission to create campaign drafts.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.recommendations.map((rec, index) => ({
      workspace_id: data.workspaceId,
      created_by: context.userId,
      title: `${data.campaignName?.trim() || "Campaign"} · Post ${index + 1}`,
      primary_caption: rec.caption,
      hashtags: rec.hashtags.map((tag) => tag.replace(/^#/, "")),
      media_asset_ids: [rec.mediaId],
      status: "draft" as const,
      metadata: {
        source: "campaign_manager",
        campaignName: data.campaignName?.trim() || null,
        platforms: rec.platforms,
        suggestedDay: rec.suggestedDay,
        contentType: rec.contentType ?? null,
      },
    }));
    const { data: created, error } = await supabaseAdmin
      .from("content_items")
      .insert(rows)
      .select("id");
    if (error) throw error;
    return { createdIds: (created ?? []).map((row) => row.id), count: created?.length ?? 0 };
  });
