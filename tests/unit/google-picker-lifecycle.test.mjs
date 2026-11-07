import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { drivePickerOutcome } from "../../src/lib/drive-picker-return.ts";

const source = readFileSync(new URL("../../src/routes/_authenticated/create.tsx", import.meta.url), "utf8");
const picker = source.slice(source.indexOf("function GoogleDrivePicker("), source.indexOf("function isGoogleDriveMedia("));

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
  const effects = picker.slice(picker.indexOf("  useEffect(() => () => pickerRef"), picker.indexOf("  async function openPicker()"));
  const listeners = [];
  const timers = [];
  let closes = 0;
  const window = {
    addEventListener: (name, callback) => listeners.push(callback),
    removeEventListener() {},
    setTimeout: (callback) => timers.push(callback),
    clearTimeout() {},
  };
  const document = { visibilityState: "visible", querySelector: () => null, ...window };
  const useEffect = (callback) => { callback(); };
  new Function("useEffect", "pickerRef", "window", "document", "pickerOpen", "isStandaloneIos", "closePicker", "setOpenError", effects)(
    useEffect, { current: { setVisible: () => { closes++; } } }, window, document,
    true, true, () => { closes++; }, () => {},
  );
  for (const callback of [...timers, ...listeners]) callback();
  assert.equal(closes, 0);
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