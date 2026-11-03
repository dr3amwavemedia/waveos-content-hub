import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertSingleTargetRequest,
  destinationHeadline,
  destinationLines,
  META_SHARING_WARNING,
  providerPlatformFor,
  readTargetSummary,
  sameDestinations,
  showMetaSharingWarning,
  unexpectedResponseTargets,
  unexpectedTargetMessage,
} from "../../src/lib/publish-targets.ts";
import { toZernioPlatform } from "../../src/lib/zernio.server.ts";
import { failureGuidance } from "../../src/lib/publish-failure-guidance.ts";

const IG = { platform: "instagram", provider_account_id: "6abfc6708b07279eae20f01d" };
const FB = { platform: "facebook", provider_account_id: "6abfca8f8ae593e3354f6197" };
const igBody = (overrides = {}) => ({
  content: "Laser tattoo removal",
  mediaItems: [{ type: "video", url: "https://example.com/v.mp4" }],
  platforms: [{ platform: "instagram", accountId: IG.provider_account_id }],
  publishNow: true,
  ...overrides,
});

test("platform mapping matches the Zernio publisher", () => {
  for (const platform of ["instagram", "facebook", "tiktok", "x", "gmb", "youtube", "linkedin"])
    assert.equal(providerPlatformFor(platform), toZernioPlatform(platform), platform);
});

test("an Instagram-only request passes and yields the exact target summary", () => {
  const summary = assertSingleTargetRequest({ variantPlatform: "instagram", requestBody: igBody(), connection: IG });
  assert.deepEqual(summary, {
    requestedPlatform: "instagram",
    providerPlatform: "instagram",
    accountId: "6abfc6708b07279eae20f01d",
    connectionPlatform: "instagram",
    platforms: [{ platform: "instagram", accountId: "6abfc6708b07279eae20f01d" }],
  });
  // The stored summary reads back identically.
  assert.deepEqual(readTargetSummary({ ...igBody(), waveosTarget: summary }), summary);
  assert.equal(readTargetSummary(igBody()), null);
});

test("exactly one platforms[] entry is required", () => {
  assert.throws(
    () =>
      assertSingleTargetRequest({
        variantPlatform: "instagram",
        requestBody: igBody({
          platforms: [
            { platform: "instagram", accountId: IG.provider_account_id },
            { platform: "facebook", accountId: FB.provider_account_id },
          ],
        }),
        connection: IG,
      }),
    /exactly one Instagram account, but 2 destinations/,
  );
  assert.throws(
    () => assertSingleTargetRequest({ variantPlatform: "instagram", requestBody: igBody({ platforms: [] }), connection: IG }),
    /0 destinations/,
  );
});

test("platform, account and connection mismatches are rejected before sending", () => {
  assert.throws(
    () =>
      assertSingleTargetRequest({
        variantPlatform: "instagram",
        requestBody: igBody({ platforms: [{ platform: "facebook", accountId: IG.provider_account_id }] }),
        connection: IG,
      }),
    /prepared destination was Facebook/,
  );
  assert.throws(
    () =>
      assertSingleTargetRequest({
        variantPlatform: "instagram",
        requestBody: igBody({ platforms: [{ platform: "instagram", accountId: FB.provider_account_id }] }),
        connection: IG,
      }),
    /account doesn't match/,
  );
  assert.throws(
    () =>
      assertSingleTargetRequest({
        variantPlatform: "instagram",
        requestBody: igBody({ platforms: [{ platform: "instagram", accountId: FB.provider_account_id }] }),
        connection: FB,
      }),
    /selected account is a Facebook account/,
  );
  assert.throws(
    () => assertSingleTargetRequest({ variantPlatform: "instagram", requestBody: igBody(), connection: null }),
    /account doesn't match/,
  );
  // X maps to Zernio's "twitter".
  assert.doesNotThrow(() =>
    assertSingleTargetRequest({
      variantPlatform: "x",
      requestBody: { platforms: [{ platform: "twitter", accountId: "acc-x" }] },
      connection: { platform: "x", provider_account_id: "acc-x" },
    }),
  );
});

test("an Instagram request may not carry Facebook settings anywhere", () => {
  assert.throws(
    () =>
      assertSingleTargetRequest({
        variantPlatform: "instagram",
        requestBody: igBody({ facebookSettings: { draft: false } }),
        connection: IG,
      }),
    /facebookSettings/,
  );
  assert.throws(
    () =>
      assertSingleTargetRequest({
        variantPlatform: "instagram",
        requestBody: igBody({
          platforms: [
            {
              platform: "instagram",
              accountId: IG.provider_account_id,
              platformSpecificData: { facebookSettings: {} },
            },
          ],
        }),
        connection: IG,
      }),
    /facebookSettings/,
  );
  // Story content type for the same platform is still allowed.
  assert.doesNotThrow(() =>
    assertSingleTargetRequest({
      variantPlatform: "instagram",
      requestBody: igBody({
        platforms: [{ platform: "instagram", accountId: IG.provider_account_id, platformSpecificData: { contentType: "story" } }],
      }),
      connection: IG,
    }),
  );
});

