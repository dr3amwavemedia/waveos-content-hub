import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizedPortfolio,
  buildOceanTimeline,
  formatObservedMetric,
  oceanWorkload,
} from "../../src/lib/ocean-dashboard.ts";

const now = new Date("2026-11-02T15:00:00-05:00");
const content = [
  {
    id: "draft",
    title: "Draft reel",
    status: "draft",
    updated_at: "2026-11-02T09:00:00-05:00",
    scheduled_at: null,
  },
  {
    id: "review",
    title: "Review carousel",
    status: "in_review",
    updated_at: "2026-11-02T10:00:00-05:00",
    scheduled_at: null,
  },
  {
    id: "scheduled",
    title: "Scheduled story",
    status: "scheduled",
    updated_at: "2026-11-01T10:00:00-05:00",
    scheduled_at: "2026-11-02T17:00:00-05:00",
  },
  {
    id: "published",
    title: "Published post",
    status: "published",
    updated_at: "2026-11-02T08:00:00-05:00",
    scheduled_at: null,
  },
];
const shoots = [
  {
    id: "shoot",
    title: "Brand shoot",
    status: "scheduled",
    scheduled_at: "2026-11-02T13:00:00-05:00",
    location: null,
  },
  {
    id: "tomorrow",
    title: "Tomorrow shoot",
    status: "scheduled",
    scheduled_at: "2026-11-03T13:00:00-05:00",
    location: null,
  },
];

test("ocean workload counts real workflow states without treating published work as active", () => {
  assert.deepEqual(oceanWorkload(content, shoots, now), {
    content: 3,
    shoots: 1,
    approvals: 1,
    publishing: 1,
  });
});

test("ocean timeline classifies each dated record once and sorts by observed time", () => {
  const timeline = buildOceanTimeline(content, shoots, now);
  assert.deepEqual(
    timeline.map(({ id, kind }) => [id, kind]),
    [
      ["content:draft", "content"],
      ["content:review", "approval"],
      ["shoot:shoot", "shoot"],
      ["content:scheduled", "publishing"],
    ],
  );
});

test("portfolio contains authorized workspaces only and prioritizes the active workspace", () => {
  const workspaces = [
    { id: "b", name: "Beta" },
    { id: "a", name: "Alpha" },
    { id: "c", name: "Current" },
  ];
  assert.deepEqual(
    authorizedPortfolio(workspaces, "c").map(({ id }) => id),
    ["c", "a", "b"],
  );
});

test("unobserved performance remains unavailable instead of becoming a fake zero", () => {
  assert.equal(formatObservedMetric(null, false), "Unavailable");
  assert.equal(formatObservedMetric(undefined, false), "Unavailable");
  assert.equal(formatObservedMetric(0, false), "0");
  assert.equal(formatObservedMetric(10_200, false), "10.2K");
});
