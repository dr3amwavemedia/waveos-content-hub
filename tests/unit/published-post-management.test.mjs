import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  findDuplicatePublishes,
  publishFingerprint,
} from "../../src/lib/publish-fingerprint.ts";
import {
  isUnpublishConfirmation,
  platformSupportsUnpublish,
  publishedAttemptActions,
  snapshotAccountIds,
  unpublishBlockReason,
} from "../../src/lib/published-post-management.ts";
import { failureGuidance } from "../../src/lib/publish-failure-guidance.ts";

const base = {
  workspaceId: "2eef6b9d-332e-46ed-a26a-22976b5c2ca7",
  platform: "facebook",
  accountIds: ["acc-b", "acc-a"],
  caption: "Brand story",
  mediaAssetIds: ["media-1", "media-2"],
  contentType: null,
};

test("fingerprint is stable and ignores account order", async () => {
  const first = await publishFingerprint(base);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(await publishFingerprint({ ...base }), first);
  assert.equal(await publishFingerprint({ ...base, accountIds: ["acc-a", "acc-b"] }), first);
});

test("different account, media, caption, platform or format change the fingerprint", async () => {
  const original = await publishFingerprint(base);
  for (const change of [
    { accountIds: ["acc-c"] },
    { mediaAssetIds: ["media-3"] },
    { caption: "Brand story!" },
    { platform: "instagram" },
    { contentType: "story" },
    { workspaceId: "other" },
  ]) {
    assert.notEqual(await publishFingerprint({ ...base, ...change }), original, JSON.stringify(change));
  }
});

const now = Date.parse("2026-11-02T20:00:00Z");
const prior = (overrides = {}) => ({
  id: "attempt-prior",
  content_item_id: "content-other",
  platform: "facebook",
  status: "success",
  attempted_at: "2026-11-02T10:00:00Z",
  post_url: "https://www.facebook.com/watch/?v=1",
  unpublished_at: null,
  fingerprint: "fp",
  ...overrides,
});
const check = (rows, extra = {}) =>
  findDuplicatePublishes({
    contentItemId: "content-new",
    prepared: [{ platform: "facebook", fingerprint: "fp" }],
    prior: rows,
    now,
    ...extra,
  });

test("a different post that published the same content in 24 hours is blocked", () => {
  assert.deepEqual(check([prior()]), [
    {
      platform: "facebook",
      existingAttemptId: "attempt-prior",
      attemptedAt: "2026-11-02T10:00:00Z",
      postUrl: "https://www.facebook.com/watch/?v=1",
    },
  ]);
});

test("explicit allowDuplicate publishes another copy", () => {
  assert.deepEqual(check([prior()], { allowDuplicate: true }), []);
});

test("duplicate guard never blocks a retry of the same post", () => {
  assert.deepEqual(check([prior({ content_item_id: "content-new" })]), []);
});

test("duplicate guard ignores removed, failed, older and changed posts", () => {
  assert.deepEqual(check([prior({ unpublished_at: "2026-11-02T11:00:00Z" })]), []);
  assert.deepEqual(check([prior({ status: "failed" })]), []);
  assert.deepEqual(check([prior({ attempted_at: "2026-11-01T19:59:00Z" })]), []);
  assert.deepEqual(check([prior({ fingerprint: "other-account-or-caption" })]), []);
  assert.deepEqual(check([prior({ platform: "instagram" })]), []);
});

test("Facebook and other Zernio-deletable networks support removal; Instagram, TikTok and Snapchat do not", () => {
  for (const platform of ["facebook", "threads", "x", "linkedin", "youtube", "pinterest", "bluesky", "gmb"])
    assert.equal(platformSupportsUnpublish(platform), true, platform);
  for (const platform of ["instagram", "tiktok", "snapchat"])
    assert.equal(platformSupportsUnpublish(platform), false, platform);
});

const attempt = (overrides = {}) => ({
  platform: "facebook",
  provider: "zernio",
  provider_post_id: "6ae8f21ab5b67967df0ebc8a",
  status: "success",
  post_url: "https://www.facebook.com/watch/?v=1462074119406696",
  unpublished_at: null,
  ...overrides,
});

test("removal requires typing REMOVE exactly", () => {
  assert.equal(isUnpublishConfirmation("REMOVE"), true);
  for (const value of ["remove", " REMOVE", "", undefined, "yes"])
    assert.equal(isUnpublishConfirmation(value), false, String(value));
});

test("server only removes live Zernio posts on supported networks", () => {
  assert.equal(unpublishBlockReason(attempt(), "Facebook"), null);
  assert.match(unpublishBlockReason(attempt({ platform: "instagram" }), "Instagram"), /remove it there/);
  assert.match(unpublishBlockReason(attempt({ provider_post_id: null }), "Facebook"), /no Zernio post reference/);
  assert.match(unpublishBlockReason(attempt({ status: "failed" }), "Facebook"), /successfully published/);
  assert.match(unpublishBlockReason(attempt({ unpublished_at: "2026-11-02T20:00:00Z" }), "Facebook"), /already removed/);
});

test("dialog offers open + remove for live Facebook, open only for Instagram, nothing live after removal", () => {
  assert.deepEqual(publishedAttemptActions(attempt()), {
    removed: false,
    canOpen: true,
    canRemove: true,
    removeUnsupported: false,
  });
  assert.deepEqual(publishedAttemptActions(attempt({ platform: "instagram" })), {
    removed: false,
    canOpen: true,
    canRemove: false,
    removeUnsupported: true,
  });
  assert.deepEqual(publishedAttemptActions(attempt({ unpublished_at: "2026-11-02T20:00:00Z" })), {
    removed: true,
    canOpen: false,
    canRemove: false,
    removeUnsupported: false,
  });
  assert.equal(publishedAttemptActions(attempt({ provider_post_id: null })).canRemove, false);
  assert.equal(publishedAttemptActions(attempt({ status: "failed" })).canRemove, false);
});

test("multi-account requests are detected from the stored provider request", () => {
  const snapshot = {
    platforms: [
      { platform: "facebook", accountId: "a" },
      { platform: "facebook", accountId: "b" },
    ],
    waveosFingerprint: "fp",
  };
  assert.deepEqual(snapshotAccountIds(snapshot, "facebook"), ["a", "b"]);
  assert.deepEqual(snapshotAccountIds(null, "facebook"), []);
});

test("a held duplicate explains how to publish another copy on purpose", () => {
  assert.match(failureGuidance("held", "Facebook", { errorCode: "duplicate_guard" }), /Publish another copy/);
});

test("duplicate guard runs before the content item is claimed and keeps the idempotency key", () => {
  const source = readFileSync("src/lib/zernio-publish.server.ts", "utf8");
  const guard = source.indexOf("const duplicateGuard = await checkDuplicatePublishes(");
  const claim = source.indexOf('.update({ status: "publishing" })');
  const post = source.indexOf('zernioRequest<{ post?: ZernioPost }>("/posts", {');
  assert.ok(guard > 0 && guard < claim && claim < post);
  assert.match(source, /const idempotencyKey = `\$\{contentId\}:\$\{variant\.platform\}`;/);
  assert.match(source, /waveosFingerprint: fingerprints\[index\]/);
  assert.match(source, /\/unpublish`/);
});
