import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wrangler = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));

test("Cloudflare deploy owns only the WaveOS production hostname", () => {
  assert.deepEqual(wrangler.routes, [
    {
      pattern: "waveos.dreamwavemedia.co",
      custom_domain: true,
    },
  ]);
});
