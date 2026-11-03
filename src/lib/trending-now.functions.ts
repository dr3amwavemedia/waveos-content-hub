import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildTrendSearchQueries,
  normalizeTrendResults,
  videoTrendResults,
  trendVideoSource,
  trendDiscoveryStatus,
  type Trend,
} from "./trending-now";

export const discoverTrends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        type: z.enum(["audio", "format", "hook", "topic"]).default("topic"),
        query: z.string().max(600).default(""),
        filters: z
          .object({
            platform: z.enum(["All videos", "TikTok", "Instagram", "YouTube", "Facebook"]),
            style: z.string().max(80),
            language: z.string().max(80),
            market: z.string().max(120),
            niche: z.string().max(120),
            businessType: z.string().max(120),
            audience: z.string().max(120),
            days: z.union([z.literal(3), z.literal(7), z.literal(30)]),
            kind: z.string().max(80),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requireWorkspaceFeatureAccess } = await import("./zernio.server");
    await requireWorkspaceFeatureAccess(
      context.supabase,
      context.userId,
      data.workspaceId,
      "can_use_competitive_intelligence",
    );
    const key = process.env.PARALLEL_API_KEY;
    const appKey = process.env.LOVABLE_API_KEY;
    if (!key || !appKey)
      return {
        trends: [],
        supporting: [],
        status: "connection_unavailable" as const,
        message:
          "Public trend research is not connected in this environment. Connect the managed research provider, then retry; WaveOS will not substitute sample trends.",
        observedAt: new Date().toISOString(),
      };
    const connectionKey: string = key;
    const gatewayKey: string = appKey;
    const { data: brand, error } = await context.supabase
      .from("brand_profiles")
      .select("business_name,industry,primary_services,service_area,target_audience")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error("Workspace brand context could not be read.");
    const observedAt = new Date().toISOString(),
      cutoff = new Date(Date.now() - (data.filters?.days ?? 7) * 86400000)
        .toISOString()
        .slice(0, 10);
    const direction = [
      data.query,
      data.filters?.niche || brand?.industry,
      data.filters?.style,
      data.filters?.language,
      data.filters?.market,
      data.filters?.kind,
    ]
      .filter(Boolean)
      .join(" ");
    const terms = (
      data.query ||
      data.filters?.niche ||
      brand?.industry ||
      "small business storytelling"
    )
      .split(/\s+/)
      .slice(0, 4)
      .join(" ");
    const platforms =
      data.filters?.platform === "TikTok"
        ? ["TikTok"]
        : data.filters?.platform === "Instagram"
          ? ["Instagram Reels"]
          : data.filters?.platform === "YouTube"
            ? ["YouTube Shorts"]
            : data.filters?.platform === "Facebook"
              ? ["Facebook Reels"]
              : ["TikTok", "Instagram Reels", "YouTube Shorts", "Facebook Reels"];
    let providerCalls = 0,
      providerFailures = 0;
    async function runSearch(
      searchQueries: string[],
      objective: string,
      maxResults = 20,
      strictRecency = true,
      includeDomains: string[] = [],
    ) {
      providerCalls++;
      const queries = [...new Set(searchQueries)]
        .map((query) => query.replace(/\bsite:\S+/gi, " ").trim())
        .filter(Boolean)
        .map((query) => query.split(/\s+/).slice(0, 6).join(" "))
        .slice(0, 3);
      if (!queries.length) return [] as unknown[];
      const sourcePolicy: Record<string, unknown> = {};
      if (strictRecency) sourcePolicy.after_date = cutoff;
      if (includeDomains.length) sourcePolicy.include_domains = [...new Set(includeDomains)];
      const advanced_settings: Record<string, unknown> = {
        max_results: Math.max(1, Math.min(20, maxResults)),
        ...(Object.keys(sourcePolicy).length ? { source_policy: sourcePolicy } : {}),
      };
      try {
        const response = await fetch(
          "https://connector-gateway.lovable.dev/parallel/v1/search",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${gatewayKey}`,
              "X-Connection-Api-Key": connectionKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mode: "advanced",
              objective,
              search_queries: queries,
              advanced_settings,
            }),
          },
        );
        if (!response.ok) {
          providerFailures++;
          console.warn("Trend research failed", { status: response.status });
          return [] as unknown[];
        }
        const payload = (await response.json()) as { results?: unknown[]; warnings?: unknown[] };
        if (payload.warnings?.length)
          console.warn("Trend search returned warnings", { count: payload.warnings.length });
        return payload.results ?? [];
      } catch {
        providerFailures++;
        console.warn("Trend research request failed", { kind: "network_or_timeout" });
        return [] as unknown[];
      }
    }
    async function enrichTrend(trend: Trend): Promise<Trend | null> {
      const source = trendVideoSource(trend.url);
      if (!source) return null;
      if (source.platform === "TikTok") {
        try {
          const response = await fetch(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(trend.url)}`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (!response.ok) return trend;
          const data = (await response.json()) as {
            title?: unknown;
            author_name?: unknown;
            thumbnail_url?: unknown;
          };
          const thumbnail =
            typeof data.thumbnail_url === "string" && /^https:\/\//.test(data.thumbnail_url)
              ? data.thumbnail_url
              : undefined;
          return {
            ...trend,
            title: typeof data.title === "string" && data.title.trim() ? data.title : trend.title,
            creator: typeof data.author_name === "string" ? data.author_name : trend.creator,
            thumbnail,
          };
        } catch {
          return trend;
        }
      }
      if (source.platform === "YouTube") {
        try {
          const response = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(trend.url)}&format=json`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (!response.ok) return trend;
          const data = (await response.json()) as {
            title?: unknown;
            author_name?: unknown;
            thumbnail_url?: unknown;
          };
          return {
            ...trend,
            title: typeof data.title === "string" && data.title.trim() ? data.title : trend.title,
            creator: typeof data.author_name === "string" ? data.author_name : trend.creator,
            thumbnail:
              typeof data.thumbnail_url === "string" ? data.thumbnail_url : trend.thumbnail,
          };
        } catch {
          return trend;
        }
      }
      return trend;
    }
    const platformDomains: Record<string, string[]> = {
      TikTok: ["tiktok.com"],
      "Instagram Reels": ["instagram.com"],
      "YouTube Shorts": ["youtube.com", "youtu.be"],
      "Facebook Reels": ["facebook.com"],
    };
    const includeDomains = platforms.flatMap((platform) => platformDomains[platform] ?? []);
    const strictQueries = buildTrendSearchQueries(terms, platforms, "direct");
    const strictObjective = `Find genuinely high-traction original public short videos within the requested ${data.filters?.days ?? 7} day window. Prioritize TikTok /@creator/video links, Instagram /reel links, YouTube /shorts links and Facebook /reel or /videos links. Search intent: ${direction}. Additional filters: ${JSON.stringify(data.filters)}. Brand context: ${JSON.stringify(brand)}. Treat brand context as personality, audience and creative-direction guidance, NOT a literal keyword requirement. Include adjacent formats that the audience could naturally adapt even when the video is not about the same industry. Prefer videos with explicit public evidence of meaningful traction (for example 50K+ views/plays, 2K+ likes, or stronger), widely repeated formats, or clearly documented viral momentum. Do not surface weak low-engagement examples merely because their keywords match. Never invent rankings, engagement, rights or dates.`;
    const firstResults = await runSearch(strictQueries, strictObjective, 20, true, includeDomains);
    const broadTerms =
      [
        data.query,
        data.filters?.style,
        data.filters?.kind,
        brand?.target_audience,
        data.filters?.audience,
      ]
        .filter(Boolean)
        .join(" ") ||
      brand?.industry ||
      "business";
    let combined = [...firstResults];
    let seen = new Set<string>();
    let observations = normalizeTrendResults(combined, observedAt, data.type, cutoff).filter(
      (item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      },
    );
    let candidates = videoTrendResults(observations, data.filters?.platform).map((trend) => ({
      ...trend,
      searchContext: direction,
    }));
    if (candidates.length < 6) {
      const broadQueries = buildTrendSearchQueries(
        broadTerms,
        [...platforms].reverse(),
        "broad",
      );
      const broadResults = await runSearch(
        broadQueries,
        `Find additional original short-form videos creatively adaptable to this goal: ${data.query || direction || "business content ideas"}. Broaden semantically to adjacent storytelling, cinematic process, behind-the-scenes, POV, educational, funny/relatable, transformation, testimonial, service-demo and brand-story formats. Prefer direct creator/video URLs and public traction evidence when available, but do not exclude a useful original video solely because the result omits counts or a publish date. Never invent dates, engagement, rankings or rights.`,
        20,
        false,
        includeDomains,
      );
      combined = [...combined, ...broadResults];
      seen = new Set<string>();
      observations = normalizeTrendResults(combined, observedAt, data.type, cutoff).filter(
        (item) => {
          if (seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        },
      );
      candidates = videoTrendResults(observations, data.filters?.platform).map((trend) => ({
        ...trend,
        searchContext: direction,
      }));
    }
    if (
      candidates.length === 0 &&
      (!data.filters?.platform ||
        data.filters.platform === "All videos" ||
        data.filters.platform === "YouTube")
    ) {
      const youtubeOnly = await runSearch(
        buildTrendSearchQueries(terms, ["YouTube Shorts"], "direct"),
        `Find public YouTube Shorts that can inspire this content direction: ${data.query || direction || terms}. Prefer direct youtube.com/shorts URLs. Return useful original creator videos even when public view counts are not shown in search results. Do not invent metrics, dates, rankings or rights.`,
        20,
        false,
        ["youtube.com", "youtu.be"],
      );
      combined = [...combined, ...youtubeOnly];
      seen = new Set<string>();
      observations = normalizeTrendResults(combined, observedAt, data.type, cutoff).filter(
        (item) => {
          if (seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        },
      );
      candidates = videoTrendResults(observations, data.filters?.platform).map((trend) => ({
        ...trend,
        searchContext: direction,
      }));
    }
    const enriched = (await Promise.all(candidates.slice(0, 36).map(enrichTrend)))
      .filter((trend): trend is Trend => Boolean(trend))
      .sort((a, b) => (b.viralStrength ?? 0) - (a.viralStrength ?? 0))
      .slice(0, 12);
    const supporting = observations.filter((item) => !videoTrendResults([item]).length);
    const status = trendDiscoveryStatus(enriched.length, providerCalls, providerFailures);
    const message =
      status === "available"
        ? `${enriched.length} public video idea${enriched.length === 1 ? "" : "s"} found · traction is shown only when publicly available · dates may be unreported · audio rights remain unverified.`
        : status === "provider_unavailable"
          ? "The public research provider did not complete this search. Retry in a moment or adjust the date range; no sample trends were substituted."
          : "The provider responded, but none of its results resolved to supported original TikTok, Reel, Short, or Facebook video URLs. Broaden the phrase, platform, or date range.";
    return { trends: enriched, supporting, observedAt, status, message };
  });
