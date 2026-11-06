import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/lib/my-agent-conversation.functions.ts", "utf8");

test("cloud history is authenticated and user-scoped", () => {
  assert.match(source, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(source, /verifyWorkspaceAccess\(supabase, userId, data\.workspaceId\)/);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /user_id: userId/);
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE/);
});

test("cloud history is bounded and never trusts user IDs from request input", () => {
  assert.match(source, /messages: z\.array\(messageSchema\)\.max\(40\)/);
  assert.match(source, /content: z\.string\(\)\.min\(1\)\.max\(12000\)/);
  assert.doesNotMatch(source, /userId: z\./);
});

test("cloud history endpoints are not activated in the UI before migration", () => {
  const route = fs.readFileSync("src/routes/_authenticated/my-agent.tsx", "utf8");
  assert.doesNotMatch(route, /loadAgentConversation|saveAgentConversation/);
});
