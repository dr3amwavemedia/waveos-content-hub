import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (p) => readFile(new URL(`../../${p}`, import.meta.url), "utf8");

test("Continue with Google is a real broker link that hydrated clicks hand to handleGoogle", async () => {
  const source = await read("src/routes/auth.tsx");
  assert.match(source, /<a\s[^>]*href="\/~oauth\/initiate\?provider=google"/);
  assert.match(source, /data-google-oauth-fallback/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /event\.preventDefault\(\);[\s\S]{0,80}void handleGoogle\(\)/);
});

test("root head fills the fallback link with a random-state broker URL", async () => {
  const source = await read("src/routes/__root.tsx");
  assert.match(source, /DOMContentLoaded/);
  assert.match(source, /a\[data-google-oauth-fallback\]/);
  assert.match(source, /provider:"google"/);
  assert.match(source, /redirect_uri:location\.origin\+"\/auth-callback"/);
  assert.match(source, /prompt:"select_account"/);
  assert.match(source, /new Uint8Array\(16\);crypto\.getRandomValues/);
});

test("hydrated Google sign-in keeps the direct workers.dev path", async () => {
  const source = await read("src/lib/google-auth.ts");
  assert.match(source, /usesDirectSupabaseOAuth\(window\.location\.origin\)/);
});
