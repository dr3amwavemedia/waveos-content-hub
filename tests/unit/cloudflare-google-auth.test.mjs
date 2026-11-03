import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { usesDirectSupabaseOAuth } from "../../src/lib/auth-oauth-origin.ts";

test("only HTTPS workers.dev origins bypass the Lovable OAuth broker", () => {
  assert.equal(usesDirectSupabaseOAuth("https://waveos.jean-69e.workers.dev"), true);
  assert.equal(usesDirectSupabaseOAuth("https://waveos.dreamwavemedia.co"), false);
  assert.equal(usesDirectSupabaseOAuth("https://preview.lovable.app"), false);
  assert.equal(usesDirectSupabaseOAuth("https://workers.dev.example.com"), false);
  assert.equal(usesDirectSupabaseOAuth("http://waveos.jean-69e.workers.dev"), false);
  assert.equal(usesDirectSupabaseOAuth("not a url"), false);
});

test("Cloudflare Google auth uses Supabase with the exact callback while Lovable remains available", async () => {
  const source = await readFile(new URL("../../src/lib/google-auth.ts", import.meta.url), "utf8");
  assert.match(source, /usesDirectSupabaseOAuth\(window\.location\.origin\)/);
  assert.match(source, /supabase\.auth\.signInWithOAuth/);
  assert.match(source, /provider: "google"/);
  assert.match(source, /redirectTo/);
  assert.match(source, /return lovable\.auth\.signInWithOAuth/);
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE/);
});
