import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20261102225954_mac_handoff_ai_campaign_health.sql",
  "utf8",
);
const health = fs.readFileSync("src/lib/operational-health.functions.ts", "utf8");
const campaign = fs.readFileSync("src/routes/_authenticated/campaigns.tsx", "utf8");
const studio = fs.readFileSync("src/routes/_authenticated/creative-studio.tsx", "utf8");
const videoMaker = fs.readFileSync("src/routes/_authenticated/video-maker.tsx", "utf8");
const aiUsage = fs.readFileSync("src/lib/ai-usage.server.ts", "utf8");
const agent = fs.readFileSync("src/lib/wave-assist.functions.ts", "utf8");
const analytics = fs.readFileSync("src/lib/zernio.functions.ts", "utf8");

test("AI telemetry is server-only and contains no prompt or generated-content columns", () => {
  assert.match(migration, /ALTER TABLE public\.ai_usage_events ENABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.ai_usage_events FROM PUBLIC, anon, authenticated/,
  );
  assert.match(migration, /GRANT ALL ON TABLE public\.ai_usage_events TO service_role/);
  assert.doesNotMatch(migration, /prompt text|generated_content|response_payload/i);
  assert.match(aiUsage, /Telemetry must never turn a successful customer action into a failure/);
});

test("campaign behavior stays approval-first while exposing explicit optimization intent", () => {
  assert.match(migration, /DEFAULT 'approval_required'/);
  assert.match(migration, /'automatic', 'approval_required'/);
  assert.match(campaign, /Confirm understanding/);
  assert.match(campaign, /Corrections stay private to this workspace/);
  assert.match(campaign, /Published posts are never altered/);
  assert.match(campaign, /optimization_mode: input\.optimizationMode/);
  assert.match(campaign, /Campaign content/);
  assert.match(campaign, /contentFormats: \["feed", "story"\]/);
  assert.match(campaign, /Use both to balance lasting feed content/);
});

test("analytics exposes six- and twelve-month windows and My Agent stays evidence-first", () => {
  assert.match(analytics, /z\.literal\(180\)/);
  assert.match(analytics, /z\.literal\(365\)/);
  assert.match(agent, /social_intelligence_snapshots/);
  assert.match(agent, /Missing and unavailable are not zero/);
  assert.match(agent, /never shame low results/);
  assert.match(agent, /Compare only equal-length periods/);
});

test("admin health is owner-gated and reports AI plus analytics without secrets", () => {
  assert.match(health, /eq\("role", "dream_wave_owner"\)/);
  assert.match(health, /ai_usage_events/);
  assert.match(health, /telemetryAvailable/);
  assert.match(health, /LOVABLE_API_KEY/);
  assert.match(health, /social_intelligence_profiles/);
  assert.doesNotMatch(health, /access_token_encrypted|refresh_token_encrypted|api_key|secret_key/);
  assert.doesNotMatch(health, /expired connections/);
});

test("Creative Studio mobile landing has only the three requested primary choices", () => {
  const landing = studio.slice(
    studio.indexOf('aria-label="Creative Studio tools"'),
    studio.indexOf("{workflowDraft.data?.payload"),
  );
  assert.match(landing, /Graphic Design/);
  assert.match(landing, /Photo Editor/);
  assert.match(landing, /Video Editor/);
  assert.match(landing, /navigate\(\{ to: "\/video-maker" \}\)/);
  assert.doesNotMatch(landing, /Resize Content|Brand Template/);
  assert.match(videoMaker, /Choose a video to begin/);
  assert.match(videoMaker, /getMediaPreviewUrl/);
  assert.match(videoMaker, /to: "\/create"/);
  assert.match(videoMaker, /Choose a clip/);
  assert.match(videoMaker, /Continue to Story/);
  assert.match(videoMaker, /Continue to Feed/);
  assert.match(videoMaker, /Preview unavailable/);
  assert.match(videoMaker, /\.catch\(\(\) =>/);
});
