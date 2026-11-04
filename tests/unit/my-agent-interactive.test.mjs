import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const agent = fs.readFileSync("src/routes/_authenticated/my-agent.tsx", "utf8");
const actions = fs.readFileSync("src/lib/my-agent-actions.functions.ts", "utf8");
const assist = fs.readFileSync("src/lib/wave-assist.functions.ts", "utf8");

test("My Agent launches interactive WaveOS tools from natural prompts", () => {
  assert.match(agent, /Campaign Builder/);
  assert.match(agent, /Performance Snapshot/);
  assert.match(agent, /createAgentCampaign/);
  assert.match(agent, /getAgentPerformanceSnapshot/);
  assert.match(agent, /Create campaign/);
  assert.match(agent, /Open Campaign Manager/);
  assert.match(agent, /Build a campaign/);
  assert.match(agent, /Create Post/);
  assert.match(agent, /Caption preview/);
  assert.match(agent, /Creative Studio/);
  assert.match(agent, /Graphic/);
  assert.match(agent, /Photo/);
  assert.match(agent, /Video/);
  assert.match(agent, /createAgentPostDraft/);
  assert.match(agent, /\(campaign\)/);
  assert.match(agent, /performance\|analytics\|growth\|results/);
});

test("My Agent campaign action writes a real Campaign Manager plan", () => {
  assert.match(actions, /from\("campaign_plans"\)/);
  assert.match(actions, /from\("campaign_plan_items"\)/);
  assert.match(actions, /buildCampaignPlan/);
  assert.match(actions, /can_use_campaign_manager/);
  assert.match(actions, /status: "draft"/);
});

test("My Agent performance snapshot is sourced and local-date bounded", () => {
  assert.match(actions, /social_intelligence_snapshots/);
  assert.match(actions, /\.lte\("range_end", data\.localDate\)/);
  assert.match(actions, /changePercent/);
  assert.match(assist, /advisorLocalDate/);
  assert.match(assist, /never describe an analytics range as ending after that date/);
});

test("My Agent composer reserves space above mobile navigation", () => {
  assert.match(agent, /mb-24/);
  assert.match(agent, /100dvh/);
  assert.match(agent, /shrink-0 border-t/);
});


test("My Agent post action saves a real WaveOS content draft", () => {
  assert.match(actions, /createAgentPostDraft/);
  assert.match(actions, /from\("content_items"\)/);
  assert.match(actions, /source: "my_agent"/);
  assert.match(actions, /can_create_content/);
  assert.match(actions, /status: "draft"/);
});
