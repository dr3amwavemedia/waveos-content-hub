import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyRemovalLog,
  applyWaveosHistory,
  classifyAccountError,
  isLivePostRemoveConfirmation,
  livePlatformLabel,
  livePostKey,
  livePostRemoval,
  mergeLivePosts,
  normalizeAnalyticsPosts,
  normalizeSyncedPosts,
  normalizeZernioPosts,
  postAliases,
  providerPlatformSupportsUnpublish,
  toProviderPlatform,
  zernioPostContainsCopy,
} from "../../src/lib/live-posts.ts";

const fb = { accountId: "acc-fb", platform: "facebook", name: "Organic Skin" };
const fb2 = { accountId: "acc-fb-2", platform: "facebook", name: "Second Page" };

const post = (overrides = {}) => ({
  key: livePostKey("facebook", "acc-fb", "111"),
  platform: "facebook",
  accountId: "acc-fb",
  accountName: "Organic Skin",
  platformPostId: "111",
  latePostId: "late-1",
  url: "https://www.facebook.com/watch/?v=111",
  caption: "Hello",
  thumbnailUrl: null,
  mediaType: "video",
  publishedAt: "2026-11-02T20:27:17.288Z",
  source: "zernio",
  removedAt: null,
  aliases: postAliases(
    overrides.platform ?? "facebook",
    overrides.platformPostId ?? "111",
    "url" in overrides ? overrides.url : "https://www.facebook.com/watch/?v=111",
  ),
  ...overrides,
});

test("platform mapping uses Zernio names for X and Google Business", () => {
  assert.equal(toProviderPlatform("x"), "twitter");
  assert.equal(toProviderPlatform("gmb"), "googlebusiness");
  assert.equal(toProviderPlatform("Facebook"), "facebook");
  assert.equal(livePlatformLabel("twitter"), "X");
  assert.equal(livePlatformLabel("gmb"), "Google Business");
});

test("documented unpublish platforms are supported; Instagram, TikTok, Snapchat are not", () => {
  for (const platform of [
    "facebook", "threads", "twitter", "x", "linkedin", "youtube",
    "pinterest", "reddit", "bluesky", "googlebusiness", "gmb", "telegram",
  ])
    assert.equal(providerPlatformSupportsUnpublish(platform), true, platform);
  for (const platform of ["instagram", "tiktok", "snapchat"])
    assert.equal(providerPlatformSupportsUnpublish(platform), false, platform);
});

test("removal requires typing REMOVE exactly", () => {
  assert.equal(isLivePostRemoveConfirmation("REMOVE"), true);
  for (const value of ["remove", " REMOVE", "REMOVE ", "", null, undefined, "yes"])
    assert.equal(isLivePostRemoveConfirmation(value), false, String(value));
});

test("sync-external posts become cards for that exact account", () => {
  const cards = normalizeSyncedPosts(
    {
      synced: { postsFound: 2 },
      posts: [
        {
          platform: "facebook",
          platformPostId: "222",
          platformPostUrl: "https://www.facebook.com/p/222",
          content: "Direct on Facebook",
          publishedAt: "2026-10-01T10:00:00Z",
          thumbnailUrl: "https://cdn.example.com/t.jpg",
          mediaType: "image",
        },
        { platform: "facebook", content: "no id" },
        { platform: "instagram", platformPostId: "ig-1" },
      ],
    },
    fb,
  );
  assert.equal(cards.length, 1);
  assert.equal(cards[0].key, "facebook:acc-fb:222");
  assert.equal(cards[0].latePostId, null);
  assert.equal(cards[0].source, "external");
  assert.equal(cards[0].thumbnailUrl, "https://cdn.example.com/t.jpg");
});

test("analytics rows split cross-posted copies and keep only the requested account", () => {
  const payload = {
    posts: [
      {
        postId: "late-1",
        latePostId: "late-1",
        content: "Same caption",
        publishedAt: "2026-11-02T20:27:17Z",
        platformAnalytics: [
          { platform: "facebook", status: "published", accountId: "acc-fb", platformPostId: "111", platformPostUrl: "https://www.facebook.com/watch/?v=111" },
          { platform: "facebook", status: "published", accountId: "acc-fb-2", platformPostId: "999", platformPostUrl: "https://www.facebook.com/watch/?v=999" },
          { platform: "instagram", status: "published", accountId: "acc-ig", platformPostId: "ig" },
          { platform: "facebook", status: "failed", accountId: "acc-fb", platformPostId: "fail" },
        ],
      },
    ],
  };
  const first = normalizeAnalyticsPosts(payload, fb);
  const second = normalizeAnalyticsPosts(payload, fb2);
  assert.deepEqual(first.map((card) => card.platformPostId), ["111"]);
  assert.deepEqual(second.map((card) => card.platformPostId), ["999"]);
  assert.equal(first[0].latePostId, "late-1");
  assert.equal(first[0].url, "https://www.facebook.com/watch/?v=111");
});

