import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractContentLeadSignals,
  formatAnalyticsPlatform,
  mergeContentLeadSignals,
  parseAnalyticsPayload,
} from "../../src/lib/analytics-transparency.ts";

const range = { requestedRangeStart: "2026-10-01", requestedRangeEnd: "2026-10-31" };

test("post analytics expose clicks and messages without turning missing fields into zero", () => {
  const payload = {
    posts: [
      {
        postId: "post-1",
        platform: "instagram",
        caption: "Book your fall session",
        publishedAt: "2026-10-12T12:00:00Z",
        analytics: { linkClicks: 14, conversationStarts: 3 },
      },
      { postId: "post-2", platform: "facebook", analytics: { views: 50 } },
    ],
  };
  const source = parseAnalyticsPayload({ ...range, key: "organic", payload });
  assert.equal(source.metrics.clicks.value, 14);
  assert.equal(source.metrics.messages.value, 3);
  assert.deepEqual(extractContentLeadSignals(payload, "organic"), [
    {
      contentId: "post-1",
      title: "Book your fall session",
      platform: "instagram",
      publishedAt: "2026-10-12T12:00:00Z",
      clicks: 14,
      messages: 3,
      source: "organic",
    },
  ]);
});

test("duplicate provider records use the largest rollup instead of double counting", () => {
  const merged = mergeContentLeadSignals([
    {
      contentId: "post-1",
      title: "Post",
      platform: "Instagram",
      publishedAt: null,
      clicks: 10,
      messages: null,
      source: "organic",
    },
    {
      contentId: "post-1",
      title: "Post",
      platform: "instagram",
      publishedAt: "2026-10-12",
      clicks: 10,
      messages: 2,
      source: "external",
    },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].clicks, 10);
  assert.equal(merged[0].messages, 2);
});

test("provider content and nested platform metadata identify attributed posts", () => {
  const [signal] = extractContentLeadSignals(
    {
      posts: [
        {
          postId: "post-2",
          content: "Behind the scenes at today’s brand shoot",
          platforms: [{ platform: "youtube" }],
          publishedAt: "2026-11-02T12:00:00Z",
          analytics: { linkClicks: 7 },
        },
      ],
    },
    "organic",
  );
  assert.equal(signal.title, "Behind the scenes at today’s brand shoot");
  assert.equal(signal.platform, "youtube");
});

test("source-only posts get truthful dated titles and branded platform casing", () => {
  const [signal] = extractContentLeadSignals(
    {
      posts: [
        {
          postId: "post-3",
          platform: "facebook",
          publishedAt: "2026-11-02T12:00:00Z",
          analytics: { linkClicks: 1 },
        },
      ],
    },
    "organic",
  );
  assert.equal(signal.title, "Facebook post from 2026-11-02");
  assert.equal(formatAnalyticsPlatform("linkedin"), "LinkedIn");
  assert.equal(formatAnalyticsPlatform("youtube"), "YouTube");
});
