import type { ResearchReport } from "@/lib/competitive-research";

export type CompetitiveScoreCategory = {
  key: string;
  label: string;
  score: number | null;
  coverage: number;
  confidence: "low" | "medium" | "high";
  sourceCount: number;
  evidenceCount: number;
  strengths: string[];
  gaps: string[];
};

const RUBRIC = [
  {
    key: "visibility",
    label: "Brand Visibility",
    patterns: /overview|social|website|seo|channel/i,
    weight: 1.1,
  },
  {
    key: "recognition",
    label: "Brand Recognition Signals",
    patterns: /brand|messaging|reputation|review|trust/i,
    weight: 0.9,
  },
  {
    key: "messaging",
    label: "Messaging Clarity",
    patterns: /brand|messaging|position|audience|overview/i,
    weight: 1.1,
  },
  {
    key: "differentiation",
    label: "Differentiation",
    patterns: /strength|different|position|compare|opportunit/i,
    weight: 1,
  },
  {
    key: "content",
    label: "Content & Social Presence",
    patterns: /social|content|channel/i,
    weight: 1,
  },
  { key: "website", label: "Website & SEO", patterns: /website|seo|search|local/i, weight: 1 },
  {
    key: "trust",
    label: "Reputation & Trust",
    patterns: /review|reputation|trust|strength|proof/i,
    weight: 0.9,
  },
  {
    key: "conversion",
    label: "Conversion Readiness",
    patterns: /conversion|opportunit|gap|website|call.to.action|booking/i,
    weight: 1,
  },
] as const;

const GAP_LANGUAGE =
  /\b(gap|missing|unclear|inconsistent|limited|not observed|not found|weak|friction|could not|unavailable)\b/i;

export function scoreResearchReport(report: ResearchReport) {
  const categories: CompetitiveScoreCategory[] = RUBRIC.map((rubric) => {
    const sections = report.sections.filter((section) => rubric.patterns.test(section.title));
    const findings = sections.flatMap((section) => section.findings);
    const supported = findings.filter((finding) => finding.sources.length > 0);
    const sources = [...new Set(supported.flatMap((finding) => finding.sources))];
    const gaps = supported.filter((finding) => GAP_LANGUAGE.test(finding.text));
    const strengths = supported.filter((finding) => !GAP_LANGUAGE.test(finding.text));
    const evidenceCount = supported.length;
    const coverage = Math.min(
      100,
      Math.round((evidenceCount / 3) * 70 + (sources.length / 3) * 30),
    );
    const eligible = evidenceCount > 0 && sources.length > 0;
    // The percentage is deterministic from cited rubric inputs. It is an
    // evidence assessment, never private engagement or measured awareness.
    const score = eligible
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              50 + strengths.length * 10 - gaps.length * 12 + Math.min(10, sources.length * 3),
            ),
          ),
        )
      : null;
    return {
      key: rubric.key,
      label: rubric.label,
      score,
      coverage,
      confidence: coverage >= 75 ? "high" : coverage >= 40 ? "medium" : "low",
      sourceCount: sources.length,
      evidenceCount,
      strengths: strengths.slice(0, 2).map((finding) => finding.text),
      gaps: gaps.slice(0, 2).map((finding) => finding.text),
    };
  });
  const eligible = categories
    .map((category, index) => ({ category, weight: RUBRIC[index].weight }))
    .filter((item) => item.category.score !== null);
  const overall = eligible.length
    ? Math.round(
        eligible.reduce((sum, item) => sum + (item.category.score ?? 0) * item.weight, 0) /
          eligible.reduce((sum, item) => sum + item.weight, 0),
      )
    : null;
  return {
    overall,
    coverage: Math.round(
      categories.reduce((sum, category) => sum + category.coverage, 0) / categories.length,
    ),
    categories,
    eligibleCategories: eligible.length,
    methodology:
      "WaveOS converts cited findings into eight published rubric categories. Supported positive observations add to the assessment; explicit gaps reduce it. Missing categories stay unavailable instead of becoming zero.",
  };
}

export function buildNinetyDayPlan(report: ResearchReport) {
  const opportunities = [
    ...report.ideas.map((claim) => claim.text),
    ...report.sections
      .filter((section) => /gap|opportunit|website|social|messaging/i.test(section.title))
      .flatMap((section) => section.findings.map((finding) => finding.text)),
  ].filter(Boolean);
  const unique = [...new Set(opportunities)].slice(0, 9);
  return [
    { window: "Next 30 days", focus: "Clarify and fix", actions: unique.slice(0, 3) },
    { window: "Days 31–60", focus: "Create and test", actions: unique.slice(3, 6) },
    { window: "Days 61–90", focus: "Measure and expand", actions: unique.slice(6, 9) },
  ].map((phase, index) => ({
    ...phase,
    actions:
      phase.actions.length > 0
        ? phase.actions
        : [
            index === 0
              ? "Confirm the highest-priority evidence gap with the team."
              : index === 1
                ? "Run one reviewable content test based on the confirmed gap."
                : "Compare the test with compatible first-party evidence before expanding it.",
          ],
  }));
}
