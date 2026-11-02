import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { failureGuidance, hasProviderReference } from "../../src/lib/publish-failure-guidance.ts";
import {
  isZernioTimeoutError,
  normalizeZernioRequestError,
  ZERNIO_CREATE_POST_TIMEOUT_MS,
} from "../../src/lib/zernio-timeout.ts";

const MEDIA_GUIDANCE = /media requirements/;
const TIMEOUT_GUIDANCE = /provider timeout, not a rejection of the vertical format/;

test("'The operation was aborted due to timeout' gets timeout guidance, not media guidance", () => {
  const guidance = failureGuidance("The operation was aborted due to timeout", "TikTok", {
    errorCode: "23",
  });
  assert.match(guidance, TIMEOUT_GUIDANCE);
  assert.doesNotMatch(guidance, MEDIA_GUIDANCE);
  assert.match(guidance, /Open and retry post/);
});

test("the zernio_timeout code alone gets timeout guidance", () => {
  assert.match(failureGuidance(null, "TikTok", { errorCode: "zernio_timeout" }), TIMEOUT_GUIDANCE);
});

test("the word 'operation' no longer counts as a media problem", () => {
  assert.doesNotMatch(failureGuidance("The operation could not be completed", "TikTok"), MEDIA_GUIDANCE);
});

test("a real aspect ratio or video format message still gets media guidance", () => {
  assert.match(failureGuidance("Unsupported aspect ratio for this placement", "TikTok"), MEDIA_GUIDANCE);
  assert.match(failureGuidance("Video format is not supported", "TikTok"), MEDIA_GUIDANCE);
});

test("DOMException code 23 / TimeoutError normalizes to zernio_timeout", () => {
  const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
  assert.equal(timeout.code, 23);
  assert.equal(isZernioTimeoutError(timeout), true);
  const normalized = normalizeZernioRequestError(timeout);
  assert.equal(normalized.code, "zernio_timeout");
  assert.match(normalized.message, /may still be processing/);
  assert.doesNotMatch(normalized.message, /aborted/);
  assert.deepEqual(normalized.details, {});
});

test("ordinary Zernio errors keep their provider code and message", () => {
  const error = Object.assign(new Error("Account disconnected"), { code: "account_error", details: { a: 1 } });
  assert.equal(isZernioTimeoutError(error), false);
  assert.deepEqual(normalizeZernioRequestError(error), {
    code: "account_error",
    message: "Account disconnected",
    details: { a: 1 },
  });
});

test("Refresh provider details is offered only with a provider reference", () => {
  assert.equal(hasProviderReference({ provider_post_id: null, ayrshare_post_id: null }), false);
  assert.equal(hasProviderReference({ provider_post_id: "zp_1", ayrshare_post_id: null }), true);
  assert.equal(hasProviderReference({ provider_post_id: null, ayrshare_post_id: "legacy" }), true);
});

test("creating a post waits 60 seconds and keeps the same idempotency key", () => {
  assert.equal(ZERNIO_CREATE_POST_TIMEOUT_MS, 60_000);
  const source = readFileSync("src/lib/zernio-publish.server.ts", "utf8");
  assert.match(source, /const idempotencyKey = `\$\{contentId\}:\$\{variant\.platform\}`;/);
  assert.match(source, /headers: \{ "Idempotency-Key": idempotencyKey \},[\s\S]{0,80}signal: AbortSignal\.timeout\(ZERNIO_CREATE_POST_TIMEOUT_MS\)/);
  assert.match(readFileSync("src/lib/zernio.server.ts", "utf8"), /AbortSignal\.timeout\(15_000\)/);
});
