import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const assist = fs.readFileSync("src/lib/wave-assist.functions.ts", "utf8");
const campaign = fs.readFileSync("src/components/campaign/use-campaign-manager.ts", "utf8");
const indicator = fs.readFileSync("src/components/app/ai-processing-indicator.tsx", "utf8");

test("caption suites receive bounded selected-media evidence", () => {
  assert.match(assist, /Authorized selected media context/);
  assert.match(assist, /filename: asset\.name/);
  assert.match(assist, /transcript: transcriptMap\.get\(asset\.id\)/);
  assert.doesNotMatch(assist, /selectedMedia: \(relevantMedia \?\? \[\]\)\.map\(\(asset\) => \(\{ \.\.\.asset/);
});

test("bulk campaign captions use each clip and continue after a failed item", () => {
  assert.match(campaign, /Post\/clip title:/);
  assert.match(campaign, /mediaAssetIds: item\.media_asset_ids \?\? \[\]/);
  assert.match(campaign, /Captions already used in this campaign/);
  assert.match(campaign, /failed \+= 1/);
});

test("the shared AI indicator is an accessible circular surfer animation", () => {
  assert.match(indicator, /role="status"/);
  assert.match(indicator, /aria-live="polite"/);
  assert.match(indicator, /rounded-full/);
  assert.match(indicator, /🏄/);
  assert.match(indicator, /motion-safe:animate-spin/);
});
