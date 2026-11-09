import test from "node:test";
import assert from "node:assert/strict";
import { canManageContentReview, reviewItemPatch, reviewVariantCaption, orderedPostMedia } from "../../src/lib/content-review.ts";

test("only owners and admins get review edit override, not staff creators", () => {
  assert.equal(canManageContentReview(["dream_wave_owner"], null), true);
  assert.equal(canManageContentReview([], "admin"), true);
  assert.equal(canManageContentReview([], "owner"), true);
  for (const role of ["editor", "approver", "viewer", null]) assert.equal(canManageContentReview(["dream_wave_team"], role), false);
});
test("review edit keeps approval identity and state while replacing caption/media/schedule", () => {
  const original = { id: "post-1", status: "in_review", metadata: { approval_request: { submitted_by: "staff", submitted_at: "original" }, campaign: "keep" } };
  const edited = { ...original, ...reviewItemPatch({ title: "New title", caption: "Admin caption", mediaIds: ["c", "a"], scheduledAt: "2026-11-11T15:30:00Z" }, original.metadata, "admin", "2026-11-09T17:00:00Z") };
  assert.equal(edited.id, "post-1"); assert.equal(edited.status, "in_review");
  assert.equal(edited.primary_caption, "Admin caption"); assert.deepEqual(edited.media_asset_ids, ["c", "a"]);
  assert.equal(edited.scheduled_at, "2026-11-11T15:30:00Z");
  assert.equal(edited.metadata.approval_request.submitted_by, "staff"); assert.equal(edited.metadata.approval_request.action, "schedule");
  assert.equal(edited.metadata.review_edit.edited_by, "admin"); assert.equal(edited.metadata.campaign, "keep");
});
test("publishing uses saved order and never includes removed photo", () => {
  assert.deepEqual(orderedPostMedia(["c", "a"], [{ id: "a" }, { id: "b" }, { id: "c" }]).map(row => row.id), ["c", "a"]);
  assert.throws(() => orderedPostMedia(["missing"], [{ id: "a" }]));
});
test("latest base caption replaces old linked variant but preserves explicit adaptations", () => {
  assert.equal(reviewVariantCaption("Admin caption", "Staff caption", "Staff caption"), "Admin caption");
  assert.equal(reviewVariantCaption("Admin caption", "Staff caption", "Custom platform"), "Custom platform");
  assert.equal(reviewVariantCaption("Admin caption", "Staff caption", "Custom platform", "Admin platform edit"), "Admin platform edit");
});