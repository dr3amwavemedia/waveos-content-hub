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


test("My Agent connects the remaining intelligence and workflow tools", () => {
  assert.match(agent, /Trending Now/);
  assert.match(agent, /Competitive Intelligence/);
  assert.match(agent, /SEO Growth/);
  assert.match(agent, /Schedule & Publish Review/);
  assert.match(agent, /Browse library/);
  assert.match(agent, /discoverTrends/);
  assert.match(agent, /researchCompetitor/);
  assert.match(agent, /analyzeSeoGrowth/);
  assert.match(agent, /Turn opportunity into a post/);
  assert.match(agent, /Adapt/);
  assert.match(agent, /publishing stays review-first/);
});


test("Campaign Builder keeps typed corrections inside the active tool", () => {
  assert.match(agent, /applyCampaignConversationInput/);
  assert.match(agent, /\(\\d\{1,2\}\)\\s\*\(\?:post\|posts\)/);
  assert.match(agent, /durationMatch/);
  assert.match(agent, /mentionedPlatforms/);
  assert.match(agent, /activeTool === "campaign" && applyCampaignConversationInput\(input\)/);
});


test("My Agent media flow exposes all connected and device media sources", () => {
  assert.match(agent, /MediaPicker/);
  assert.match(agent, /Google Drive/);
  assert.match(agent, /Dropbox/);
  assert.match(agent, /Files/);
  assert.match(agent, /Camera Roll \/ Photos/);
  assert.match(agent, /Pick media/);
});

test("Shared media picker separates Files from Camera Roll and keeps cloud providers", () => {
  const createPost = fs.readFileSync("src/routes/_authenticated/create.tsx", "utf8");
  assert.match(createPost, /Google Drive/);
  assert.match(createPost, /Dropbox/);
  assert.match(createPost, /Camera roll \/ Photos/);
  assert.match(createPost, /"Files"/);
  assert.match(createPost, /startExternalMediaConnection/);
});


test("My Agent campaign save uses an authorized server write and schema fallback", () => {
  assert.match(actions, /supabaseAdmin/);
  assert.match(actions, /campaign_plans/);
  assert.match(actions, /optimization_mode/);
  assert.match(actions, /legacyPayload/);
  assert.match(actions, /campaign_plan_items/);
});


test("campaign builders require content selection and persist linked drafts", () => {
  const campaigns = fs.readFileSync("src/routes/_authenticated/campaigns.tsx", "utf8");
  assert.match(agent, /Choose campaign content/);
  assert.match(agent, /Use this entire folder/);
  assert.match(agent, /Pick individual media/);
  assert.match(agent, /mediaAssetIds: campaignMediaIds/);
  assert.match(actions, /linkedDraftRows/);
  assert.match(actions, /campaignPlanId/);
  assert.match(actions, /mediaFolderId/);
  assert.match(campaigns, /Choose campaign content before saving/);
  assert.match(campaigns, /Use this entire folder/);
  assert.match(campaigns, /campaignPlanId/);
  assert.match(campaigns, /media_asset_ids: \[asset\.id\]/);
});


test("My Agent does not treat campaign status questions as new campaign creation", () => {
  assert.match(agent, /\(create\|build\|start\|make\|new\)/);
  assert.doesNotMatch(agent, /\(create\|build\|start\|make\|new\|plan\)/);
});

test("Campaign Manager continues after save with a working command center", () => {
  const campaigns = fs.readFileSync("src/routes/_authenticated/campaigns.tsx", "utf8");
  assert.match(campaigns, /Campaign command center/);
  assert.match(campaigns, /Continue building/);
  assert.match(campaigns, /campaign-linked-content/);
  assert.match(campaigns, /Draft/);
  assert.match(campaigns, /Review/);
  assert.match(campaigns, /Scheduled/);
  assert.match(campaigns, /Published/);
  assert.match(campaigns, /Continue below in the campaign workspace/);
  assert.doesNotMatch(campaigns, /contentFormats: input\.contentFormats/);
});
