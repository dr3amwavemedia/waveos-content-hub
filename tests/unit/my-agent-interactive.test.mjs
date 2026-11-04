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


test("Video Maker has an automatic local playback fallback", () => {
  const videoMaker = fs.readFileSync("src/routes/_authenticated/video-maker.tsx", "utf8");
  assert.match(videoMaker, /prepareLocalPreview/);
  assert.match(videoMaker, /URL\.createObjectURL/);
  assert.match(videoMaker, /Prepare local preview/);
  assert.match(videoMaker, /temporary on-device preview/);
});


test("Campaign Manager keeps media compact and saved campaigns tappable", () => {
  const campaigns = fs.readFileSync("src/routes/_authenticated/campaigns.tsx", "utf8");
  assert.match(campaigns, /Campaign content/);
  assert.match(campaigns, /mediaSectionOpen/);
  assert.match(campaigns, /ChevronDown/);
  assert.match(campaigns, /Tap to open/);
  assert.match(campaigns, /campaign-command-detail/);
  assert.match(campaigns, /max-h-\[28rem\]/);
});


test("Campaign persistence never deletes a saved plan just because content linking fails", () => {
  const campaigns = fs.readFileSync("src/routes/_authenticated/campaigns.tsx", "utf8");
  assert.match(campaigns, /Campaign saved, but its content could not be linked yet/);
  assert.match(campaigns, /Your campaigns were not deleted/);
  assert.match(campaigns, /optimization_mode\|schema cache\|column/);
  assert.match(actions, /contentLinked/);
  assert.doesNotMatch(actions, /linked campaign content insert failed[\s\S]{0,400}\.delete\(\)/);
});


test("Campaign drafts keep briefs internal, restore platforms, and appear on Calendar", () => {
  const campaigns = fs.readFileSync("src/routes/_authenticated/campaigns.tsx", "utf8");
  const createPost = fs.readFileSync("src/routes/_authenticated/create.tsx", "utf8");
  const calendar = fs.readFileSync("src/routes/_authenticated/calendar.tsx", "utf8");
  assert.match(campaigns, /campaignBrief: plannedItem\?\.copyBrief/);
  assert.match(campaigns, /primary_caption: null/);
  assert.match(campaigns, /Generate missing captions/);
  assert.match(campaigns, /post_variants/);
  assert.match(createPost, /needsCampaignCaption/);
  assert.match(createPost, /metadata\.campaignBrief/);
  assert.match(createPost, /metadata\.platform/);
  assert.match(calendar, /plannedDate\(it\)/);
  assert.match(calendar, /Planned/);
  assert.match(calendar, /campaign-planned drafts/);
});


test("Video Maker exposes real non-destructive editing controls", () => {
  const videoMaker = fs.readFileSync("src/routes/_authenticated/video-maker.tsx", "utf8");
  assert.match(videoMaker, /"Trim"/);
  assert.match(videoMaker, /Size & framing/);
  assert.match(videoMaker, /Brightness/);
  assert.match(videoMaker, /"Text"/);
  assert.match(videoMaker, /Save changes/);
  assert.match(videoMaker, /video_maker_edit/);
  assert.match(videoMaker, /Continue to Story/);
  assert.match(videoMaker, /Continue to Feed/);
});


test("Campaign Manager exposes captions as part of the campaign workspace", () => {
  const campaigns = fs.readFileSync("src/routes/_authenticated/campaigns.tsx", "utf8");
  assert.match(campaigns, /Campaign captions/);
  assert.match(campaigns, /Generate caption/);
  assert.match(campaigns, /Rewrite/);
  assert.match(campaigns, /Save caption/);
  assert.match(campaigns, /Open full post/);
});

test("Video Maker uses mobile-friendly controls instead of raw timing fields", () => {
  const videoMaker = fs.readFileSync("src/routes/_authenticated/video-maker.tsx", "utf8");
  assert.match(videoMaker, /Reel \/ Story/);
  assert.match(videoMaker, /Show full video/);
  assert.match(videoMaker, /Fill screen/);
  assert.match(videoMaker, /Save changes/);
  assert.match(videoMaker, /selected/);
  assert.doesNotMatch(videoMaker, /type="number" min=\{0\} max=\{recipe\.trimEnd/);
});


test("My Agent and Campaign Manager share reusable media intelligence", () => {
  const assist = fs.readFileSync("src/lib/wave-assist.functions.ts", "utf8");
  const campaignIdeas = fs.readFileSync("src/lib/campaign-ideas.functions.ts", "utf8");
  assert.match(assist, /mediaLibraryUnderstanding/);
  assert.match(assist, /waveos_campaign_intelligence/);
  assert.match(assist, /waveos_campaign_correction/);
  assert.match(assist, /Treat user-corrected media understanding as authoritative/);
  assert.match(assist, /metadata-only understanding is an inference/);
  assert.match(campaignIdeas, /filename\/title, tags, media type, duration\/dimensions/);
  assert.match(campaignIdeas, /photo previews, and sampled video frames/);
  assert.match(campaignIdeas, /Treat a user correction as authoritative/);
});
