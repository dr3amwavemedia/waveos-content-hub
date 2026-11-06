import assert from "node:assert/strict";
import test from "node:test";
import { classifyGoogleRefresh } from "../../src/lib/google-refresh-outcome.ts";

const DRIVE = "https://www.googleapis.com/auth/drive.file";

test("omitted scope keeps the connection and stored scopes", () => {
  assert.deepEqual(classifyGoogleRefresh(200, { access_token: "a", expires_in: 3600 }), { kind: "ok", accessToken: "a", scopes: null });
  assert.deepEqual(classifyGoogleRefresh(200, { access_token: "a", scope: "  " }), { kind: "ok", accessToken: "a", scopes: null });
});

test("scope including drive.file is accepted and recorded", () => {
  const r = classifyGoogleRefresh(200, { access_token: "a", scope: `openid ${DRIVE}` });
  assert.equal(r.kind, "ok");
  assert.equal(r.scopes, `openid ${DRIVE}`);
});

test("explicit scope list without drive.file requires reconnect", () => {
  const r = classifyGoogleRefresh(200, { access_token: "a", scope: "openid https://www.googleapis.com/auth/userinfo.email" });
  assert.equal(r.kind, "insufficient_scope");
  assert.equal(classifyGoogleRefresh(200, { access_token: "a", scope: "https://www.googleapis.com/auth/drive.file.extra" }).kind, "insufficient_scope");
});

test("revoked or invalid grant requires reconnect", () => {
  assert.equal(classifyGoogleRefresh(400, { error: "invalid_grant" }).kind, "reconnect");
  assert.equal(classifyGoogleRefresh(401, { error: "invalid_client" }).kind, "reconnect");
});

test("transient refresh errors never disconnect", () => {
  for (const [s, b] of [[500, {}], [503, null], [429, { error: "rate_limit" }], [400, { error: "invalid_request" }], [200, null], [200, {}]]) {
    assert.equal(classifyGoogleRefresh(s, b).kind, "temporary", `${s}`);
  }
});
