import assert from "node:assert/strict";
import {
  buildCampaignPlan,
  scoreCompetitiveMetrics,
  validateCampaignPlanningInput,
} from "../../src/lib/phase-one-planning.ts";

const campaign = {
  name: "Spring launch",
  goal: "launch",
  startDate: "2026-04-06",
  endDate: "2026-04-12",
  platforms: ["instagram", "linkedin"],
  maxPosts: 4,
  postingHours: ["09:00", "15:00"],
  excludedDays: ["saturday", "sunday"],
  approvalRequired: true,
};

assert.deepEqual(validateCampaignPlanningInput(campaign), []);
const plan = buildCampaignPlan(campaign);
assert.equal(plan.length, 4);
assert.equal(plan[0].plannedDate, "2026-04-06");
assert.equal(plan.at(-1).plannedDate, "2026-04-10");
assert.equal(
  plan.every((item) => item.approvalRequired),
  true,
);
assert.deepEqual(
  plan.map((item) => item.platform),
  ["instagram", "linkedin", "instagram", "linkedin"],
);

const noAvailableDays = buildCampaignPlan({
  ...campaign,
  startDate: "2026-04-11",
  endDate: "2026-04-12",
});
assert.deepEqual(noAvailableDays, []);

const comparison = scoreCompetitiveMetrics([
  {
    label: "Posts per week",
    yourValue: 4,
    competitorValue: 2,
    unit: "posts",
    direction: "higher",
    sourceNote: "Manually counted public profile posts",
    observedAt: "2026-04-12",
  },
  {
    label: "Average response time",
    yourValue: 2,
    competitorValue: 4,
    unit: "hours",
    direction: "lower",
    sourceNote: "Manual customer-service test",
    observedAt: "2026-04-12",
  },
]);
assert.equal(comparison.score, 67);
assert.equal(comparison.comparedMetrics, 2);
assert.equal(comparison.confidence, "low");

const insufficient = scoreCompetitiveMetrics([
  {
    label: "Followers",
    yourValue: 100,
    competitorValue: null,
    unit: "followers",
    direction: "higher",
    sourceNote: "",
    observedAt: "",
  },
]);
assert.equal(insufficient.score, null);
assert.equal(insufficient.confidence, "insufficient");

console.log("Phase 1 campaign planning and manual comparison rules passed");

assert.equal(scoreCompetitiveMetrics([{label:"reach",yourValue:100,competitorValue:50,unit:"people",direction:"higher",sourceNote:"",observedAt:"2026-10-16"},{label:"views",yourValue:200,competitorValue:150,unit:"views",direction:"higher",sourceNote:"public count",observedAt:""}]).score, null);
