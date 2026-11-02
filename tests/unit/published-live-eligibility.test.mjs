import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyProviderVetoes,
  applyWaveosHistory,
  finalizePublishedLibrary,
  livePostRemoval,
  mergeLivePosts,
  normalizeAnalyticsPosts,
  normalizeSyncedPosts,
  normalizeZernioPosts,
  providerTargetState,
  providerVetoes,
  publishedCardState,
  publishedCounts,
} from "../../src/lib/live-posts.ts";

const tiktok = { accountId: "6abfcaf9665054e093c08704", platform: "tiktok", name: "Organic Skin & Body Medical" };
const fb = { accountId: "acc-fb", platform: "facebook", name: "Organic Skin" };

/** Same pipeline as the server: normalize, merge, history, vetoes, final filter. */
function library(account, { zernio, analytics, synced, attempts = [] }) {
  const lists = [];
  const vetoes = [];
  if (synced) { lists.push(normalizeSyncedPosts(synced, account)); vetoes.push(...providerVetoes(synced, account, "synced")); }
  if (zernio) { lists.push(normalizeZernioPosts(zernio, account)); vetoes.push(...providerVetoes(zernio, account, "zernio")); }
  if (analytics) { lists.push(normalizeAnalyticsPosts(analytics, account)); vetoes.push(...providerVetoes(analytics, account, "analytics")); }
  return finalizePublishedLibrary(applyProviderVetoes(applyWaveosHistory(mergeLivePosts(...lists), attempts), vetoes));
}

const target = (status, extra = {}) => ({ platform: "facebook", accountId: "acc-fb", status, ...extra });
const zernioWith = (...platforms) => ({ posts: [{ _id: "z1", status: "published", content: "c", platforms }] });

test("failed-only target is excluded", () => {
  assert.equal(library(fb, { zernio: zernioWith(target("failed", { platformPostId: "1" })) }).length, 0);
});

test("timeout-only WaveOS attempt with no provider copy creates no card", () => {
  const attempts = [{ platform: "facebook", provider_post_id: null, post_url: null, unpublished_at: null, request_snapshot: { platforms: [{ platform: "facebook", accountId: "acc-fb" }] } }];
  assert.equal(library(fb, { zernio: { posts: [] }, analytics: { posts: [] }, attempts }).length, 0);
});

test("scheduled, pending, publishing, draft and unknown targets are excluded", () => {
  for (const status of ["scheduled", "pending", "publishing", "draft", "processing", undefined]) {
    assert.equal(library(fb, { zernio: zernioWith(target(status, { platformPostId: "1" })) }).length, 0, String(status));
    assert.equal(
      normalizeAnalyticsPosts({ posts: [{ latePostId: "z1", platforms: [target(status, { platformPostId: "1" })] }] }, fb).length,
      0,
      String(status),
    );
  }
});

test("cancelled or deleted targets and parents are excluded", () => {
  assert.equal(library(fb, { zernio: zernioWith(target("cancelled", { platformPostId: "1" })) }).length, 0);
  assert.equal(library(fb, { zernio: { posts: [{ _id: "z1", status: "cancelled", platforms: [target("published", { platformPostId: "1" })] }] } }).length, 0);
  assert.equal(library(fb, { zernio: zernioWith(target("published", { platformPostId: "1", deletedAt: "2026-11-02T21:00:00Z" })) }).length, 0);
  assert.equal(normalizeSyncedPosts({ posts: [{ platform: "facebook", platformPostId: "1", status: "deleted" }] }, fb).length, 0);
  assert.equal(normalizeSyncedPosts({ posts: [{ platform: "facebook", platformPostId: "1", isDeleted: true }] }, fb).length, 0);
  assert.equal(providerTargetState({ status: "published", parentStatus: "deleted" }), "removed");
});

test("partial post contributes only its published target", () => {
  const zernio = { posts: [{ _id: "z1", status: "partial", content: "c", platforms: [
    target("published", { platformPostId: "ok", platformPostUrl: "https://www.facebook.com/reel/111/" }),
    { platform: "facebook", accountId: "acc-fb-2", status: "failed" },
  ] }] };
  const cards = library(fb, { zernio });
  assert.deepEqual(cards.map((card) => card.platformPostId), ["ok"]);
  assert.equal(library({ ...fb, accountId: "acc-fb-2" }, { zernio }).length, 0);
});

test("local failed attempt plus provider live is a verified Live card", () => {
  const cards = library(fb, {
    zernio: zernioWith(target("published", { platformPostId: "1", platformPostUrl: "https://www.facebook.com/reel/1/" })),
    attempts: [],
  });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].verifiedLive, true);
  assert.equal(publishedCardState(cards[0]), "live");
});

test("local success plus provider failed is excluded, even if analytics still says published", () => {
  const attempts = [{ platform: "facebook", provider_post_id: "z1", post_url: "https://www.facebook.com/reel/1/", unpublished_at: null, request_snapshot: { platforms: [{ platform: "facebook", accountId: "acc-fb" }] } }];
  const analytics = { posts: [{ latePostId: "z1", status: "published", platforms: [target("published", { platformPostId: "1" })] }] };
  assert.equal(library(fb, { zernio: zernioWith(target("failed")), attempts }).length, 0);
  assert.equal(library(fb, { zernio: zernioWith(target("failed")), analytics, attempts }).length, 0);
});

