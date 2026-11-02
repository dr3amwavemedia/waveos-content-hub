import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isUnpublishConfirmation,
  platformSupportsUnpublish,
  publishedAttemptActions,
  readUnpublishedMarker,
  unpublishBlockReason,
  withUnpublishedMarker,
} from "../../src/lib/published-post-management.ts";

test("Zernio-unpublishable platforms are supported, in WaveOS and Zernio spellings", () => {
  for (const platform of [
    "facebook",
    "threads",
    "x",
    "twitter",
    "linkedin",
    "youtube",
    "pinterest",
    "reddit",
    "bluesky",
    "gmb",
    "googlebusiness",
    "telegram",
  ])
    assert.equal(platformSupportsUnpublish(platform), true, platform);
});

test("Instagram, TikTok and Snapchat are not supported", () => {
  for (const platform of ["instagram", "tiktok", "snapchat", "", null, undefined])
    assert.equal(platformSupportsUnpublish(platform), false, String(platform));
});

test("removal requires typing REMOVE exactly", () => {
  assert.equal(isUnpublishConfirmation("REMOVE"), true);
  for (const value of ["remove", "Remove", " REMOVE", "REMOVE ", "", "yes", undefined, null])
    assert.equal(isUnpublishConfirmation(value), false, String(value));
});

test("_waveos marker is read only when it has a valid removal time", () => {
  assert.deepEqual(
    readUnpublishedMarker({
      post: { _id: "p1" },
      _waveos: { unpublishedAt: "2026-11-02T20:00:00.000Z", unpublishedBy: "user-1" },
    }),
    { unpublishedAt: "2026-11-02T20:00:00.000Z", unpublishedBy: "user-1" },
  );
  for (const snapshot of [
    null,
    undefined,
    [],
    "text",
    {},
    { post: { _id: "p1" } },
    { _waveos: null },
    { _waveos: {} },
    { _waveos: { unpublishedAt: "not a date" } },
    { _waveos: { unpublishedAt: 123 } },
  ])
    assert.equal(readUnpublishedMarker(snapshot), null, JSON.stringify(snapshot));
});

test("merging the marker keeps every existing provider field", () => {
  const providerSnapshot = {
    post: { _id: "6ae8f21a", status: "published", platforms: [{ platform: "facebook" }] },
    message: "ok",
  };
  const merged = withUnpublishedMarker(providerSnapshot, {
    unpublishedAt: "2026-11-02T20:00:00.000Z",
    unpublishedBy: "user-1",
    unpublishResponse: { success: true },
  });
  assert.deepEqual(merged.post, providerSnapshot.post);
  assert.equal(merged.message, "ok");
  assert.deepEqual(merged._waveos, {
    unpublishedAt: "2026-11-02T20:00:00.000Z",
    unpublishedBy: "user-1",
    unpublishResponse: { success: true },
  });
  assert.equal(readUnpublishedMarker(merged)?.unpublishedBy, "user-1");
  // The input snapshot is not mutated.
  assert.equal("_waveos" in providerSnapshot, false);
  // Non-object snapshots are kept rather than dropped.
  assert.deepEqual(
    withUnpublishedMarker(["raw"], {
      unpublishedAt: "2026-11-02T20:00:00.000Z",
      unpublishedBy: "u",
      unpublishResponse: null,
    }).providerResponse,
    ["raw"],
  );
});

const attempt = (overrides = {}) => ({
  platform: "facebook",
  provider: "zernio",
  provider_post_id: "6ae8f21ab5b67967df0ebc8a",
  status: "success",
  post_url: "https://www.facebook.com/watch/?v=1462074119406696",
  response_snapshot: { post: { _id: "6ae8f21ab5b67967df0ebc8a" } },
  ...overrides,
});
const removedSnapshot = { post: {}, _waveos: { unpublishedAt: "2026-11-02T20:00:00.000Z" } };

test("live Facebook post offers Open and Remove", () => {
  assert.deepEqual(publishedAttemptActions(attempt()), {
    removed: false,
    removedAt: null,
    canOpen: true,
    canRemove: true,
    removeUnsupported: false,
  });
});

test("Instagram, TikTok and Snapchat offer Open and the remove-on-platform note, never Remove", () => {
  for (const platform of ["instagram", "tiktok", "snapchat"]) {
    const actions = publishedAttemptActions(attempt({ platform }));
    assert.equal(actions.canOpen, true, platform);
    assert.equal(actions.canRemove, false, platform);
    assert.equal(actions.removeUnsupported, true, platform);
  }
});

test("Remove needs a Zernio post reference and a successful publish", () => {
  assert.equal(publishedAttemptActions(attempt({ provider_post_id: null })).canRemove, false);
  assert.equal(publishedAttemptActions(attempt({ provider: "ayrshare" })).canRemove, false);
  assert.equal(publishedAttemptActions(attempt({ status: "failed" })).canRemove, false);
  assert.equal(publishedAttemptActions(attempt({ post_url: null })).canOpen, false);
});

test("a removed post shows as removed with no Open or Remove", () => {
  assert.deepEqual(
    publishedAttemptActions(attempt({ post_url: null, response_snapshot: removedSnapshot })),
    {
      removed: true,
      removedAt: "2026-11-02T20:00:00.000Z",
      canOpen: false,
      canRemove: false,
      removeUnsupported: false,
    },
  );
});

test("server refuses removal that is unsupported, unreferenced, failed or already done", () => {
  assert.equal(unpublishBlockReason(attempt(), "Facebook"), null);
  assert.match(unpublishBlockReason(attempt({ platform: "tiktok" }), "TikTok"), /remove it on TikTok/);
  assert.match(
    unpublishBlockReason(attempt({ provider_post_id: null }), "Facebook"),
    /no Zernio post reference/,
  );
  assert.match(unpublishBlockReason(attempt({ status: "failed" }), "Facebook"), /successfully published/);
  assert.match(
    unpublishBlockReason(attempt({ response_snapshot: removedSnapshot }), "Facebook"),
    /already removed/,
  );
});

test("server checks REMOVE and manager authority before calling Zernio, and never deletes the row", () => {
  const fn = readFileSync("src/lib/publish.functions.ts", "utf8");
  const removal = readFileSync("src/lib/publish-removal.server.ts", "utf8");
  const handler = fn.slice(fn.indexOf("export const unpublishPublishAttempt"));
  const confirm = handler.indexOf("isUnpublishConfirmation(data.confirmation)");
  const manager = handler.indexOf("requireSocialWorkspaceManager(");
  const call = handler.indexOf("unpublishZernioPublishAttempt(");
  assert.ok(confirm > 0 && confirm < manager && manager < call);
  assert.match(removal, /\/unpublish`/);
  assert.match(removal, /platform: toZernioPlatform\(attempt\.platform\)/);
  assert.match(removal, /post_url: null/);
  assert.match(removal, /action: "content_unpublished"/);
  assert.doesNotMatch(removal, /\.delete\(/);
  // The marker is only written after the provider call succeeds.
  assert.ok(removal.indexOf("/unpublish`") < removal.indexOf("withUnpublishedMarker(attempt"));
});

test("publishing keeps the same-item success skip and unchanged Idempotency-Key", () => {
  const source = readFileSync("src/lib/zernio-publish.server.ts", "utf8");
  assert.match(source, /const idempotencyKey = `\$\{contentId\}:\$\{variant\.platform\}`;/);
  assert.doesNotMatch(source, /allowDuplicate|fingerprint/i);
});
