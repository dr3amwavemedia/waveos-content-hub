import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsRoute = readFileSync("src/routes/_authenticated/settings.tsx", "utf8");

test("settings identifies Dream Wave staff without presenting a client tier", () => {
  assert.match(settingsRoute, /user\?\.isDreamWaveOwner[\s\S]*"Dream Wave Owner"/);
  assert.match(
    settingsRoute,
    /user\?\.isStaff \|\| activeWorkspace\.role === "staff"[\s\S]*"Dream Wave Team"/,
  );
  assert.match(settingsRoute, /activeWorkspace\.data_source === "os_data"/);
  assert.match(settingsRoute, /"Workspace Owner"[\s\S]*"Workspace Member"/);
});

test("settings falls back to the signed-in email when profile names are absent", () => {
  assert.match(
    settingsRoute,
    /filter\(Boolean\)\.join\(" "\) \|\| user\?\.email \|\| "—"/,
  );
});
