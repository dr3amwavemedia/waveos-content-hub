import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Create Post uses direct Post now and Post later actions", async () => {
  const page = await read("src/routes/_authenticated/create.tsx");
  assert.match(page, /Post now/);
  assert.match(page, /Post later/);
  assert.match(page, /!scheduledAt \|\| !canSchedule/);
  assert.doesNotMatch(page, /Send for approval/);
  assert.doesNotMatch(page, /Send schedule for approval/);
  assert.match(page, /Camera roll/);
  assert.match(page, /type="file"/);
  assert.match(page, /image\/jpeg,image\/png,video\/mp4,video\/quicktime/);
});

test("staff approval bypass is checked and recorded in the database", async () => {
  const migration = await read(
    "supabase/migrations/20261003133000_staff_direct_content_release.sql",
  );
  assert.match(migration, /can_staff_manage_workspace/);
  assert.match(migration, /social_subscription_is_active/);
  assert.match(migration, /social_media_staff_required/);
  assert.match(migration, /authorized_social_media_staff/);
  assert.match(migration, /content_release_mode_selected/);
  assert.match(migration, /_release_mode = 'approval'/);
});
