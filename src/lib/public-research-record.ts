import type { ResearchReport } from './competitive-research';
export type PublicResearchResult = { report: ResearchReport; inputUrl: string; researchedAt: string; methodology: string };
export type PublicResearchRecord = PublicResearchResult & { kind: 'public-research'; version: 1 };
export function researchRecord(result: PublicResearchResult): PublicResearchRecord {
  return { kind: 'public-research', version: 1, report: result.report, inputUrl: result.inputUrl, researchedAt: result.researchedAt, methodology: result.methodology };
}
export function researchRecordFromMetrics(metrics: unknown): PublicResearchRecord | null {
  if (!Array.isArray(metrics)) return null;
  const record = metrics.find(item => item?.kind === 'public-research' && item?.version === 1);
  return record?.report && typeof record.inputUrl === 'string' ? record : null;
}
export function researchText(result: PublicResearchResult): string {
  return [result.report.company ?? new URL(result.inputUrl).hostname, `Public research · ${result.researchedAt}`, result.inputUrl,
    `Industry: ${result.report.industry ?? 'Not found'}`, `Market: ${result.report.market ?? 'Not found'}`,
    ...result.report.sections.flatMap(section => [section.title, ...section.findings.map(f => `${f.text}\n${f.sources.join('\n')}`)]),
    'Original content ideas', ...result.report.ideas.map(f => `${f.text}\n${f.sources.join('\n')}`),
    'Methodology and coverage', result.methodology, ...result.report.limitations].join('\n\n');
}