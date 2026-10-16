export const CAMPAIGN_GOALS = ["awareness", "engagement", "leads", "launch", "retention"] as const;

export type CampaignGoal = (typeof CAMPAIGN_GOALS)[number];

export interface CampaignPlanningInput {
  name: string;
  goal: CampaignGoal;
  startDate: string;
  endDate: string;
  platforms: string[];
  maxPosts: number;
  postingHours: string[];
  excludedDays: string[];
  approvalRequired: boolean;
}

export interface CampaignPlanningItem {
  sequence: number;
  plannedDate: string;
  localTime: string;
  platform: string;
  pillar: string;
  workingTitle: string;
  copyBrief: string;
  approvalRequired: boolean;
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const GOAL_PILLARS: Record<CampaignGoal, string[]> = {
  awareness: ["Brand story", "Point of view", "Proof", "Community"],
  engagement: ["Question", "Behind the scenes", "Tip", "Community spotlight"],
  leads: ["Problem", "Solution", "Proof", "Invitation"],
  launch: ["Teaser", "Benefit", "Demonstration", "Launch moment", "Reminder"],
  retention: ["Education", "Success habit", "Feature spotlight", "Customer care"],
};

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function validateCampaignPlanningInput(input: CampaignPlanningInput): string[] {
  const errors: string[] = [];
  const start = parseIsoDate(input.startDate);
  const end = parseIsoDate(input.endDate);
  if (!input.name.trim()) errors.push("Add a campaign name.");
  if (!start || !end) errors.push("Choose a valid start and end date.");
  else if (end.getTime() < start.getTime()) errors.push("End date must be on or after start date.");
  if (input.platforms.length === 0) errors.push("Choose at least one platform.");
  if (!Number.isInteger(input.maxPosts) || input.maxPosts < 1 || input.maxPosts > 60) {
    errors.push("Max posts must be between 1 and 60.");
  }
  if (input.postingHours.length === 0) errors.push("Add at least one planning time.");
  if (input.postingHours.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    errors.push("Planning times must use 24-hour HH:MM format.");
  }
  return errors;
}

/**
 * Builds a deterministic internal plan. These are planning slots only: this
 * function never schedules or publishes content and makes no best-time claim.
 */
export function buildCampaignPlan(input: CampaignPlanningInput): CampaignPlanningItem[] {
  if (validateCampaignPlanningInput(input).length) return [];
  const start = parseIsoDate(input.startDate)!;
  const end = parseIsoDate(input.endDate)!;
  const excluded = new Set(input.excludedDays.map((day) => day.toLowerCase()));
  const eligibleDates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (!excluded.has(DAY_NAMES[cursor.getUTCDay()])) eligibleDates.push(isoDate(cursor));
  }
  if (!eligibleDates.length) return [];

  const slots = eligibleDates.flatMap((plannedDate) =>
    input.postingHours.map((localTime) => ({ plannedDate, localTime })),
  );
  const itemCount = Math.min(input.maxPosts, slots.length);
  const pillars = GOAL_PILLARS[input.goal];
  const selectedSlots = Array.from({ length: itemCount }, (_, index) => {
    const slotIndex =
      itemCount === 1
        ? 0
        : Math.min(slots.length - 1, Math.round((index * (slots.length - 1)) / (itemCount - 1)));
    return slots[slotIndex];
  });

  return selectedSlots.map((slot, index) => {
    const pillar = pillars[index % pillars.length];
    const platform = input.platforms[index % input.platforms.length];
    return {
      sequence: index + 1,
      plannedDate: slot.plannedDate,
      localTime: slot.localTime,
      platform,
      pillar,
      workingTitle: `${pillar}: ${input.name}`,
      copyBrief: `Draft a ${platform} concept that supports the ${input.goal} goal through ${pillar.toLowerCase()}.`,
      approvalRequired: input.approvalRequired,
    };
  });
}

export type MetricDirection = "higher" | "lower";

export interface CompetitiveMetric {
  label: string;
  yourValue: number | null;
  competitorValue: number | null;
  unit: string;
  direction: MetricDirection;
  sourceNote: string;
  observedAt: string;
}

export interface CompetitiveScore {
  score: number | null;
  comparedMetrics: number;
  confidence: "insufficient" | "low" | "medium" | "high";
  metricScores: Array<{ label: string; score: number }>;
}

function metricScore(metric: CompetitiveMetric) {
  if (!metric.sourceNote.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(metric.observedAt) || !Number.isFinite(Date.parse(metric.observedAt))) return null;
  if (metric.yourValue === null || metric.competitorValue === null) return null;
  if (!Number.isFinite(metric.yourValue) || !Number.isFinite(metric.competitorValue)) return null;
  const ours = Math.max(0, metric.yourValue);
  const theirs = Math.max(0, metric.competitorValue);
  if (ours === 0 && theirs === 0) return 50;
  const denominator = ours + theirs;
  const share = metric.direction === "higher" ? ours / denominator : theirs / denominator;
  return Math.round(share * 100);
}

/** A transparent WaveOS-defined comparison of user-entered observations. */
export function scoreCompetitiveMetrics(metrics: CompetitiveMetric[]): CompetitiveScore {
  const metricScores = metrics.flatMap((metric) => {
    const score = metricScore(metric);
    return score === null ? [] : [{ label: metric.label || "Untitled metric", score }];
  });
  const comparedMetrics = metricScores.length;
  if (comparedMetrics < 2) {
    return { score: null, comparedMetrics, confidence: "insufficient", metricScores };
  }
  const score = Math.round(
    metricScores.reduce((total, metric) => total + metric.score, 0) / comparedMetrics,
  );
  const documented = metrics.filter(
    (metric) => metricScore(metric) !== null && metric.sourceNote.trim() && metric.observedAt,
  ).length;
  const confidence =
    comparedMetrics >= 5 && documented === comparedMetrics
      ? "high"
      : comparedMetrics >= 3 && documented >= Math.ceil(comparedMetrics / 2)
        ? "medium"
        : "low";
  return { score, comparedMetrics, confidence, metricScores };
}