test("two Facebook duplicates with distinct Zernio ids stay two separate cards", () => {
  const payload = {
    posts: [
      { latePostId: "late-A", content: "Dup", platformAnalytics: [{ platform: "facebook", accountId: { _id: "acc-fb" }, platformPostId: "A" }] },
      { latePostId: "late-B", content: "Dup", platformAnalytics: [{ platform: "facebook", accountId: { _id: "acc-fb" }, platformPostId: "B" }] },
    ],
  };
  const cards = mergeLivePosts(normalizeAnalyticsPosts(payload, fb));
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((card) => card.latePostId).sort(), ["late-A", "late-B"]);
});

test("merge dedupes by platform + account + platform post id and keeps the Zernio id", () => {
  const external = post({ latePostId: null, source: "external", thumbnailUrl: "https://cdn/x.jpg" });
  const zernio = post({ thumbnailUrl: null });
  const otherAccount = post({ key: livePostKey("facebook", "acc-fb-2", "111"), accountId: "acc-fb-2" });
  const merged = mergeLivePosts([external], [zernio, otherAccount]);
  assert.equal(merged.length, 2);
  const card = merged.find((row) => row.accountId === "acc-fb");
  assert.equal(card.latePostId, "late-1");
  assert.equal(card.thumbnailUrl, "https://cdn/x.jpg");
  assert.equal(card.source, "zernio");
});

test("WaveOS history links a Zernio id only for the same URL and single matching account", () => {
  const external = post({ latePostId: null, source: "external" });
  const attempt = {
    platform: "facebook",
    provider_post_id: "late-1",
    post_url: "https://www.facebook.com/watch/?v=111",
    unpublished_at: null,
    request_snapshot: { platforms: [{ platform: "facebook", accountId: "acc-fb" }] },
  };
  assert.equal(applyWaveosHistory([external], [attempt])[0].latePostId, "late-1");
  // Multi-account request: never guess which copy.
  const multi = { ...attempt, request_snapshot: { platforms: [
    { platform: "facebook", accountId: "acc-fb" }, { platform: "facebook", accountId: "acc-fb-2" },
  ] } };
  assert.equal(applyWaveosHistory([external], [multi])[0].latePostId, null);
  // Different URL: different post.
  assert.equal(applyWaveosHistory([external], [{ ...attempt, post_url: "https://www.facebook.com/watch/?v=222" }])[0].latePostId, null);
  // Removed in WaveOS history.
  assert.equal(
    applyWaveosHistory([post()], [{ ...attempt, unpublished_at: "2026-11-02T21:00:00Z" }])[0].removedAt,
    "2026-11-02T21:00:00Z",
  );
});

test("logged removals mark only the exact card", () => {
  const cards = applyRemovalLog(
    [post(), post({ key: livePostKey("facebook", "acc-fb", "222"), platformPostId: "222" })],
    [{ key: "facebook:acc-fb:111", accountId: "acc-fb", latePostId: null, removedAt: "2026-11-02T21:00:00Z" }],
  );
  assert.equal(cards[0].removedAt, "2026-11-02T21:00:00Z");
  assert.equal(cards[1].removedAt, null);
  // A logged Zernio post id marks that account's card even if its key differs.
  const byLate = applyRemovalLog(
    [post({ key: "facebook:acc-fb:other", latePostId: "late-9" }), post({ key: "facebook:acc-fb-2:x", accountId: "acc-fb-2", latePostId: "late-9" })],
    [{ key: "nope", accountId: "acc-fb", latePostId: "late-9", removedAt: "2026-11-02T21:00:00Z" }],
  );
  assert.equal(byLate[0].removedAt, "2026-11-02T21:00:00Z");
  assert.equal(byLate[1].removedAt, null);
});