test("Zernio cancelled record vetoes stale analytics reporting the same post as published", () => {
  // Shape seen for the removed Nov 2 Facebook copy.
  const zernio = { posts: [{ _id: "6ae8f21a", status: "cancelled", platforms: [target("cancelled", { platformPostId: "1462074119406696", platformPostUrl: "https://www.facebook.com/watch/?v=1462074119406696" })] }] };
  const analytics = { posts: [{ latePostId: "6ae8f21a", status: "published", isExternal: true, platformPostUrl: "https://www.facebook.com/reel/1462074119406696/", platforms: [target("published", { platformPostId: "398965860178419_1739355274868386" })] }] };
  const synced = { posts: [{ platform: "facebook", platformPostId: "398965860178419_1739355274868386", platformPostUrl: "https://www.facebook.com/reel/1462074119406696/" }] };
  assert.equal(library(fb, { zernio, analytics, synced }).length, 0);
  // Removed through WaveOS: kept only as Removed history, never live or deletable.
  const removed = library(fb, { zernio, analytics, synced, attempts: [{ platform: "facebook", provider_post_id: "6ae8f21a", post_url: "https://www.facebook.com/reel/1462074119406696/", unpublished_at: "2026-11-02T22:25:16Z", request_snapshot: { platforms: [{ platform: "facebook", accountId: "acc-fb" }] } }] });
  assert.equal(removed.length, 1);
  assert.equal(publishedCardState(removed[0]), "removed");
  assert.equal(livePostRemoval(removed[0], true).kind, "removed");
});

test("a card needs a stable platform post id or URL", () => {
  assert.equal(library(fb, { zernio: zernioWith(target("published")) }).length, 0);
  assert.equal(library(fb, { zernio: zernioWith(target("published", { platformPostUrl: "not a url" })) }).length, 0);
  const urlOnly = library(fb, { zernio: zernioWith(target("published", { platformPostUrl: "https://www.facebook.com/reel/77/" })) });
  assert.equal(urlOnly.length, 1);
  assert.equal(urlOnly[0].platformPostId, null);
  // URL-only cards can be opened but not removed from WaveOS.
  assert.equal(livePostRemoval(urlOnly[0], true).kind, "manual");
  assert.equal(normalizeSyncedPosts({ posts: [{ platform: "facebook", content: "no locator" }] }, fb).length, 0);
});

test("delete is hidden for unverified cards; they are dropped from the library", () => {
  const [card] = library(fb, { zernio: zernioWith(target("published", { platformPostId: "1" })) });
  assert.equal(livePostRemoval(card, true).kind, "remove");
  const unverified = { ...card, verifiedLive: false };
  assert.equal(livePostRemoval(unverified, true).kind, "unverified");
  assert.equal(publishedCardState(unverified), null);
  assert.deepEqual(finalizePublishedLibrary([unverified]), []);
  // Merge is conservative: one contradicted copy makes the card unverified.
  assert.equal(mergeLivePosts([card], [unverified])[0].verifiedLive, false);
});

test("counts include only live and removed cards", () => {
  const [card] = library(fb, { zernio: zernioWith(target("published", { platformPostId: "1" })) });
  const list = finalizePublishedLibrary([card, { ...card, key: "r", removedAt: "2026-11-02T21:00:00Z" }, { ...card, key: "u", verifiedLive: false }]);
  assert.deepEqual(publishedCounts(list), { live: 1, removed: 1 });
});

test("Organic Skin TikTok regression: WaveOS timeout, Zernio published -> one Live card", () => {
  // Read-only shapes observed Nov 2 for Zernio post 6ae8f353cbdd6fc207a9e024.
  const url = "https://www.tiktok.com/@organicskinandbodymedspa/video/7703674632938835214";
  const zernio = { posts: [{ _id: "6ae8f353cbdd6fc207a9e024", status: "published", content: "Ever wonder what the experience is actually like", platforms: [
    { platform: "tiktok", accountId: { _id: tiktok.accountId }, status: "published", platformPostId: "7703674632938835214", platformPostUrl: url },
  ] }] };
  const analytics = { posts: [{ latePostId: "6ae8f353cbdd6fc207a9e024", status: "published", platform: "tiktok", isExternal: true, platformPostId: null,
    platformPostUrl: `${url}?utm_campaign=tt4d_open_api&utm_source=7608030276714774544`, publishedAt: "2026-11-02T20:32:26.000Z",
    platforms: [{ platform: "tiktok", accountId: tiktok.accountId, status: "published", platformPostId: "7703674632938835214", platformPostUrl: `${url}?utm_campaign=tt4d_open_api` }] }] };
  // WaveOS recorded this attempt as failed (timeout) with no provider id.
  const attempts = [{ platform: "tiktok", provider_post_id: null, post_url: null, unpublished_at: null, request_snapshot: { platforms: [{ platform: "tiktok", accountId: tiktok.accountId }] } }];
  const cards = library(tiktok, { zernio, analytics, attempts });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].latePostId, "6ae8f353cbdd6fc207a9e024");
  assert.equal(publishedCardState(cards[0]), "live");
  // TikTok can't be removed through Zernio; the card points to TikTok instead.
  assert.equal(livePostRemoval(cards[0], true).kind, "manual");
});

test("Published UI never labels a card Failed and gates actions on verified state", () => {
  const ui = readFileSync("src/components/social/live-posts-library.tsx", "utf8");
  assert.doesNotMatch(ui, /["'>]\s*Failed\b/);
  assert.match(ui, /finalizePublishedLibrary\(/);
  assert.match(ui, /post\.url && state === "live"/);
  const server = readFileSync("src/lib/live-posts.server.ts", "utf8");
  assert.match(server, /finalizePublishedLibrary\(\s*applyProviderVetoes\(/);
  assert.match(server, /zernioPosts\.status === "rejected"/);
});
