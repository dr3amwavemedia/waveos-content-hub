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

type SeoSource = { url: string; title: string; excerpt: string };

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function textFromHtml(html: string) {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function htmlField(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1] ? textFromHtml(match[1]).trim() : "";
}

function pageEvidence(html: string) {
  const title = htmlField(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i)?.[1] ??
    "";
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].slice(0, 3).map((match) => textFromHtml(match[1]));
  const h2 = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].slice(0, 5).map((match) => textFromHtml(match[1]));
  const canonical =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i)?.[1] ??
    "";
  const robots =
    html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1] ?? "";
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
  const body = textFromHtml(html).slice(0, 3600);
  return [
    title && `Title: ${title}`,
    description && `Meta description: ${decodeHtml(description)}`,
    h1.length && `H1: ${h1.join(" | ")}`,
    h2.length && `H2: ${h2.join(" | ")}`,
    canonical && `Canonical: ${canonical}`,
    robots && `Robots: ${robots}`,
    `Structured data present: ${hasJsonLd ? "yes" : "not observed in fetched HTML"}`,
    body && `Page text: ${body}`,
  ].filter(Boolean).join("\n").slice(0, 5200);
}

function sameSiteHost(a: string, b: string) {
  return a.replace(/^www\./, "").toLowerCase() === b.replace(/^www\./, "").toLowerCase();
}

