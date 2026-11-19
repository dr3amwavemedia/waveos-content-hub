import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizePostMetricObservations, linkObservationsToContent, nextBackfillRun, backfillWindow, observationToRow, rowToObservation, OBSERVATION_CONFLICT } from "../../src/lib/social-post-metrics.ts";
import { buildSocialPerformance, compareMetric, performanceEvidenceText, LEAD_ACTION_NOTE } from "../../src/lib/social-performance.ts";
import { confirmedLeadDedupeKey, normalizeConfirmedLead } from "../../src/lib/social-lead-conversions.ts";

const ig = { accountId: "acc-ig", platform: "instagram", name: "IG" };
const fb = { accountId: "acc-fb", platform: "facebook", name: "FB" };
const now = "2026-11-19T10:00:00.000Z";
const crossPost = {
  posts: [{
    latePostId: "late-1", publishedAt: "2026-11-10T12:00:00Z", status: "published",
    platforms: [
      { platform: "instagram", accountId: "acc-ig", platformPostId: "ig-1", status: "published", analytics: { reach: 100, likes: 0, clicks: 4 } },
      { platform: "facebook", accountId: "acc-fb", platformPostId: "fb-1", status: "published", analytics: { reach: 50, messages: 2 } },
    ],
  }],
};
const norm = (payload, account = ig, capturedAt = now) => normalizePostMetricObservations({ workspaceId: "w1", account, payload, capturedAt });

