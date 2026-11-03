import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wrangler = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));

test("Cloudflare deploy keeps staging enabled without an unmanaged zone route", () => {
  assert.equal(wrangler.workers_dev, true);
  assert.equal("route" in wrangler, false);
  assert.equal("routes" in wrangler, false);
});
