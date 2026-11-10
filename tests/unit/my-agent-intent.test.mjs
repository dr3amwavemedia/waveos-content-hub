import assert from "node:assert/strict";
import test from "node:test";

import { campaignIntent } from "../../src/lib/my-agent-intent.ts";

test("existing campaign repair language never starts a new campaign", () => {
  for (const prompt of [
    "Check my previous campaign and fix it",
    "Make my last campaign better",
    "Review the campaign we created",
    "Improve my current campaign",
    "Continue that campaign",
  ]) {
    assert.equal(campaignIntent(prompt), "review_existing", prompt);
  }
});

test("only explicit creation language starts the new campaign builder", () => {
  assert.equal(campaignIntent("Create a new campaign"), "create_new");
  assert.equal(campaignIntent("Build me a social media campaign"), "create_new");
  assert.equal(campaignIntent("How are my campaigns doing?"), null);
  assert.equal(campaignIntent("Make this caption shorter"), null);
});
