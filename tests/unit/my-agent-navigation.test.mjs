import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("src/components/app/app-shell.tsx", "utf8");
const route = readFileSync("src/routes/_authenticated/my-agent.tsx", "utf8");
const server = readFileSync("src/server.ts", "utf8");

test("My Agent is a dedicated feature-gated destination", () => {
  assert.match(shell, /to: "\/my-agent", label: "My Agent"/);
  assert.match(shell, /feature: "can_use_ai_tools"/);
  assert.match(route, /createFileRoute\("\/_authenticated\/my-agent"\)/);
  assert.match(route, /feature="can_use_ai_tools"/);
  assert.doesNotMatch(route, />AI Agent</);
});

test("voice and text use the same message sender and browser thread", () => {
  assert.match(route, /sendMessage\(transcript, true\)/);
  assert.match(route, /sendMessage\(draft\)/);
  assert.match(route, /sessionStorage\.setItem\(storageKey/);
  assert.match(route, /conversation: prior/);
  assert.match(server, /microphone=\(self\)/);
});