test("analytics list rows read per-account copies from `platforms`", () => {
  const cards = normalizeAnalyticsPosts(
    {
      posts: [
        {
          _id: "ext-1",
          isExternal: true,
          latePostId: null,
          platform: "facebook",
          content: "Story",
          publishedAt: "2026-10-28T13:01:22.000Z",
          platformPostUrl: "https://facebook.com/stories/1/abc/?view_single=1",
          platforms: [{ platform: "facebook", status: "published", platformPostId: "1845060533187303", accountId: "acc-fb", platformPostUrl: "https://facebook.com/stories/1/abc/?view_single=1" }],
        },
      ],
    },
    fb,
  );
  assert.equal(cards.length, 1);
  assert.equal(cards[0].platformPostId, "1845060533187303");
  assert.equal(cards[0].latePostId, null);
});

// Shapes observed for the Nov 2 Facebook duplicate on one Page.
const fbSync = {
  posts: [
    { platform: "facebook", platformPostId: "398965860178419_1739355274868386", platformPostUrl: "https://www.facebook.com/reel/1462074119406696/", publishedAt: "2026-11-02T20:28:03.000Z", content: "Ever wonder", mediaType: "video" },
    { platform: "facebook", platformPostId: "398965860178419_1739354224868491", platformPostUrl: "https://www.facebook.com/reel/1631234285363380/", publishedAt: "2026-11-02T20:26:05.000Z", content: "Ever wonder", mediaType: "video" },
  ],
};
const fbZernio = {
  posts: [
    { _id: "6ae8f21ab5b67967df0ebc8a", status: "published", content: "Ever wonder", platforms: [{ platform: "facebook", status: "published", accountId: { _id: "acc-fb" }, platformPostId: "1462074119406696", platformPostUrl: "https://www.facebook.com/watch/?v=1462074119406696", publishedAt: "2026-11-02T20:27:17.288Z" }] },
    { _id: "6ae8f1b1072fcbf9f7dd8cd2", status: "published", content: "Ever wonder", platforms: [{ platform: "facebook", status: "published", accountId: "acc-fb", platformPostId: "1631234285363380", platformPostUrl: "https://www.facebook.com/watch/?v=1631234285363380" }] },
  ],
};

test("both Facebook duplicate copies show as two cards, each with its own Zernio id", () => {
  const cards = mergeLivePosts(normalizeSyncedPosts(fbSync, fb), normalizeZernioPosts(fbZernio, fb));
  assert.equal(cards.length, 2);
  const byReel = Object.fromEntries(cards.map((card) => [card.url, card.latePostId]));
  assert.deepEqual(byReel, {
    "https://www.facebook.com/reel/1462074119406696/": "6ae8f21ab5b67967df0ebc8a",
    "https://www.facebook.com/reel/1631234285363380/": "6ae8f1b1072fcbf9f7dd8cd2",
  });
  for (const card of cards) assert.deepEqual(livePostRemoval(card, true), { kind: "remove" });
});

test("each duplicate card verifies only against its own Zernio post", () => {
  const cards = mergeLivePosts(normalizeSyncedPosts(fbSync, fb), normalizeZernioPosts(fbZernio, fb));
  const [late, early] = [...cards].sort((a, b) => a.platformPostId.localeCompare(b.platformPostId)).reverse();
  const [z1, z2] = fbZernio.posts;
  const target = (card) => ({ platform: card.platform, accountId: card.accountId, platformPostId: card.platformPostId, url: card.url });
  assert.equal(zernioPostContainsCopy(z1, target(late)), true);
  assert.equal(zernioPostContainsCopy(z2, target(late)), false);
  assert.equal(zernioPostContainsCopy(z2, target(early)), true);
  assert.equal(zernioPostContainsCopy(z1, target(early)), false);
});

test("Zernio post records only produce cards for this account's published copies", () => {
  const cards = normalizeZernioPosts(
    { posts: [
      { _id: "z1", platforms: [
        { platform: "facebook", status: "published", accountId: "acc-fb", platformPostId: "1" },
        { platform: "facebook", status: "published", accountId: "acc-fb-2", platformPostId: "2" },
        { platform: "facebook", status: "failed", accountId: "acc-fb", platformPostId: "3" },
        { platform: "instagram", status: "published", accountId: "acc-fb", platformPostId: "4" },
      ] },
      { platforms: [{ platform: "facebook", status: "published", accountId: "acc-fb", platformPostId: "5" }] },
    ] },
    fb,
  );
  assert.deepEqual(cards.map((card) => [card.platformPostId, card.latePostId]), [["1", "z1"]]);
});

