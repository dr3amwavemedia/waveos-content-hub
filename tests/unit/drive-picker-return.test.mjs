import assert from "node:assert/strict";
import test from "node:test";
import { driveBrowserReturnUrl, driveCheckpointKey, drivePickerOutcome, isIosHomeScreen, safariOpenUrl } from "../../src/lib/drive-picker-return.ts";

test("only installed iOS uses the Safari fallback, including desktop-mode iPads", () => {
  assert.equal(isIosHomeScreen({ userAgent: "iPhone", standalone: true }, false), true);
  assert.equal(isIosHomeScreen({ userAgent: "iPhone" }, false), false);
  assert.equal(isIosHomeScreen({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 5 }, true), true);
  assert.equal(isIosHomeScreen({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 0 }, true), false);
  assert.equal(isIosHomeScreen({ userAgent: "Android" }, true), false);
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