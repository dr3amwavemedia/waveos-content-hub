import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildCampaignPlan,
  validateCampaignPlanningInput,
  type CampaignGoal,
  type CampaignPlanningInput,
} from "@/lib/phase-one-planning";

const workspaceInput = z.object({
  workspaceId: z.string().uuid(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const createPostInput = workspaceInput.extend({
  idea: z.string().trim().min(1).max(500),
  caption: z.string().trim().min(1).max(6000),
  platform: z.enum(["instagram", "facebook", "linkedin", "tiktok", "youtube", "x"]),
  placement: z.enum(["feed", "story"]),
});

const createCampaignInput = workspaceInput.extend({
  name: z.string().trim().min(1).max(120),
  goal: z.enum(["awareness", "engagement", "leads", "launch", "retention"]),
  durationDays: z.number().int().min(1).max(180),
  maxPosts: z.number().int().min(1).max(60),
  platforms: z
    .array(z.enum(["instagram", "facebook", "linkedin", "tiktok", "youtube", "x"]))
    .min(1)
    .max(6),
});

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function requireWorkspaceAccess(
  context: { supabase: any; userId: string },
  workspaceId: string,
  feature?: string,
) {
  const [{ data: member }, { data: manageable }, featureResult] = await Promise.all([
    context.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle(),
    context.supabase.rpc("can_staff_manage_workspace", {
      _user_id: context.userId,
      _workspace_id: workspaceId,
    }),
    feature
      ? context.supabase.rpc("has_feature", { _workspace_id: workspaceId, _feature: feature })
      : Promise.resolve({ data: true }),
  ]);
  const staff = manageable === true;
  if (!member && !staff) throw new Error("forbidden");
  if (!staff && feature && !featureResult.data) throw new Error("This tool is not included in this plan.");
  return { staff };
}

export const getAgentPerformanceSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireWorkspaceAccess(context as any, data.workspaceId, "can_use_ai_tools");

    const { data: rows, error } = await (context.supabase as any)
      .from("social_intelligence_snapshots")
      .select(
        "metric_key,value,unit,range_start,range_end,availability,provider,source_reference,calculation_version",
      )
      .eq("workspace_id", data.workspaceId)
      .in("availability", ["available", "true_zero"])
      .lte("range_end", data.localDate)
      .order("range_end", { ascending: false })
      .limit(240);
    if (error) throw new Error("Performance history could not be loaded.");

    const observations = (rows ?? []).filter(
      (row: any) =>
        typeof row.metric_key === "string" &&
        typeof row.range_start === "string" &&
        typeof row.range_end === "string" &&
        Number.isFinite(Number(row.value)),
    );

    if (!observations.length) {
      return {
        asOf: data.localDate,
        rangeStart: null,
        rangeEnd: null,
        metrics: [],
        message: "No connected performance history is available yet.",
      };
    }

    const latestEnd = observations[0].range_end;
    const currentRows = observations.filter((row: any) => row.range_end === latestEnd);
    const latestStart = currentRows
      .map((row: any) => row.range_start)
      .sort()
      .at(-1) ?? currentRows[0].range_start;
    const sameWindow = currentRows.filter((row: any) => row.range_start === latestStart);

    const priority = [
      "followers",
      "reach",
      "impressions",
      "views",
      "likes",
      "comments",
      "shares",
      "saves",
      "clicks",
      "messages",
      "story_views",
    ];
    const ordered = [...sameWindow].sort((a: any, b: any) => {
      const aIndex = priority.indexOf(a.metric_key);
      const bIndex = priority.indexOf(b.metric_key);
      return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
    });

    const currentStart = new Date(`${latestStart}T00:00:00Z`);
    const currentEnd = new Date(`${latestEnd}T00:00:00Z`);
    const days = Math.max(
      1,
      Math.round((currentEnd.getTime() - currentStart.getTime()) / 86_400_000) + 1,
    );
    const previousEndDate = new Date(currentStart);
    previousEndDate.setUTCDate(previousEndDate.getUTCDate() - 1);
    const previousStartDate = new Date(previousEndDate);
    previousStartDate.setUTCDate(previousStartDate.getUTCDate() - days + 1);
    const previousStart = previousStartDate.toISOString().slice(0, 10);
    const previousEnd = previousEndDate.toISOString().slice(0, 10);

    const metrics = ordered.slice(0, 6).map((row: any) => {
      const previous = observations.find(
        (candidate: any) =>
          candidate.metric_key === row.metric_key &&
          candidate.provider === row.provider &&
          candidate.calculation_version === row.calculation_version &&
          candidate.range_start === previousStart &&
          candidate.range_end === previousEnd,
      );
      const value = Number(row.value);
      const previousValue = previous ? Number(previous.value) : null;
      const changePercent =
        previousValue !== null && Number.isFinite(previousValue) && previousValue !== 0
          ? ((value - previousValue) / previousValue) * 100
          : null;
      return {
        key: row.metric_key,
        label: row.metric_key.replaceAll("_", " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
        value,
        unit: row.unit || "count",
        previousValue,
        changePercent,
      };
    });

    return {
      asOf: data.localDate,
      rangeStart: latestStart,
      rangeEnd: latestEnd,
      metrics,
      message: null,
    };
  });

export const createAgentCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => createCampaignInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireWorkspaceAccess(context as any, data.workspaceId, "can_use_campaign_manager");

    const input: CampaignPlanningInput = {
      name: data.name.trim(),
      goal: data.goal as CampaignGoal,
      startDate: addDays(data.localDate, 1),
      endDate: addDays(data.localDate, data.durationDays),
      platforms: data.platforms,
      maxPosts: data.maxPosts,
      postingHours: ["09:00", "15:00"],
      excludedDays: ["saturday", "sunday"],
      approvalRequired: true,
      optimizationMode: "approval_required",
      contentFormats: ["feed", "story"],
    };
    const errors = validateCampaignPlanningInput(input);
    if (errors.length) throw new Error(errors[0]);
    const plannedItems = buildCampaignPlan(input);
    if (!plannedItems.length) throw new Error("No campaign planning slots are available.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const planPayload = {
      workspace_id: data.workspaceId,
      created_by: context.userId,
      name: input.name,
      goal: input.goal,
      start_date: input.startDate,
      end_date: input.endDate,
      platforms: input.platforms,
      max_posts: input.maxPosts,
      posting_hours: input.postingHours,
      excluded_days: input.excludedDays,
      approval_required: true,
      optimization_mode: "approval_required",
      status: "draft",
    };

    let { data: plan, error: planError } = await (supabaseAdmin as any)
      .from("campaign_plans")
      .insert(planPayload)
      .select("id")
      .single();

    if (
      planError &&
      /optimization_mode/i.test(String(planError.message ?? "")) &&
      /column|schema cache|does not exist/i.test(String(planError.message ?? ""))
    ) {
      const { optimization_mode: _ignored, ...legacyPayload } = planPayload;
      const retry = await (supabaseAdmin as any)
        .from("campaign_plans")
        .insert(legacyPayload)
        .select("id")
        .single();
      plan = retry.data;
      planError = retry.error;
    }

    if (planError || !plan?.id) {
      console.error("My Agent campaign plan insert failed", {
        code: planError?.code ?? "unknown",
        message: planError?.message ?? "missing plan id",
      });
      throw new Error("Campaign plan could not be saved.");
    }

    const { error: itemsError } = await (supabaseAdmin as any)
      .from("campaign_plan_items")
      .insert(
        plannedItems.map((item) => ({
          workspace_id: data.workspaceId,
          campaign_plan_id: plan.id,
          position: item.sequence,
          planned_date: item.plannedDate,
          planned_time: item.localTime,
          platform: item.platform,
          content_pillar: item.pillar,
          working_title: item.workingTitle,
          copy_brief: item.copyBrief,
          approval_required: true,
          status: "draft",
        })),
      );
    if (itemsError) {
      console.error("My Agent campaign item insert failed", {
        code: itemsError.code ?? "unknown",
        message: itemsError.message ?? "campaign items insert failed",
      });
      await (supabaseAdmin as any)
        .from("campaign_plans")
        .delete()
        .eq("id", plan.id)
        .eq("workspace_id", data.workspaceId);
      throw new Error("Campaign plan could not be saved.");
    }

    return {
      id: plan.id as string,
      name: input.name,
      goal: input.goal,
      startDate: input.startDate,
      endDate: input.endDate,
      platforms: input.platforms,
      maxPosts: input.maxPosts,
      plannedItems: plannedItems.length,
    };
  });


export const createAgentPostDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => createPostInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireWorkspaceAccess(context as any, data.workspaceId, "can_create_content");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const titleBase = data.idea.replace(/\s+/g, " ").trim();
    const title = titleBase.length > 90 ? `${titleBase.slice(0, 87)}…` : titleBase;
    const { data: created, error } = await supabaseAdmin
      .from("content_items")
      .insert({
        workspace_id: data.workspaceId,
        created_by: context.userId,
        title,
        primary_caption: data.caption,
        hashtags: [],
        media_asset_ids: [],
        status: "draft",
        metadata: {
          source: "my_agent",
          platforms: [data.platform],
          placement: data.placement,
          localDate: data.localDate,
        },
      })
      .select("id")
      .single();

    if (error || !created?.id) throw new Error("Post draft could not be saved.");
    return {
      id: created.id as string,
      title,
      caption: data.caption,
      platform: data.platform,
      placement: data.placement,
    };
  });
