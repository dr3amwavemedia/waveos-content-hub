import assert from "node:assert/strict";
import test from "node:test";
import { driveBrowserReturnUrl, driveMobilePickerResultPath, prepareDriveBrowserReturn, driveCheckpointKey, drivePickerOutcome, isIosHomeScreen, safeDrivePickerReturnPath, safariOpenUrl } from "../../src/lib/drive-picker-return.ts";

test("standalone wording recognizes installed iOS without classifying regular Safari as embedded", () => {
  assert.equal(isIosHomeScreen({ userAgent: "iPhone", standalone: true }, false), true);
  assert.equal(isIosHomeScreen({ userAgent: "iPhone" }, false), false);
  assert.equal(isIosHomeScreen({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 5 }, true), true);
  assert.equal(isIosHomeScreen({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 0 }, true), false);
  assert.equal(isIosHomeScreen({ userAgent: "Android" }, true), false);
});

test("Safari handoff waits for the explicit save and uses its returned saved draft only", async () => {
  let finish;
  let exposed = false;
  const saving = new Promise((resolve) => { finish = resolve; });
  const returning = prepareDriveBrowserReturn("https://waveos.dreamwavemedia.co", () => saving)
    .then((url) => { exposed = true; return url; });
  await Promise.resolve();
  assert.equal(exposed, false);
  finish("saved-post-123");
  assert.equal(await returning, "https://waveos.dreamwavemedia.co/create?id=saved-post-123");
});

test("missing saved ID and failed save never produce a Safari continuation link", async () => {
  await assert.rejects(prepareDriveBrowserReturn("https://waveos.dreamwavemedia.co", async () => null), /could not be saved/);
  await assert.rejects(prepareDriveBrowserReturn("https://waveos.dreamwavemedia.co", async () => { throw new Error("Save failed"); }), /Save failed/);
});

test("Safari continuation retains only the exact saved draft and uses external Safari scheme", () => {
  const url = driveBrowserReturnUrl("https://waveos.dreamwavemedia.co/create?caption=private&access_token=secret", "abc-123");
  assert.equal(url, "https://waveos.dreamwavemedia.co/create?id=abc-123");
  assert.equal(safariOpenUrl(url), "x-safari-https://waveos.dreamwavemedia.co/create?id=abc-123");
});

test("unsafe draft return parameters and credential-bearing origins cannot escape", () => {
  for (const origin of ["javascript:alert(1)", "http://waveos.dreamwavemedia.co", "https://user:pass@waveos.dreamwavemedia.co"]) {
    assert.throws(() => driveBrowserReturnUrl(origin, "abc-123"));
  }
  for (const id of ["../settings", "abc&next=https://evil.test", ""]) assert.throws(() => driveBrowserReturnUrl("https://waveos.dreamwavemedia.co", id));
  assert.throws(() => safariOpenUrl("javascript:alert(1)"));
});

test("cancel and empty/error callbacks never count as selected files", () => {
  assert.equal(drivePickerOutcome("cancel", 2), "cancelled");
  assert.equal(drivePickerOutcome("error", 2), "failed");
  assert.equal(drivePickerOutcome("picked", 0), "empty");
  assert.equal(drivePickerOutcome("picked", 2), "picked");
  assert.equal(drivePickerOutcome("loaded", 2), "pending");
});

test("return checkpoints cannot collide between workspaces or saved/new posts", () => {
  assert.notEqual(driveCheckpointKey("workspace-a", null), driveCheckpointKey("workspace-b", null));
  assert.notEqual(driveCheckpointKey("workspace-a", null), driveCheckpointKey("workspace-a", "post-1"));
  assert.notEqual(driveCheckpointKey("workspace-a", "post-1"), driveCheckpointKey("workspace-a", "post-2"));
});

test("mobile Picker return is restricted to one saved Create Post UUID", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(safeDrivePickerReturnPath(`/create?id=${id}`), `/create?id=${id}`);
  assert.equal(
    driveMobilePickerResultPath(`/create?id=${id}`, { mediaIds: [id] }),
    `/create?id=${id}&drive_media=${id}`,
  );
  for (const path of [
    "/settings?id=123e4567-e89b-42d3-a456-426614174000",
    "/create?id=not-a-uuid",
    `/create?id=${id}&next=https://evil.test`,
    "https://evil.test/create?id=123e4567-e89b-42d3-a456-426614174000",
  ]) {
    assert.throws(() => safeDrivePickerReturnPath(path));
  }
});
