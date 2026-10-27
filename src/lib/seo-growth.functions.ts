import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeResearchSource } from "@/lib/competitive-research";

const seoClaim = z.object({
  title: z.string().trim().min(1).max(180),
  why: z.string().trim().min(1).max(1200),
  priority: z.enum(["high", "medium", "low"]),
  category: z.enum(["Google Business", "Website", "Technical SEO", "Local SEO", "Content", "Authority"]),
  steps: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  sources: z.array(z.string()).max(10),
});

const seoReportSchema = z.object({
  business: z.string().nullable(),
  website: z.string().nullable(),
  summary: z.string().trim().min(1).max(1800),
  quickWins: z.array(z.string().trim().min(1).max(500)).max(5),
  actions: z.array(seoClaim).min(1).max(18),
  limitations: z.array(z.string().trim().min(1).max(700)).max(8),
});

function publicHttps(raw: string) {
  const value = raw.trim();
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)
  ) {
    throw new Error("Use a public HTTPS business website.");
  }
  return url.href;
}

export const analyzeSeoGrowth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ workspaceId: z.string().uuid(), website: z.string().trim().min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const website = publicHttps(data.website);
    const [{ data: member }, { data: manageable }] = await Promise.all([
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
    ]);
    if (!member && (manageable as unknown as boolean | null) !== true) throw new Error("forbidden");

    const { data: brand } = await context.supabase
      .from("brand_profiles")
      .select("business_name,industry,service_area,primary_services,target_audience,brand_summary")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();

    const parallelKey = process.env.PARALLEL_API_KEY;
    const appKey = process.env.LOVABLE_API_KEY;
    if (!parallelKey || !appKey) throw new Error("SEO research connection is unavailable.");

    const claimSchema = {
      type: "object",
      additionalProperties: false,
      required: ["title", "why", "priority", "category", "steps", "sources"],
      properties: {
        title: { type: "string" },
        why: { type: "string" },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        category: { type: "string", enum: ["Google Business", "Website", "Technical SEO", "Local SEO", "Content", "Authority"] },
        steps: { type: "array", items: { type: "string" } },
        sources: { type: "array", items: { type: "string" } },
      },
    };
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["business", "website", "summary", "quickWins", "actions", "limitations"],
      properties: {
        business: { type: ["string", "null"] },
        website: { type: ["string", "null"] },
        summary: { type: "string" },
        quickWins: { type: "array", items: { type: "string" } },
        actions: { type: "array", items: claimSchema },
        limitations: { type: "array", items: { type: "string" } },
      },
    };

    const domain = new URL(website).hostname.replace(/^www\./, "");
    const businessName = brand?.business_name?.trim() || domain;
    const queries = [
      `"${businessName}" ${brand?.service_area ?? ""}`.trim(),
      `site:${domain} services`,
      `site:${domain} about`,
      `site:${domain} contact`,
      `"${businessName}" reviews`,
      `"${businessName}" ${brand?.industry ?? ""}`.trim(),
    ].map((query) => query.slice(0, 200));

    const searchResponse = await fetch("https://connector-gateway.lovable.dev/parallel/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appKey}`,
        "X-Connection-Api-Key": parallelKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "advanced",
        objective: `Find accessible public pages and listings for the same business as ${website}. Prioritize the official website, service/about/contact/location pages, Google or reputable local listings, reviews/reputation sources, and public pages useful for an evidence-based SEO audit. Brand identity context: ${JSON.stringify(brand)}. Do not infer private analytics, rankings, traffic, backlinks, or Search Console data.`,
        search_queries: queries,
        advanced_settings: { max_results: 24 },
      }),
    });

    if (!searchResponse.ok) {
      console.warn("SEO public search failed", { status: searchResponse.status });
      if (searchResponse.status === 402) throw new Error("SEO research credits are currently unavailable.");
      if (searchResponse.status === 429) throw new Error("SEO research is busy right now. Try again in a moment.");
      throw new Error("SEO public research is temporarily unavailable.");
    }

    const searchPayload = (await searchResponse.json()) as { results?: unknown[]; warnings?: unknown[] };
    if (searchPayload.warnings?.length) console.warn("SEO public search returned warnings", { count: searchPayload.warnings.length });

    const sourceRows = (searchPayload.results ?? []).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.url !== "string" || typeof row.title !== "string") return [];
      const url = normalizeResearchSource(row.url);
      if (!url) return [];
      const excerpts = Array.isArray(row.excerpts)
        ? row.excerpts.filter((value): value is string => typeof value === "string").join(" ")
        : typeof row.excerpt === "string"
          ? row.excerpt
          : "";
      return [{ url, title: row.title.trim(), excerpt: excerpts.trim().slice(0, 1800) }];
    });

    const uniqueSources = Array.from(new Map(sourceRows.map((row) => [row.url, row])).values()).slice(0, 20);
    if (!uniqueSources.length) throw new Error("SEO research returned no usable public sources.");

    const consulted = new Set(uniqueSources.map((row) => row.url));
    const sourceBundle = uniqueSources
      .map((row, index) => `[${index + 1}] ${row.title}\nURL: ${row.url}\nEvidence: ${row.excerpt || "Public page located; no excerpt was returned."}`)
      .join("\n\n");

    let parsed: z.infer<typeof seoReportSchema> | null = null;
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        max_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are WaveOS SEO Growth. Build a concise, useful SEO action plan only from the supplied public-source evidence. Never invent rankings, traffic, Search Console data, backlink counts, conversions, PageSpeed scores, review counts, or technical findings that are not explicitly supported. Every factual action must cite one or more exact URLs from the supplied source list. Suggestions may recommend checks or improvements, but must be phrased as recommendations rather than claims when evidence is incomplete. Prioritize practical local SEO, website clarity, service/location pages, internal linking, structured business information, content, Google Business/reputation opportunities, and publicly observable technical issues. Return JSON only with this exact shape: {"business":string|null,"website":string|null,"summary":string,"quickWins":string[],"actions":[{"title":string,"why":string,"priority":"high"|"medium"|"low","category":"Google Business"|"Website"|"Technical SEO"|"Local SEO"|"Content"|"Authority","steps":string[],"sources":string[]}],"limitations":string[]}.`,
          },
          {
            role: "user",
            content: `Website: ${website}\nBrand context: ${JSON.stringify(brand)}\n\nAllowed public sources:\n${sourceBundle}`,
          },
        ],
      }),
    });

    if (aiResponse.ok) {
      const json = (await aiResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = json.choices?.[0]?.message?.content?.trim();
      if (raw) {
        try {
          parsed = seoReportSchema.parse(JSON.parse(raw.replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "")));
        } catch (error) {
          console.warn("SEO synthesis response rejected", error instanceof z.ZodError ? { issues: error.issues.length } : { kind: "invalid_json" });
        }
      }
    } else {
      console.warn("SEO synthesis failed", { status: aiResponse.status });
    }

    if (!parsed) {
      const official = uniqueSources.find((row) => new URL(row.url).hostname.replace(/^www\./, "") === domain) ?? uniqueSources[0];
      parsed = {
        business: businessName,
        website,
        summary: `WaveOS found public pages for ${businessName}, but the deeper AI synthesis was unavailable. These safe next steps are based on the public site and should be verified before making changes.`,
        quickWins: [
          "Make the primary services and service area unmistakable on key pages.",
          "Give each major service a focused page with clear internal links.",
          "Keep business name, contact details, and location/service-area information consistent across public listings.",
        ],
        actions: [
          {
            title: "Clarify services and location signals",
            why: "Clear service and location language helps people and search engines understand what the business offers and where it operates.",
            priority: "high",
            category: "Local SEO",
            steps: ["Review the homepage and major service pages for specific service names and service-area language.", "Link important service and location pages from the main navigation or relevant page copy."],
            sources: [official.url],
          },
          {
            title: "Strengthen service-page structure",
            why: "Focused service pages create clearer destinations for specific customer searches and make internal linking more useful.",
            priority: "medium",
            category: "Website",
            steps: ["Confirm each core service has a useful standalone page.", "Add descriptive page titles, headings, and links between related services where appropriate."],
            sources: [official.url],
          },
          {
            title: "Verify public business information",
            why: "Consistent public business details support local discoverability and reduce customer confusion.",
            priority: "medium",
            category: "Google Business",
            steps: ["Compare the website's business name, phone, service area, and website URL with the current Google Business Profile and other important listings.", "Correct any inconsistent public details you find."],
            sources: [official.url],
          },
        ],
        limitations: ["The AI synthesis step was unavailable, so this fallback avoids claiming page-specific issues that were not independently verified."],
      };
    }

    const actions = parsed.actions
      .map((action) => ({
        ...action,
        sources: [...new Set(action.sources.flatMap((source) => {
          const normalized = normalizeResearchSource(source);
          return normalized && consulted.has(normalized) ? [normalized] : [];
        }))],
      }))
      .filter((action) => action.sources.length > 0);

    if (!actions.length) throw new Error("SEO research did not return enough verified public evidence.");
    return {
      ...parsed,
      website,
      actions,
      observedAt: new Date().toISOString(),
      methodology:
        "Public-source SEO guidance. WaveOS researches accessible public pages first, then builds recommendations only from those sources. It does not have private Google Search Console, Analytics, ranking or backlink-provider data unless those sources are separately connected.",
    };
  });
