import { z } from "zod";

export const researchClaim = z.object({ text: z.string(), sources: z.array(z.string().url()) });
export const researchReportSchema = z.object({
  company: z.string().nullable(),
  industry: z.string().nullable(),
  market: z.string().nullable(),
  website: z.string().url().nullable(),
  channels: z.array(z.string().url()),
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
  const consulted = consultedUrls ? new Set(consultedUrls.flatMap(url=>{try{return [publicResearchUrl(url)];}catch{return [];}})) : null;
  const clean = (claim: z.infer<typeof researchClaim>) => {
    const sources = claim.sources.flatMap(source => { try { const url = publicResearchUrl(source); return !consulted || consulted.has(url) ? [url] : []; } catch { return []; } });
    return sources.length && claim.text.trim() ? [{ text: claim.text, sources }] : [];
  };
  return { ...report, sections: report.sections.map(section => ({ ...section, findings: section.findings.flatMap(clean) })), ideas: report.ideas.flatMap(clean) };
}