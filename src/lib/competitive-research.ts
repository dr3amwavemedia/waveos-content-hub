import { z } from "zod";

export const RESEARCH_FAILURE_MESSAGE = "Competitive research couldn’t be completed from the available public sources. Try the website or public social profile again.";
export const RESEARCH_SOURCE_WARNING = "Some research sources could not be verified. WaveOS kept the valid public sources and excluded invalid citations.";

export function normalizeResearchSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  // Bare sources must clearly be domains, not labels, prose or relative paths.
  if (!value || /\s|[\\<>]/.test(value)) return null;
  if (!/^https?:\/\//i.test(value) && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?:[/?#]|$)/i.test(value)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase();
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}
const sourceArray = z.preprocess(value => Array.isArray(value)
  ? [...new Set(value.flatMap(source => { const url = normalizeResearchSource(source); return url ? [url] : []; }))]
  : value, z.array(z.string().url()));
export const researchClaim = z.object({ text: z.string(), sources: sourceArray });
export const researchReportSchema = z.object({
  company: z.string().nullable(),
  industry: z.string().nullable(),
  market: z.string().nullable(),
  website: z.preprocess(value => normalizeResearchSource(value), z.string().url().nullable()),
  channels: sourceArray,
  sections: z.array(z.object({ title: z.string(), findings: z.array(researchClaim) })),
  ideas: z.array(researchClaim),
  limitations: z.array(z.string()),
});
export type ResearchReport = z.infer<typeof researchReportSchema>;
export function publicResearchUrl(raw: string) {
  const value = raw.trim();
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || !host.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    throw new Error("Use a public HTTPS website or social profile.");
  }
  return url.href;
}
export function groundedReport(report: ResearchReport, consultedUrls?: string[]): ResearchReport {
  const consulted = consultedUrls ? new Set(consultedUrls.flatMap(source=>{const url=normalizeResearchSource(source);return url?[url]:[];})) : null;
  const clean = (claim: z.infer<typeof researchClaim>) => {
    const sources = [...new Set(claim.sources.flatMap(source => { const url = normalizeResearchSource(source); return url && (!consulted || consulted.has(url)) ? [url] : []; }))];
    return sources.length && claim.text.trim() ? [{ text: claim.text, sources }] : [];
  };
  const supportedUrl = (source: string) => { const url = normalizeResearchSource(source); return url && (!consulted || consulted.has(url)) ? url : null; };
  return { ...report, website: report.website ? supportedUrl(report.website) : null, channels: report.channels.flatMap(source=>{const url=supportedUrl(source);return url?[url]:[];}), sections: report.sections.map(section => ({ ...section, findings: section.findings.flatMap(clean) })), ideas: report.ideas.flatMap(clean) };
}
export function validatedResearchReport(raw: unknown, consultedUrls: string[]) {
  const parsed = researchReportSchema.parse(raw);
  const report = groundedReport(parsed, consultedUrls);
  if (!report.sections.some(section => section.findings.length)) throw new Error(RESEARCH_FAILURE_MESSAGE);
  // Compare URL-bearing data only, not ordinary copy or nullable identity fields.
  const urls = (value: unknown): unknown[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const claims = [...(Array.isArray(row.ideas) ? row.ideas : []), ...(Array.isArray(row.sections) ? row.sections.flatMap(section => section && typeof section === "object" && Array.isArray(section.findings) ? section.findings : []) : [])];
    return [row.website, ...(Array.isArray(row.channels) ? row.channels : []), ...claims.flatMap(claim => claim && typeof claim === "object" && Array.isArray(claim.sources) ? claim.sources : [])].filter(value=>value !== null && value !== undefined);
  };
  const sourcesFiltered = urls(raw).length !== urls(report).length;
  if (sourcesFiltered) report.limitations = [...report.limitations, RESEARCH_SOURCE_WARNING];
  return { report, sourcesFiltered };
}