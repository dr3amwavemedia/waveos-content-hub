import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const client = fs.readFileSync(path.join(root, "src/integrations/supabase/client.ts"), "utf8");
const durableStorage = fs.readFileSync(
  path.join(root, "src/integrations/supabase/durableAuthStorage.ts"),
  "utf8",
);
const rootRoute = fs.readFileSync(path.join(root, "src/routes/__root.tsx"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.webmanifest"), "utf8"));

test("browser auth sessions persist and refresh automatically", () => {
  assert.match(client, /persistSession:\s*true/);
  assert.match(client, /autoRefreshToken:\s*true/);
  assert.match(client, /durableBrowserAuthStorage\(brokeredPreviewStorage\(\)\)/);
});

test("durable storage preserves existing sessions and clears both copies on sign-out", () => {
  assert.match(durableStorage, /const existing = await baseStorage\.getItem\(key\)/);
  assert.match(durableStorage, /void writeBackup\(key, existing\)/);
  assert.match(durableStorage, /await baseStorage\.setItem\(key, recovered\)/);
  assert.match(durableStorage, /await baseStorage\.removeItem\(key\)/);
  assert.match(durableStorage, /await removeBackup\(key\)/);
});

test("mobile home-screen and suspended tabs resume near-expiry sessions", () => {
  assert.match(rootRoute, /visibilitychange/);
  assert.match(rootRoute, /pageshow/);
  assert.match(rootRoute, /window\.addEventListener\("online"/);
  assert.match(rootRoute, /supabase\.auth\.refreshSession\(\)/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/home");
});
