import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const server = read("src/lib/external-media.server.ts");
const callback = read("src/routes/api/external-media/$provider.callback.ts");
const status = read("src/routes/api/external-media/$provider.ts");

const DRIVE = "https://www.googleapis.com/auth/drive.file";
const hasDrive = (s) => (s ?? "").split(/\s+/).includes(DRIVE);

test("only the existing drive.file scope is requested", () => {
  assert.match(server, /GOOGLE_DRIVE_SCOPE = "https:\/\/www\.googleapis\.com\/auth\/drive\.file"/);
  assert.match(status, /scope: `openid email profile \$\{GOOGLE_DRIVE_SCOPE\}`/);
  assert.doesNotMatch(status, /auth\/drive"|drive\.readonly/);
});

test("partial consent without Drive access is rejected, not saved as connected", () => {
  assert.equal(hasDrive("openid https://www.googleapis.com/auth/userinfo.email"), false);
  const check = callback.indexOf("google_scope_required");
  const save = callback.indexOf(".upsert(");
  assert.ok(check > 0 && check < save);
});

test("stored scopes come from Google's granted token scope, not the request", () => {
  assert.match(callback, /scopes: typeof tokens\.scope === "string" \? tokens\.scope : ""/);
});

test("refresh re-checks granted scopes and marks reconnect when Drive was removed", () => {
  const refresh = server.slice(server.indexOf('grant_type: "refresh_token"'));
  assert.match(refresh, /classifyGoogleRefresh\(response\.status, body\)/);
  assert.match(refresh, /scopes: outcome\.scopes/);
});

test("status reports reconnect when stored scopes lack Drive access", () => {
  assert.match(status, /!hasRequiredDriveScope/);
  assert.match(status, /connected: Boolean\(connection\) && !reconnectRequired/);
});
