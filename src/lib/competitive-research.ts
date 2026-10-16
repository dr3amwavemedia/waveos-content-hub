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
  const url = new URL(/^https:\/\//i.test(raw) ? raw : `https://${raw}`);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || !host.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    throw new Error("Use a public HTTPS website or social profile.");
  }
  return url.href;
}
export function groundedReport(report: ResearchReport): ResearchReport {
  const clean = (claim: z.infer<typeof researchClaim>) => {
    const sources = claim.sources.flatMap(source => { try { return [publicResearchUrl(source)]; } catch { return []; } });
    return sources.length && claim.text.trim() ? [{ text: claim.text, sources }] : [];
  };
  return { ...report, sections: report.sections.map(section => ({ ...section, findings: section.findings.flatMap(clean) })), ideas: report.ideas.flatMap(clean) };
}