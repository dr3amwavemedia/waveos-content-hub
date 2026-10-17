import { test } from "node:test";
import assert from "node:assert/strict";
import { pickOneTimeUpdate } from "../../src/lib/product-release-audience.ts";

const r = (id, state = null) => ({ id, state });
const seen = { viewed_at: "2026-10-17", dismissed_at: null, acknowledged_at: null };
const dismissed = { viewed_at: "2026-10-17", dismissed_at: "2026-10-17", acknowledged_at: null };

test("WaveOS SaaS user with no stored state sees the release once", () => {
  assert.equal(pickOneTimeUpdate([r("v2")], "os_data")?.id, "v2");
});
test("dismissed release never auto-shows again", () => {
  assert.equal(pickOneTimeUpdate([r("v2", dismissed)], "os_data"), null);
});
test("viewed release never auto-shows again", () => {
  assert.equal(pickOneTimeUpdate([r("v2", seen)], "os_data"), null);
});
test("a newer release shows even after an older one was dismissed", () => {
  assert.equal(pickOneTimeUpdate([r("v3"), r("v2", dismissed)], "os_data")?.id, "v3");
});
test("DWM client workspaces never get the popup", () => {
  assert.equal(pickOneTimeUpdate([r("v2")], "client_data"), null);
});
