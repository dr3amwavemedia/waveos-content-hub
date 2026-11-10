import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { drivePickerOutcome } from "../../src/lib/drive-picker-return.ts";

const source = readFileSync(new URL("../../src/routes/_authenticated/create.tsx", import.meta.url), "utf8");
const picker = source.slice(source.indexOf("function GoogleDrivePicker("), source.indexOf("function isGoogleDriveMedia("));
const startRoute = readFileSync(new URL("../../src/routes/api/external-media/$provider.ts", import.meta.url), "utf8");
const callbackRoute = readFileSync(new URL("../../src/routes/api/external-media/$provider.callback.ts", import.meta.url), "utf8");

test("Picker callbacks keep cancel, provider error and empty selection distinct without import", () => {
  const body = picker.slice(picker.indexOf('          if (currentAttempt !== attempt.current) return;', picker.indexOf('.setCallback(')), picker.indexOf('          closePicker();\n          try {'));
  for (const [action, expected] of [['cancel', 'cancel'], ['error', 'problem'], ['picked', 'no files']]) {
    let result = '';
    new Function('data', 'currentAttempt', 'attempt', 'drivePickerOutcome', 'cancelPicker', 'closePicker', 'setOpenError', body)(
      { action, docs: [] }, 1, { current: 1 }, drivePickerOutcome,
      () => { result = 'cancel'; }, () => {}, (message) => { result = message; },
    );
    assert.ok(result.includes(expected), `${action} must report its specific outcome`);
  }
});

test("Google authentication is not dismissed by elapsed time or foreground events", () => {
  const start = picker.indexOf('  useEffect(() => {\n    if (pickerOpen)');
  assert.ok(start > 0);
  const effects = picker.slice(start, picker.indexOf("  async function openPicker()"));
  const listeners = [];
  const timers = [];
  let closes = 0;
  const window = {
    addEventListener: (name, callback) => listeners.push(callback),
    removeEventListener() {},
    setTimeout: (callback) => timers.push(callback),
    clearTimeout() {},
  };
  const document = { visibilityState: "visible", querySelector: () => null, body: { setAttribute() {}, removeAttribute() {} }, ...window };
  const useEffect = (callback) => { callback(); };
  new Function("useEffect", "pickerRef", "window", "document", "pickerOpen", "isStandaloneIos", "closePicker", "setOpenError", "attempt", effects)(
    useEffect, { current: { setVisible: () => { closes++; } } }, window, document,
    true, true, () => { closes++; }, () => {}, { current: 1 },
  );
  for (const callback of [...timers, ...listeners]) callback();
  assert.equal(closes, 0);
});

test("unmount invalidates a pending Picker open and hides an existing instance", () => {
  const start = picker.indexOf('  useEffect(() => () => {');
  assert.ok(start > 0);
  const effect = picker.slice(start, picker.indexOf('  // Google owns', start));
  const attempt = { current: 7 };
  let cleanup;
  let hidden = 0;
  new Function('useEffect', 'attempt', 'pickerRef', effect)(
    (callback) => { cleanup = callback(); }, attempt,
    { current: { setVisible: (visible) => { assert.equal(visible, false); hidden++; } } },
  );
  cleanup();
  assert.equal(attempt.current, 8);
  assert.equal(hidden, 1);
});

test("denied draft checkpoint storage never prevents workspace token issuance", async () => {
  // Execute the production opening preflight, stopping before Google SDK setup.
  const preflight = picker.slice(picker.indexOf("    setOpening(true);"), picker.indexOf("      await loadGooglePickerScript();"));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let requestedWorkspace = null;
  let notice = null;
  const run = new AsyncFunction("setOpening", "setOpenError", "setNotice", "attempt", "driveReturn", "getGooglePickerToken", "workspaceId",
    `${preflight}\nreturn config; } catch (error) { throw error; }`);
  const config = await run(() => {}, () => {}, (value) => { notice = value; }, { current: 0 },
    { checkpoint: () => { throw new Error("Storage denied"); } },
    async (workspace) => { requestedWorkspace = workspace; return { accessToken: "synthetic-token" }; }, "workspace-a");
  assert.equal(requestedWorkspace, "workspace-a");
  assert.equal(config.accessToken, "synthetic-token");
  assert.ok(notice);
});

test("installed iPhone flow uses Google's top-level mobile Picker with a saved return", () => {
  assert.match(picker, /startGoogleDriveMobilePicker/);
  assert.match(picker, /Choose Drive files/);
  assert.doesNotMatch(picker, /Save draft & choose Drive files/);
  assert.match(picker, /Choose files in Safari, then return to this post/);
  assert.match(startRoute, /trigger_onepick/);
  assert.match(startRoute, /allow_multiple/);
  assert.match(startRoute, /scope: mobilePicker \? GOOGLE_DRIVE_SCOPE/);
});

test("mobile Drive errors are customer-friendly instead of exposing internal state codes", () => {
  const hook = readFileSync(new URL("../../src/hooks/use-external-media.ts", import.meta.url), "utf8");
  assert.match(hook, /oauth_state_failed: "Google Drive could not start\. Please try again\."/);
  assert.doesNotMatch(picker, />\{openError\}<\/p>.*oauth_state_failed/s);
});

test("mobile Picker callback binds the connected account and validates selected IDs server-side", () => {
  assert.match(callbackRoute, /about\?fields=user\(emailAddress\)/);
  assert.match(callbackRoute, /google_account_mismatch/);
  assert.match(callbackRoute, /picked_file_ids/);
  assert.match(callbackRoute, /supportsAllDrives/);
  assert.match(callbackRoute, /selection_flow: "google_mobile_picker"/);
});