test("dialog offers Remove only for managers on supported posts with a Zernio id", () => {
  assert.deepEqual(livePostRemoval(post(), true), { kind: "remove" });
  assert.equal(livePostRemoval(post(), false).kind, "not_allowed");
  assert.equal(livePostRemoval(post({ latePostId: null }), true).kind, "manual");
  for (const platform of ["instagram", "tiktok", "snapchat"]) {
    const result = livePostRemoval(post({ platform }), true);
    assert.equal(result.kind, "manual", platform);
    assert.match(result.message, /delete it there/);
  }
  const removed = livePostRemoval(post({ removedAt: "2026-11-02T21:00:00Z" }), true);
  assert.deepEqual(removed, { kind: "removed", message: "Removed from Facebook" });
});

test("server confirms the Zernio post holds this exact account copy before deleting", () => {
  const zernioPost = {
    _id: "6ae8f21ab5b67967df0ebc8a",
    platforms: [
      {
        platform: "facebook",
        status: "published",
        accountId: { _id: "acc-fb", platform: "facebook" },
        platformPostId: "1462074119406696",
        platformPostUrl: "https://www.facebook.com/watch/?v=1462074119406696",
      },
    ],
  };
  const target = { platform: "facebook", accountId: "acc-fb", platformPostId: "1462074119406696", url: null };
  assert.equal(zernioPostContainsCopy(zernioPost, target), true);
  assert.equal(zernioPostContainsCopy(zernioPost, { ...target, platformPostId: "other" }), false);
  assert.equal(zernioPostContainsCopy(zernioPost, { ...target, accountId: "acc-fb-2" }), false);
  assert.equal(zernioPostContainsCopy(zernioPost, { ...target, platform: "x" }), false);
  assert.equal(zernioPostContainsCopy(null, target), false);
});

test("per-account failures are safe and flag reconnects", () => {
  const expired = classifyAccountError({ status: 409, code: "ads_connection_required", message: "token abc" }, fb);
  assert.equal(expired.reconnect, true);
  assert.match(expired.message, /reconnected/);
  assert.doesNotMatch(expired.message, /token abc/);
  const slow = classifyAccountError({ name: "TimeoutError" }, fb);
  assert.equal(slow.reconnect, false);
  assert.match(slow.message, /too long/);
  assert.equal(classifyAccountError({ status: 500, message: "secret payload" }, fb).message.includes("secret"), false);
});

test("server scoping: listing checks access first; accounts come from the caller's workspace", () => {
  const fns = readFileSync("src/lib/live-posts.functions.ts", "utf8");
  const server = readFileSync("src/lib/live-posts.server.ts", "utf8");
  const list = fns.slice(fns.indexOf("export const listLivePosts"), fns.indexOf("export const removeLivePost"));
  assert.match(list, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.ok(list.indexOf("requireSocialWorkspaceAccess(") < list.indexOf("loadWorkspaceLiveAccounts("));
  // Accounts are read with the caller's RLS client and scoped to the workspace.
  assert.match(server, /loadWorkspaceLiveAccounts\(\s*supabase: SupabaseClient<Database>/);
  assert.match(server, /\.from\("social_connections"\)[\s\S]*?\.eq\("workspace_id", workspaceId\)/);
  // Requested account ids can only narrow the workspace's own accounts.
  assert.match(list, /accounts\.filter\(\(account\) => data\.accountIds!\.includes/);
  // One account's failure never rejects the whole page.
  assert.match(server, /Promise\.all\(\s*input\.accounts\.map\(async \(account\)/);
  assert.match(server, /classifyAccountError\(reason, account\)/);
  assert.doesNotMatch(fns + server, /ZERNIO_API_KEY/);
});

test("server removal: REMOVE, manager, workspace account, exact copy, then unpublish", () => {
  const fns = readFileSync("src/lib/live-posts.functions.ts", "utf8");
  const server = readFileSync("src/lib/live-posts.server.ts", "utf8");
  const remove = fns.slice(fns.indexOf("export const removeLivePost"));
  const order = [
    "isLivePostRemoveConfirmation(data.confirmation)",
    "requireSocialWorkspaceManager(",
    "loadWorkspaceLiveAccounts(",
    "removeExactLivePost(",
  ].map((needle) => remove.indexOf(needle));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), String(order));
  const removal = server.slice(server.indexOf("export async function removeExactLivePost"));
  assert.ok(removal.indexOf("zernioPostContainsCopy(") < removal.indexOf("/unpublish`"));
  assert.match(removal, /JSON\.stringify\(\{ platform, accountId: input\.account\.accountId \}\)/);
  assert.match(removal, /action: REMOVED_ACTION/);
  assert.doesNotMatch(removal, /\.delete\(/);
  assert.doesNotMatch(removal, /caption|content:/);
});
