import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  campaignLaunchBlocker,
  campaignStepCompletion,
  moveListItem,
  orderCampaignMedia,
} from "../../src/lib/campaign-builder-steps.ts";
import {
  activeCaptionCue,
  normalizeVideoRecipe,
  videoRecipeFilter,
  videoRecipeHasEdits,
} from "../../src/lib/video-edit-recipe.ts";

const ready = {
  name: "Spring launch",
  platformCount: 1,
  formatCount: 2,
  selectedMediaCount: 3,
  recommendationCount: 0,
  confirmedCount: 0,
  planSlotCount: 0,
  saved: false,
};

test("campaign steps run Goal, Media, Analyze, Plan, Launch", () => {
  const source = fs.readFileSync("src/lib/campaign-builder-steps.ts", "utf8");
  assert.match(source, /\["Goal", "Media", "Analyze", "Plan", "Launch"\]/);
});

test("a campaign without media cannot be saved", () => {
  assert.equal(
    campaignLaunchBlocker({ ...ready, selectedMediaCount: 0 }),
    "Choose campaign content before saving.",
  );
});

test("analysis is optional, but once run every asset must be confirmed before saving", () => {
  assert.equal(campaignLaunchBlocker(ready), null);
  assert.match(
    campaignLaunchBlocker({ ...ready, recommendationCount: 3, confirmedCount: 2 }),
    /Confirm or correct/,
  );
  assert.equal(campaignLaunchBlocker({ ...ready, recommendationCount: 3, confirmedCount: 3 }), null);
});

test("the Analyze step only counts as done after a real analysis is fully confirmed", () => {
  assert.equal(campaignStepCompletion(ready)[2], false);
  assert.equal(campaignStepCompletion({ ...ready, recommendationCount: 2, confirmedCount: 1 })[2], false);
  assert.equal(campaignStepCompletion({ ...ready, recommendationCount: 2, confirmedCount: 2 })[2], true);
});

test("post sequence follows the edited order, then appends uncovered media once", () => {
  assert.deepEqual(orderCampaignMedia(["a", "b", "c"], ["c", "a"]), ["c", "a", "b"]);
  assert.deepEqual(orderCampaignMedia(["a", "b"], ["x", "b", "b"]), ["b", "a"]);
  assert.deepEqual(moveListItem(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(moveListItem(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
});

test("saved video edits are clamped to the clip and invalid captions are dropped", () => {
  const recipe = normalizeVideoRecipe(
    {
      trimStart: 2,
      trimEnd: 99,
      speed: 7,
      captions: [
        { id: "late", start: 5, end: 6, text: "Second" },
        { id: "bad", start: 4, end: 3, text: "Backwards" },
        { id: "early", start: 1, end: 2, text: "First" },
      ],
    },
    10,
  );
  assert.equal(recipe.trimStart, 2);
  assert.equal(recipe.trimEnd, 10);
  assert.equal(recipe.speed, 1);
  assert.deepEqual(recipe.captions.map((cue) => cue.id), ["early", "late"]);
});

test("captions show only during their time range", () => {
  const cues = [{ id: "a", start: 1, end: 3, text: "Hello" }];
  assert.equal(activeCaptionCue(cues, 0.5), null);
  assert.equal(activeCaptionCue(cues, 2)?.text, "Hello");
  assert.equal(activeCaptionCue(cues, 3), null);
});

test("looks add to the manual adjustments and count as edits", () => {
  const base = normalizeVideoRecipe({}, 10);
  assert.equal(videoRecipeHasEdits(base, 10), false);
  assert.equal(videoRecipeFilter(base), "brightness(100%) contrast(100%) saturate(100%)");
  const mono = { ...base, look: "mono" };
  assert.match(videoRecipeFilter(mono), /grayscale\(1\)/);
  assert.equal(videoRecipeHasEdits(mono, 10), true);
});

test("Video Maker never presents a rendered export and says Create Post uses the original", () => {
  const page = fs.readFileSync("src/routes/_authenticated/video-maker.tsx", "utf8");
  assert.match(page, /Export · not available yet/);
  assert.match(page, /Create Post uses the original clip/);
  assert.match(page, /Live preview · not rendered/);
  assert.doesNotMatch(page, /Download video|Export video<|Render video/);
});

test("Campaign Manager reports transcripts as unavailable instead of faking progress", () => {
  const page = fs.readFileSync("src/routes/_authenticated/campaigns.tsx", "utf8");
  assert.match(page, /Speech transcripts aren't available yet/);
  assert.doesNotMatch(page, /Transcribing/);
});
