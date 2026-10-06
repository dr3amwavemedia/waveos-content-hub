import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("src/lib/external-media.server.ts", "utf8");
const startRoute = readFileSync("src/routes/api/external-media/$provider.ts", "utf8");
const callbackRoute = readFileSync("src/routes/api/external-media/$provider.callback.ts", "utf8");

test("external-media OAuth uses the same safe preview origin for authorization and callback", () => {
  assert.match(server, /host\.endsWith\("\.lovable\.app"\)/);
  assert.match(server, /externalMediaRedirectUri = \(/);
  assert.match(startRoute, /externalMediaRedirectUri\(provider, requestOrigin\)/);
  assert.match(callbackRoute, /const appUrl = externalMediaRequestOrigin\(request\)/);
  assert.match(callbackRoute, /externalMediaRedirectUri\(provider, appUrl\)/);
});

test("unknown hosts fall back to the configured WaveOS origin", () => {
  assert.match(server, /return configured/);
});