test("cross-posted copies are stored per account and never mixed", () => {
  const a = norm(crossPost, ig).observations; const b = norm(crossPost, fb).observations;
  assert.deepEqual(a.map((o) => o.providerPostId), ["ig-1", "ig-1", "ig-1"]);
  assert.ok(b.every((o) => o.providerPostId === "fb-1" && o.providerAccountId === "acc-fb"));
  const p = buildSocialPerformance({ observations: [...a, ...b], leads: [], backfillRuns: [], days: 30, endDate: "2026-11-19" });
  assert.equal(p.metrics.reach.value, 150); assert.equal(p.copyCount, 2);
});
test("missing metrics are not stored; reported zero is true zero", () => {
  const o = norm(crossPost, ig).observations;
  assert.equal(o.find((x) => x.metricKey === "likes").availability, "true_zero");
  assert.equal(o.some((x) => x.metricKey === "messages"), false);
  assert.equal(o.some((x) => x.metricKey === "saves"), false);
});
test("records without a real provider post id are skipped, never index ids", () => {
  const r = norm({ posts: [{ platform: "instagram", publishedAt: "2026-11-10", analytics: { reach: 9 } }] });
  assert.equal(r.observations.length, 0); assert.equal(r.skippedWithoutId, 1);
});
test("external single-target posts are stored unlinked", () => {
  const r = norm({ posts: [{ platform: "instagram", platformPostId: "ext-9", publishedAt: "2026-11-01", isExternal: true, reach: 7, mediaType: "REELS" }] });
  assert.equal(r.observations[0].contentType, "reel");
  const linked = linkObservationsToContent(r.observations, r.latePostIds, []);
  assert.equal(linked[0].contentItemId, undefined);
});
test("WaveOS copies link to content through publish attempts", () => {
  const r = norm(crossPost, ig);
  const linked = linkObservationsToContent(r.observations, r.latePostIds, [{ provider_post_id: "late-1", content_item_id: "c-1", request_snapshot: { waveosTarget: { variantId: "v-1" } } }]);
  assert.ok(linked.every((o) => o.contentItemId === "c-1" && o.postVariantId === "v-1"));
});
test("re-sync is idempotent: same identity, newest value wins", () => {
  const first = norm(crossPost, ig).observations;
  const later = norm(JSON.parse(JSON.stringify(crossPost).replace('"reach":100', '"reach":120')), ig, "2026-11-20T10:00:00.000Z").observations;
  const p = buildSocialPerformance({ observations: [...first, ...later], leads: [], backfillRuns: [], days: 30, endDate: "2026-11-20" });
  assert.equal(p.metrics.reach.value, 120); assert.equal(p.copyCount, 1);
  const row = observationToRow(first[0]); assert.deepEqual(rowToObservation(row).providerPostId, "ig-1");
  assert.equal(OBSERVATION_CONFLICT, "workspace_id,provider,platform,provider_account_id,provider_post_id,metric_key,granularity,window_start,window_end");
});
test("lead actions stay interactions and confirmed leads are separate", () => {
  const obs = [...norm(crossPost, ig).observations, ...norm(crossPost, fb).observations];
  const leads = [{ workspaceId: "w1", dedupeKey: "email:a@b.co", source: "manual", confirmedAt: "2026-11-12T00:00:00Z" }, { workspaceId: "w1", dedupeKey: "email:a@b.co", source: "manual", confirmedAt: "2026-11-13T00:00:00Z" }];
  const p = buildSocialPerformance({ observations: obs, leads, backfillRuns: [], days: 30, endDate: "2026-11-19" });
  assert.equal(p.leadActions.clicks.value, 4); assert.equal(p.leadActions.messages.value, 2); assert.equal(p.leadActions.combined, 6);
  assert.match(p.leadActions.note, /not unique people/); assert.equal(p.confirmedLeads.count, 1);
  assert.equal(LEAD_ACTION_NOTE.includes("sales"), true);
});
test("empty period stays unavailable, not zero, and explains the gap", () => {
  const p = buildSocialPerformance({ observations: [], leads: [], backfillRuns: [], days: 7, endDate: "2026-11-19" });
  assert.equal(p.metrics.reach.value, null); assert.equal(p.metrics.reach.availability, "not_synced");
  assert.equal(p.leadActions.combined, null); assert.ok(p.evidenceGaps.length);
  assert.match(performanceEvidenceText(p), /not synced yet/);
});
test("ranking and recommendations need comparable evidence", () => {
  const mk = (id, type, reach) => norm({ posts: [{ platform: "instagram", platformPostId: id, publishedAt: "2026-11-10", reach, mediaType: type }] }).observations;
  const few = buildSocialPerformance({ observations: [...mk("a", "image", 5), ...mk("b", "image", 9)], leads: [], backfillRuns: [], days: 30, endDate: "2026-11-19" });
  assert.equal(few.rankingMetric, null); assert.equal(few.best.length, 0); assert.equal(few.recommendations.length, 0);
  const many = ["1","2","3"].flatMap((n) => mk(`r${n}`, "reel", 100 + Number(n))).concat(["1","2","3"].flatMap((n) => mk(`p${n}`, "image", 10)));
  const p = buildSocialPerformance({ observations: many, leads: [], backfillRuns: [], days: 30, endDate: "2026-11-19" });
  assert.equal(p.rankingMetric, "reach"); assert.equal(p.best[0].providerPostId, "r3"); assert.equal(p.needsAttention.length, 3);
  assert.match(p.recommendations[0], /does not prove the cause/);
});
test("filters: platform, account and stories/reels", () => {
  const obs = [...norm(crossPost, ig).observations, ...norm(crossPost, fb).observations];
  assert.equal(buildSocialPerformance({ observations: obs, leads: [], backfillRuns: [], days: 30, endDate: "2026-11-19", filters: { accountId: "acc-fb" } }).metrics.reach.value, 50);
  assert.equal(buildSocialPerformance({ observations: obs, leads: [], backfillRuns: [], days: 30, endDate: "2026-11-19", filters: { contentType: "stories_reels" } }).copyCount, 0);
});
test("comparisons need values and complete coverage in both periods", () => {
  const a = { value: 10, coverage: "complete" }; const b = { value: 4, coverage: "complete" };
  assert.deepEqual(compareMetric(a, b), { comparable: true, change: 6 });
  assert.equal(compareMetric(a, { value: null, coverage: "unavailable" }).comparable, false);
  assert.equal(compareMetric(a, { value: 3, coverage: "partial" }).comparable, false);
});
test("backfill is capped at 365 days and tracks failure safely", () => {
  assert.deepEqual(backfillWindow("2026-11-19"), { start: "2025-11-20", end: "2026-11-19" });
  const ok = nextBackfillRun({ previous: null, today: "2026-11-19", nowIso: now, outcome: { kind: "page", stored: 3, oldestDay: "2026-01-02", hasMore: true } });
  assert.equal(ok.status, "partial"); assert.equal(ok.covered_range_start, "2026-01-02");
  const fail = nextBackfillRun({ previous: { attempts: 1 }, today: "2026-11-19", nowIso: now, outcome: { kind: "failed", availability: "permission_missing", safeMessage: "Reconnect" } });
  assert.equal(fail.status, "failed"); assert.equal(fail.attempts, 2); assert.ok(fail.next_retry_at > now);
});
test("confirmed lead dedupe keys", () => {
  assert.equal(confirmedLeadDedupeKey({ email: " A@B.co " }), "email:a@b.co");
  assert.equal(confirmedLeadDedupeKey({ phone: "(941) 555-0100" }), "phone:9415550100");
  assert.equal(confirmedLeadDedupeKey({ email: "not-an-email" }), null);
  assert.equal(normalizeConfirmedLead({ workspaceId: "w" }, "u"), null);
  assert.equal(normalizeConfirmedLead({ workspaceId: "w", email: "x@y.co" }, "u").source, "manual");
});

