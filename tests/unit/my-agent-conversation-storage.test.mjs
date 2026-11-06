import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const agent = fs.readFileSync("src/routes/_authenticated/my-agent.tsx", "utf8");

test("My Agent retains a useful in-session conversation history", () => {
  assert.match(agent, /\.slice\(-40\)/);
  assert.match(agent, /sessionStorage\.getItem\(storageKey\)/);
});

test("My Agent does not overwrite saved chat before workspace hydration", () => {
  assert.match(agent, /loadedConversationKey === storageKey/);
  assert.match(agent, /setLoadedConversationKey\(storageKey\)/);
  assert.match(agent, /\[messages, storageKey, loadedConversationKey\]/);
});

test("My Agent clears displayed conversation when there is no workspace", () => {
  assert.match(agent, /if \(!storageKey\) \{\s*setMessages\(\[\]\);\s*setLoadedConversationKey\(null\);/);
});

test("Conversation storage uses authenticated user and workspace isolation", () => {
  const utility = fs.readFileSync("src/lib/agent-conversation-storage.ts", "utf8");
  assert.match(utility, /if \(!userId \|\| !workspaceId\) return null/);
  assert.match(utility, /waveos\.assist\.v2/);
  assert.match(utility, /MAX_MESSAGES = 40/);
  assert.match(utility, /MAX_MESSAGE_LENGTH = 12000/);
});
