import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync("src/lib/wave-assist.functions.ts", "utf8");
const dashboard = readFileSync("src/components/app/ocean-intelligence-dashboard.tsx", "utf8");
const myAgent = readFileSync("src/routes/_authenticated/my-agent.tsx", "utf8");
const agentStorage = readFileSync("src/lib/agent-conversation-storage.ts", "utf8");
const campaign = readFileSync("src/lib/campaign-ideas.functions.ts", "utf8");
const seo = readFileSync("src/lib/seo-growth.functions.ts", "utf8");

test("My Agent is a real contextual advisor with one bounded text and voice conversation", () => {
  assert.match(backend, /"advisor"/);
  assert.match(backend, /conversation:[\s\S]*\.max\(8\)/);
  assert.match(backend, /Never claim an action was completed/);
  assert.match(myAgent, /mode: "advisor"/);
  assert.match(myAgent, /agentConversationStorageKey\(conversationUserId, workspaceId\)/);
  assert.match(agentStorage, /waveos\.assist\.v2/);
  assert.match(myAgent, /sendMessage\(transcript, true\)/);
  assert.match(myAgent, /Text and voice share this thread/);
  assert.match(myAgent, /Turn latest answer into a draft/);
  assert.match(dashboard, /to="\/my-agent"/);
  assert.doesNotMatch(dashboard, /<input[\s\S]*Ask for a decision/);
});

test("active WaveOS text intelligence uses the current premium everyday model", () => {
  for (const source of [backend, campaign, seo]) {
    assert.match(source, /google\/gemini-3\.8-flash/);
    assert.doesNotMatch(source, /gemini-3\.1-flash-lite/);
  }
});

test("premium assistant remains review-only", () => {
  assert.match(myAgent, /suggestions only/);
  assert.match(dashboard, /never publishes or changes records for you/);
  assert.match(backend, /the user must explicitly complete it in WaveOS/);
});