test("a create response with an unrequested Facebook target is flagged", () => {
  const summary = assertSingleTargetRequest({ variantPlatform: "instagram", requestBody: igBody(), connection: IG });
  const clean = {
    _id: "6ae8f350cbdd6fc207a9e01f",
    platforms: [{ platform: "instagram", status: "published", accountId: { _id: IG.provider_account_id } }],
  };
  assert.deepEqual(unexpectedResponseTargets(clean, summary), []);
  const leaked = {
    ...clean,
    platforms: [...clean.platforms, { platform: "facebook", status: "published", accountId: FB.provider_account_id }],
  };
  const extra = unexpectedResponseTargets(leaked, summary);
  assert.deepEqual(extra, [{ platform: "facebook", accountId: FB.provider_account_id }]);
  assert.match(unexpectedTargetMessage(extra, "instagram"), /Instagram post also went to Facebook, which WaveOS did not request/);
  assert.match(unexpectedTargetMessage(extra, "instagram"), /Nothing was removed automatically/);
  // Same platform, different account is also unexpected.
  assert.equal(
    unexpectedResponseTargets({ platforms: [{ platform: "instagram", accountId: "other" }] }, summary).length,
    1,
  );
  assert.match(failureGuidance("x", "Instagram", { errorCode: "unexpected_target" }), /will not re-send/);
});

test("stale selection: saved destinations must equal what was shown", () => {
  assert.equal(sameDestinations(["instagram"], ["instagram"]), true);
  assert.equal(sameDestinations(["tiktok", "instagram"], ["instagram", "tiktok"]), true);
  assert.equal(sameDestinations(["instagram", "tiktok"], ["instagram"]), false);
  assert.equal(sameDestinations(["instagram"], ["instagram", "facebook"]), false);
});

const connections = [
  { platform: "instagram", connected: true, connection_state: "connected", provider_account_id: "ig", username: "organicskin", display_name: "Organic Skin" },
  { platform: "facebook", connected: true, connection_state: "connected", provider_account_id: "fb", username: null, display_name: "Organic Skin & Body" },
  { platform: "tiktok", connected: true, connection_state: "connected", provider_account_id: "tt", username: "@organictt", display_name: null },
];

test("destination line names the only target, or lists each one", () => {
  const one = destinationLines(["instagram"], connections);
  assert.equal(destinationHeadline(one), "Publishing only to Instagram · @organicskin");
  const two = destinationLines(["instagram", "tiktok"], connections);
  assert.equal(destinationHeadline(two), "Publishing to 2 destinations");
  assert.deepEqual(two.map((line) => line.text), ["Instagram · @organicskin", "TikTok · @organictt"]);
  assert.equal(destinationLines(["youtube"], connections)[0].connected, false);
});

test("Meta warning shows only for Instagram without Facebook when Facebook is connected", () => {
  assert.equal(showMetaSharingWarning(["instagram"], connections), true);
  assert.equal(showMetaSharingWarning(["instagram", "facebook"], connections), false);
  assert.equal(showMetaSharingWarning(["facebook"], connections), false);
  assert.equal(showMetaSharingWarning(["tiktok"], connections), false);
  assert.equal(showMetaSharingWarning(["instagram"], connections.filter((row) => row.platform !== "facebook")), false);
  assert.equal(
    META_SHARING_WARNING,
    "WaveOS will send only to Instagram. If Meta automatic sharing is enabled in Accounts Center, Meta may still copy it to Facebook.",
  );
});

test("publisher runs the invariant before claim and immediately before create, keeps the idempotency key", () => {
  const source = readFileSync("src/lib/zernio-publish.server.ts", "utf8");
  const preflight = source.indexOf("const targetSummary = assertSingleTargetRequest(");
  const claim = source.indexOf('.update({ status: "publishing" })');
  const loopCheck = source.indexOf("const targetSummary = assertSingleTargetRequest(", claim);
  const create = source.indexOf('zernioRequest<{ post?: ZernioPost }>("/posts", {');
  assert.ok(preflight > 0 && preflight < claim && claim < loopCheck && loopCheck < create);
  assert.match(source, /const idempotencyKey = `\$\{contentId\}:\$\{variant\.platform\}`;/);
  assert.match(source, /headers: \{ "Idempotency-Key": idempotencyKey \}/);
  assert.match(source, /waveosTarget: targetSummary/);
  assert.match(source, /unexpectedResponseTargets\(response\.post, targetSummary\)/);
  assert.match(source, /if \(existing\?\.status === "success"\) \{\s*success \+= 1;\s*continue;/);
  assert.match(source, /options\.expectedPlatforms &&\s*!sameDestinations/);
  assert.doesNotMatch(source, /facebookSettings/);
});

test("editor publishes the saved selection it showed and shows the destination above Publish", () => {
  const editor = readFileSync("src/routes/_authenticated/create.tsx", "utf8");
  assert.match(editor, /sameDestinations\(\(savedVariants \?\? \[\]\)\.map\(\(row\) => row\.platform\), shownPlatforms\)/);
  assert.match(editor, /publishFn\(\{ data: \{ contentId: id, allowDuplicate, expectedPlatforms \} \}\)/);
  // Both the desktop Post now and mobile Publish have the destination block before them.
  const desktop = editor.indexOf("<PublishDestinations\n              title={destinationTitle}");
  assert.ok(desktop > 0 && desktop < editor.indexOf("Post now", desktop));
  const mobile = editor.indexOf("<PublishDestinations\n          compact");
  assert.ok(mobile > 0 && mobile < editor.indexOf("onClick={handlePublishNow}><Send", mobile));
  assert.doesNotMatch(editor, /metaWarning=\{metaSharingWarning\}/);
  assert.match(editor, /if \(draftStorageKey\) window\.localStorage\.removeItem\(draftStorageKey\);\s*return item\.id;/);
});
