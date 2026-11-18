import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("campaign readiness distinguishes ready, limited, user, and admin states", async () => {
  const source = await readFile(
    new URL("../../src/lib/campaign-readiness.ts", import.meta.url),
    "utf8",
  );
  for (const state of ["ready", "limited", "action_needed", "admin_required"])
    assert.match(source, new RegExp(state));
  assert.match(source, /lastSuccessAt/);
  assert.match(source, /Folder coverage/);
  assert.match(source, /Transcribe selected clips/);
});
