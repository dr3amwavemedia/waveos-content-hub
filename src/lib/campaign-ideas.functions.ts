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
  notes: z.array(z.string().trim().min(1).max(350)).max(5),
});

export const generateCampaignDirection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({
    workspaceId: z.string().uuid(),
    name: z.string().trim().max(120),
    goal: z.enum(["awareness", "engagement", "leads", "launch", "retention"]),
    platforms: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
    brief: z.string().trim().max(2000).optional(),
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
              "You are WaveOS Campaign Director. Build an organic social campaign direction that feels like a smart creative strategist, not a template generator. Use the saved brand profile as personality/audience context and use supplied historical performance evidence to learn from what has actually attracted attention. When historical evidence exists, favor patterns supported by the strongest observed days/posts while still introducing fresh creative angles; never imply causation from correlation and never invent missing metrics. If evidence is sparse, say so internally through conservative recommendations rather than fabricating performance conclusions. Favor specific human angles, recognizable situations, behind-the-scenes, storytelling, useful education, proof/process, personality, culture, transformation, and audience-relevant moments. Avoid generic marketing filler, fake urgency, invented offers, invented results, made-up statistics, and repetitive sales CTAs. Do not create a posting schedule or claim optimal posting times. Return JSON only with keys: angle, audienceInsight, pillars (name,purpose,examples), hooks, notes.",
          },
          {
            role: "user",
            content: `Brand profile: ${JSON.stringify(profile ?? {})}
Campaign name/idea: ${data.name || "Untitled campaign"}
Goal: ${data.goal}
Platforms: ${data.platforms.join(", ")}
Optional brief: ${data.brief ?? "None supplied"}
Historical performance evidence: ${JSON.stringify(performanceContext)}`,
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
    return campaignIdeaSchema.parse(JSON.parse(clean));
  });
