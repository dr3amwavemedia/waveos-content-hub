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
  const page = [fs.readFileSync("src/routes/_authenticated/video-maker.tsx", "utf8"), ...fs.readdirSync("src/components/video-maker").map((f) => fs.readFileSync(`src/components/video-maker/${f}`, "utf8"))].join("\n");
  assert.match(page, /Export · not available yet/);
  assert.match(page, /Create Post uses the original clip/);
  assert.match(page, /Live preview · not rendered/);
  assert.doesNotMatch(page, /Download video|Export video<|Render video/);
});

test("Campaign Manager says when a video had no transcript instead of implying one", () => {
  const page = [fs.readFileSync("src/routes/_authenticated/campaigns.tsx", "utf8"), ...fs.readdirSync("src/components/campaign").map((f) => fs.readFileSync(`src/components/campaign/${f}`, "utf8"))].join("\n");
  assert.match(page, /no transcript — spoken words were not analyzed/);
});

import {
  captionCuesFromSegments,
  effectiveTranscript,
  effectiveKeyMoments,
  encodeWav,
  groundKeyMoments,
  parseWav,
  planSpeechChunks,
  transcriptExcerptForAi,
} from "../../src/lib/transcript-audio.ts";

function tone(seconds, amplitude) {
  return Array.from({ length: Math.round(seconds * 16000) }, (_, i) => Math.round(amplitude * Math.sin(i / 8)));
}

test("speech sections keep real audio positions and silent stretches are never transcribed", () => {
  const samples = Int16Array.from([...tone(5, 9000), ...tone(1, 0), ...tone(5, 9000), ...tone(3, 0)]);
  const chunks = planSpeechChunks(samples, 16000);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].start, 0);
  assert.ok(Math.abs(chunks[chunks.length - 1].end - 14) < 0.06);
  assert.ok(chunks.slice(0, -1).every((chunk) => !chunk.silent));
  const silence = planSpeechChunks(Int16Array.from(tone(6, 0)), 16000);
  assert.ok(silence.every((chunk) => chunk.silent));
});

test("WAV audio round-trips and non-PCM input is rejected", () => {
  const wav = encodeWav(Int16Array.from([1, -2, 3]), 16000);
  const info = parseWav(wav);
  assert.equal(info.sampleRate, 16000);
  assert.equal(info.channels, 1);
  assert.equal(info.dataLength, 6);
  assert.equal(parseWav(new Uint8Array(60)), null);
});

const row = {
  status: "completed",
  transcript_text: "Welcome in. Book this week.",
  segments: [{ start: 0, end: 4, text: "Welcome in." }, { start: 4, end: 8, text: "Book this week." }],
  has_timestamps: true,
  key_moments: [],
  edited_text: null,
  edited_segments: null,
  edited_at: null,
};

test("a user's transcript correction is used ahead of the machine transcript", () => {
  assert.equal(effectiveTranscript(row).evidence, "speech_to_text_transcript");
  const edited = { ...row, edited_at: "2026-11-04T00:00:00Z", edited_segments: [{ start: 0, end: 4, text: "Welcome to Dream Wave." }, { start: 4, end: 8, text: "Book this week." }] };
  const view = transcriptExcerptForAi(edited);
  assert.equal(view.evidence, "user_corrected_transcript");
  assert.match(view.excerpt, /\[0:00\] Welcome to Dream Wave\./);
});

test("unfinished transcripts never reach AI prompts", () => {
  assert.equal(transcriptExcerptForAi({ ...row, status: "processing" }), null);
  assert.equal(transcriptExcerptForAi({ ...row, status: "failed" }), null);
});

test("key moments must point at a real transcript section", () => {
  const moments = groundKeyMoments([{ index: 1, label: "Call to action" }, { index: 7, label: "Invented" }, { index: 1, label: "Duplicate" }], row.segments);
  assert.equal(moments.length, 1);
  assert.equal(moments[0].quote, "Book this week.");
  assert.equal(moments[0].start, 4);
});

test("transcript captions stay inside the trimmed part of the clip", () => {
  const cues = captionCuesFromSegments(row.segments, 4, 8);
  assert.ok(cues.length > 0);
  assert.ok(cues.every((cue) => cue.start >= 4 && cue.end <= 8));
});

test("continuous audible speech is not discarded as silence", () => {
  const chunks = planSpeechChunks(Int16Array.from(tone(10, 9000)), 16000);
  assert.equal(chunks.length > 0, true);
  assert.equal(chunks.every((chunk) => !chunk.silent), true);
});

test("malformed WAV format chunks fail safely instead of throwing", () => {
  const wav = encodeWav(Int16Array.from([1, 2, 3]));
  const truncated = wav.slice(0, 23);
  assert.equal(parseWav(truncated), null);
  new DataView(wav.buffer).setUint32(16, 2, true);
  assert.equal(parseWav(wav), null);
});

test("key-moment quotes reflect saved corrections and exclude invalid indices", () => {
  const edited = { ...row, edited_at: "2026-11-06T22:00:00Z", edited_text: "Corrected offer", edited_segments: [{ start: 0, end: 4, text: "Corrected offer" }, { start: 4, end: 8, text: "" }], key_moments: [{ segmentIndex: 0, start: 777, quote: "obsolete", label: "Offer" }, { segmentIndex: 8, label: "Invalid" }] };
  assert.deepEqual(effectiveKeyMoments(edited), [{ segmentIndex: 0, start: 0, end: 4, quote: "Corrected offer", label: "Offer" }]);
  assert.equal(transcriptExcerptForAi(edited).keyMoments[0].quote, "Corrected offer");
});