async function crawlOfficialSite(startUrl: string): Promise<SeoSource[]> {
  const start = new URL(startUrl);
  const queued = [start.href];
  const seen = new Set<string>();
  const results: SeoSource[] = [];

  while (queued.length && results.length < 8) {
    const current = queued.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    try {
      const response = await fetch(current, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "WaveOS-SEO-Audit/1.0" },
      });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) continue;
      const finalUrl = new URL(response.url || current);
      if (finalUrl.protocol !== "https:" || !sameSiteHost(finalUrl.hostname, start.hostname)) continue;
      const html = (await response.text()).slice(0, 800_000);
      const normalized = normalizeResearchSource(finalUrl.href);
      if (!normalized) continue;
      const title = htmlField(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || finalUrl.pathname || start.hostname;
      results.push({ url: normalized, title, excerpt: pageEvidence(html) });

      const links = [...html.matchAll(/<a\b[^>]+href=["']([^"'#]+)["']/gi)]
        .map((match) => match[1])
        .flatMap((href) => {
          try {
            const url = new URL(href, finalUrl);
            if (url.protocol !== "https:" || !sameSiteHost(url.hostname, start.hostname)) return [];
            url.hash = "";
            url.search = "";
            const path = url.pathname.toLowerCase();
            if (/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mov|mp3|xml)$/i.test(path)) return [];
            return [url.href];
          } catch {
            return [];
          }
        })
        .filter((url) => /\/(?:services?|about|contact|locations?|areas?|portfolio|work|blog|news|pricing|faq|team)(?:\/|$)/i.test(new URL(url).pathname));
      for (const link of links.slice(0, 12)) if (!seen.has(link) && !queued.includes(link)) queued.push(link);
    } catch (error) {
      console.warn("SEO direct page fetch failed", { url: current, kind: error instanceof Error ? error.name : "unknown" });
    }
  }

  return results;
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

    const directSources = await crawlOfficialSite(website);
    let searchRows: SeoSource[] = [];
    let researchNotice: string | null = null;

    if (parallelKey && appKey) {
      try {
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

        if (searchResponse.ok) {
          const searchPayload = (await searchResponse.json()) as { results?: unknown[]; warnings?: unknown[] };
          if (searchPayload.warnings?.length) console.warn("SEO public search returned warnings", { count: searchPayload.warnings.length });
          searchRows = (searchPayload.results ?? []).flatMap((item) => {
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
        } else {
          console.warn("SEO public search unavailable; using direct-site audit", { status: searchResponse.status });
          researchNotice =
            searchResponse.status === 402
              ? "Broader web research credits were unavailable, so this audit used the business website directly."
              : searchResponse.status === 429
                ? "Broader web research was temporarily rate-limited, so this audit used the business website directly."
                : "Broader web research was unavailable, so this audit used the business website directly.";
        }
      } catch (error) {
        console.warn("SEO public search request failed; using direct-site audit", { kind: error instanceof Error ? error.name : "unknown" });
        researchNotice = "Broader web research was unavailable, so this audit used the business website directly.";
      }
    } else {
      researchNotice = "Broader web research is not connected, so this audit used the business website directly.";
    }

    const sourceRows: SeoSource[] = [...directSources, ...searchRows];
    const uniqueSources = Array.from(new Map(sourceRows.map((row) => [row.url, row])).values()).slice(0, 20);
    if (!uniqueSources.length) throw new Error("WaveOS could not read this website. Confirm the site is public HTTPS and try again.");

    const consulted = new Set(uniqueSources.map((row) => row.url));
    const sourceBundle = uniqueSources
      .map((row, index) => `[${index + 1}] ${row.title}\nURL: ${row.url}\nEvidence: ${row.excerpt || "Public page located; no excerpt was returned."}`)
      .join("\n\n");

    let parsed: z.infer<typeof seoReportSchema> | null = null;
    const aiResponse = appKey ? await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are WaveOS SEO Growth. Write for a small-business owner with no SEO training. Build a concise action plan only from the supplied public-source evidence. Use plain English first; avoid unexplained jargon such as NAP, schema, canonical, crawlability, indexation, SERP, backlinks, metadata, internal linking, structured data, or keyword cannibalization. If a technical term is necessary, immediately explain it in everyday language. Action titles should sound like normal tasks a business owner can understand, for example "Make your service pages easier to find" instead of "Improve internal linking." Keep the summary to 2-3 short sentences. Quick wins should be one clear sentence each. For every action, "why" should explain the business benefit in simple language, and "steps" should be specific enough that the owner can either do them or hand them directly to a web/marketing person. Never invent rankings, traffic, Search Console data, backlink counts, conversions, PageSpeed scores, review counts, or technical findings that are not explicitly supported. Every factual action must cite one or more exact URLs from the supplied source list. Suggestions may recommend checks or improvements, but must be phrased as recommendations rather than claims when evidence is incomplete. Return JSON only with this exact shape: {"business":string|null,"website":string|null,"summary":string,"quickWins":string[],"actions":[{"title":string,"why":string,"priority":"high"|"medium"|"low","category":"Google Business"|"Website"|"Technical SEO"|"Local SEO"|"Content"|"Authority","steps":string[],"sources":string[]}],"limitations":string[]}.`,
          },
          {
            role: "user",
            content: `Website: ${website}\nBrand context: ${JSON.stringify(brand)}\n\nAllowed public sources:\n${sourceBundle}`,
          },
        ],
      }),
    }) : null;

    if (aiResponse?.ok) {
      const json = (await aiResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = json.choices?.[0]?.message?.content?.trim();
      if (raw) {
        try {
          parsed = seoReportSchema.parse(JSON.parse(raw.replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "")));
        } catch (error) {
          console.warn("SEO synthesis response rejected", error instanceof z.ZodError ? { issues: error.issues.length } : { kind: "invalid_json" });
        }
      }
    } else if (aiResponse) {
      console.warn("SEO synthesis failed", { status: aiResponse.status });
    }

    if (!parsed) {
      const official = uniqueSources.find((row) => new URL(row.url).hostname.replace(/^www\./, "") === domain) ?? uniqueSources[0];
      parsed = {
        business: businessName,
        website,
        summary: `WaveOS found public pages for ${businessName}, but the deeper AI synthesis was unavailable. These safe next steps are based on the public site and should be verified before making changes.`,
        quickWins: [
          "Make your main services and the areas you serve obvious on your website.",
          "Give each major service its own clear page so customers can find the right information faster.",
          "Make sure your business name, phone number, website, and service area match everywhere online.",
        ],
        actions: [
          {
            title: "Make it obvious what you do and where you work",
            why: "Customers should immediately understand your main services and the areas you serve.",
            priority: "high",
            category: "Local SEO",
            steps: ["Update the homepage and main service pages so they clearly name your services and service areas.", "Ask your web person to make sure those important pages are easy to reach from the menu or other relevant pages."],
            sources: [official.url],
          },
          {
            title: "Give each main service its own useful page",
            why: "A dedicated page makes it easier for customers to learn about one service without digging through the whole site.",
            priority: "medium",
            category: "Website",
            steps: ["Check that each core service has its own page with useful details.", "Ask your web person to use a clear page title and heading, then connect related service pages with simple links."],
            sources: [official.url],
          },
          {
            title: "Make sure your business details match everywhere",
            why: "Matching contact and location information helps customers trust they found the right business.",
            priority: "medium",
            category: "Google Business",
            steps: ["Compare your website with your Google Business Profile and other important listings.", "Fix any differences in your business name, phone number, website, or service area."],
            sources: [official.url],
          },
        ],
        limitations: [
          "The AI synthesis step was unavailable, so this fallback avoids claiming page-specific issues that were not independently verified.",
          ...(researchNotice ? [researchNotice] : []),
        ],
      };
    }

    if (researchNotice && !parsed.limitations.includes(researchNotice)) parsed.limitations = [...parsed.limitations, researchNotice];

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
        "Public-source SEO guidance. WaveOS audits the entered website directly and supplements it with broader public research when that connection is available. It does not have private Google Search Console, Analytics, ranking or backlink-provider data unless those sources are separately connected.",
    };
  });
