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

    const response = await fetch("https://connector-gateway.lovable.dev/parallel/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appKey}`,
        "X-Connection-Api-Key": parallelKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "parallel",
        reasoning: { effort: "low" },
        input: `Audit the public SEO presence for the business starting from ${website}. Use the supplied site as an identity clue, then review accessible public pages and search results tied to that same business. Brand context is only for identifying relevant services, audience and market: ${JSON.stringify(brand)}. Give practical steps a small business owner can actually complete. Prioritize Google Business Profile/local discoverability, title/meta clarity, crawl/index signals that are publicly observable, service/location pages, internal linking, useful content, structured information, reputation/authority opportunities, and obvious mobile/site issues when publicly supported. Do not promise rankings, guaranteed traffic or guaranteed placement. Do not invent Search Console, PageSpeed, backlink counts, keyword positions, traffic, conversion or private Google data. Every factual observation must cite an actually consulted public URL. Keep each action concise because WaveOS will hide its detailed steps inside a dropdown. Return the most important actions first.`,
        text: { format: { type: "json_schema", name: "seo_growth_audit", schema } },
      }),
    });
    if (!response.ok) throw new Error("SEO research could not be completed from public sources.");

    const payload = (await response.json()) as {
      output?: Array<{
        content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string }> }>;
        action?: { url?: string; sources?: Array<{ url?: string }> };
      }>;
    };
    const raw = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
    if (!raw) throw new Error("SEO research returned no usable report.");

    const consulted = new Set(
      (payload.output ?? [])
        .flatMap((item) => [
          ...(item.action?.url ? [item.action.url] : []),
          ...(item.action?.sources ?? []).flatMap((source) => (source.url ? [source.url] : [])),
          ...(item.content ?? []).flatMap((content) =>
            (content.annotations ?? []).flatMap((annotation) =>
              annotation.type === "url_citation" && annotation.url ? [annotation.url] : [],
            ),
          ),
        ])
        .flatMap((source) => {
          const normalized = normalizeResearchSource(source);
          return normalized ? [normalized] : [];
        }),
    );

    const parsed = seoReportSchema.parse(JSON.parse(raw));
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
        "Public-source SEO guidance. WaveOS does not have access to private Google Search Console, Analytics, ranking or backlink-provider data unless those sources are separately connected.",
    };
  });
