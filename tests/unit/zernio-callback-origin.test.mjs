import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serverSource = readFileSync(
  new URL("../../src/lib/zernio.server.ts", import.meta.url),
  "utf8",
);
const functionsSource = readFileSync(
  new URL("../../src/lib/zernio.functions.ts", import.meta.url),
  "utf8",
);
const socialSource = readFileSync(
  new URL("../../src/routes/_authenticated/social.tsx", import.meta.url),
  "utf8",
);

test("Zernio callbacks prefer the public WaveOS URL and strip stale paths", () => {
  assert.match(serverSource, /normalizeWaveOsPublicOrigin\(process\.env\.WAVEOS_APP_URL\)/);
  assert.match(serverSource, /return parsed\.origin/);
  assert.doesNotMatch(serverSource, /WAVEOS_APP_URL\s*\?\?\s*process\.env\.APP_BASE_URL/);
  assert.match(functionsSource, /waveOsPublicOrigin\(\).*social-connections\/callback/s);
  assert.doesNotMatch(functionsSource, /const appBaseUrl = \(process\.env\.APP_BASE_URL/);
});

test("Instagram prefers Facebook Page login and mobile OAuth preserves the WaveOS page", () => {
  assert.match(functionsSource, /params\.set\("loginMethod", data\.instagramLoginMethod\)/);
  assert.match(functionsSource, /"instagram_login" \| "facebook_login"/);
  assert.match(socialSource, /Android\|iPhone\|iPad\|iPod/);
  assert.match(socialSource, /waveos-zernio-connect/);
  assert.match(socialSource, /oauthWindow\.location\.replace\(result\.url\)/);
  assert.match(socialSource, /waveos:pending-social-oauth/);
  assert.match(socialSource, /Use direct Instagram login instead/);
  assert.match(socialSource, /account\.platform === "instagram" \? "facebook_login" : undefined/);
});

test("workspace branding exposes coordinated dashboard palette variables", () => {
  const brandingSource = readFileSync(
    new URL("../../src/hooks/use-workspace-branding.ts", import.meta.url),
    "utf8",
  );
  for (const tone of ["primary", "secondary", "tertiary", "highlight", "success"]) {
    assert.match(brandingSource, new RegExp(`--workspace-tone-${tone}`));
  }
});