const sql = readFileSync(new URL("../../supabase/migrations/20261119020000_social_post_performance_storage.sql", import.meta.url), "utf8");
test("migration is additive with RLS, grants, uniqueness and no anon writes", () => {
  assert.doesNotMatch(sql, /\b(DROP TABLE|ALTER TABLE public\.(?!social_)|TRUNCATE|DELETE FROM|SECURITY DEFINER)/i);
  for (const t of ["social_post_metric_observations", "social_metric_backfill_runs", "social_lead_conversions"]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${t} FROM PUBLIC, anon`));
    assert.match(sql, new RegExp(`GRANT ALL ON public\\.${t} TO service_role`));
  }
  assert.doesNotMatch(sql, /TO anon/);
  assert.match(sql, /GRANT SELECT ON public\.social_post_metric_observations TO authenticated;/);
  assert.match(sql, /GRANT SELECT ON public\.social_metric_backfill_runs TO authenticated;/);
  assert.match(sql, /UNIQUE \(\s*workspace_id, provider, platform, provider_account_id, provider_post_id,\s*metric_key, granularity, window_start, window_end\s*\)/);
  assert.match(sql, /UNIQUE \(workspace_id, dedupe_key\)/);
  assert.match(sql, /UNIQUE \(\s*workspace_id, provider, platform, provider_account_id\s*\)/);
  assert.match(sql, /FOR UPDATE TO authenticated[\s\S]*USING[\s\S]*WITH CHECK/);
  assert.doesNotMatch(sql, /ON public\.social_post_metric_observations FOR (INSERT|UPDATE|DELETE)/);
});

import { parsePostPerformanceRequest, isPostPerformanceQuestion } from "../../src/lib/my-agent-performance-intent.ts";
test("My Agent follow-ups parse range, platform, focus and improved-draft requests", () => {
  assert.deepEqual(parsePostPerformanceRequest("best instagram reels last 90 days"), { days: 90, platform: "instagram", contentType: "reel", focus: "best", improvedDraft: false });
  assert.equal(parsePostPerformanceRequest("how many DMs this week").focus, "messages");
  assert.equal(parsePostPerformanceRequest("how many DMs this week").days, 7);
  assert.equal(parsePostPerformanceRequest("over the past year").days, 365);
  assert.equal(parsePostPerformanceRequest("create an improved draft").improvedDraft, true);
  assert.equal(isPostPerformanceQuestion("what were my best posts?"), true);
  assert.equal(isPostPerformanceQuestion("write a caption about coffee"), false);
});
