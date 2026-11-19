# Trustworthy Social Content Performance Analytics — Phased Plan (audit of f9c96aa)

Plan only. No files, database, drafts, merges, publishing or production touched.

## 1. Current architecture and gaps (verified in repo at f9c96aa)

What exists and should be extended, not duplicated:
- `src/lib/analytics-transparency.ts` — metric keys (followers, impressions, reach, likes, comments, shares, saves, clicks, messages, views, storyViews), availability states (`available`, `true_zero`, `not_synced`, `permission_missing`, `connection_expired`, `sync_failed`, `unsupported`), source parsing, error classification, coverage combination, `extractContentLeadSignals` / `mergeContentLeadSignals`, calculation version `waveos-provider-post-records-v2`.
- `src/lib/zernio.functions.ts` `getZernioAnalytics` — live reads of `/analytics` (organic, external) and `/ads` (paid); writes workspace-level daily observations to `social_intelligence_snapshots`; backfill state kept in `social_intelligence_profiles.metadata.historicalBackfill`.
- `social_intelligence_snapshots` — workspace/profile-level rows (metric_key, value, availability, range, provider, source_reference, calculation_version, evidence JSON). No post, account or platform column.
- `src/lib/analytics-history.ts` — series and equal-period comparison helpers.
- `src/lib/my-agent-analytics.ts` + `my-agent-actions.functions.ts` — My Agent reads snapshots and selects one value per metric/period.
- `src/lib/campaign-ideas.functions.ts` — reads profiles/snapshots for campaign context.
- `src/lib/live-posts.server.ts` + `components/social/live-posts-library.tsx` — Published Posts merged by platform + account + platform post id; account-scoped `/analytics` per post.
- UI: `components/social/analytics-checkup.tsx` (Analytics), `components/app/ocean-intelligence-dashboard.tsx` (Overview intelligence), `components/campaign/*` (Campaign Manager), `routes/_authenticated/{analytics,social,campaigns,my-agent}.tsx`.

Gaps:
1. No per-post, per-account stored metrics. Post performance is fetched live and only workspace totals are stored, so My Agent and Campaigns cannot use the same per-post evidence as the UI.
2. Lead signals (clicks + message starts) are computed per request and never stored, so their history and freshness cannot be cited.
3. No confirmed-lead/conversion model; nothing separates "lead action" from "confirmed lead".
4. Backfill status sits in profile metadata JSON per workspace, not per account/metric; initial backfill asks for about 2 years, while the goal is up to 1 year supported by the provider.
5. No provider capability matrix; `unsupported` is decided from errors after the fact instead of a declared per-platform/content-type table.
6. Stories/reels are not a distinct content type (`storyViews` is only a metric key).
7. Campaign reporting has no deterministic post-to-campaign rollup with cross-post dedupe.
8. Range selector does not offer 7/30/90/180/365 consistently against stored history.

Unconfirmed (check in Phase 1): exactly which per-post fields Zernio returns for each platform, and whether `campaign_plan_items` reliably links to `content_items` / provider post IDs.

## 2. Six phases

Phase 1 — Contract and capability foundation (no schema, no UI). Pure TypeScript normalized contract, provider capability matrix, identity key builder, dedupe/rollup functions, lead-action vs confirmed-lead types, tests. Depends on nothing.

Phase 2 — Storage (additive only). New tables `social_post_metric_observations`, `social_metric_backfill_runs`, `social_lead_conversions`, with grants, RLS and indexes. One standalone additive migration; existing tables unchanged. Depends on Phase 1.

Phase 3 — Ingestion and backfill. Extend the existing `getZernioAnalytics` / live-posts sync to upsert per-post observations with the Phase 1 identity; per-account 365-day backfill runs with resumable windows; scheduled refresh through the existing `maintain-social-operations` hook. Keep workspace snapshot writes for compatibility. Depends on Phase 2.

Phase 4 — Social Posts and Analytics UI. Per-post metric cards with availability chips, cross-post breakdown, 7/30/90/180/365 ranges, backfill health panel, lead actions labelled as interactions. Separate web and mobile layouts. Depends on Phase 3.

Phase 5 — Campaign Manager and Overview. Campaign rollup across posts and stories with dedupe, coverage and honest, evidence-cited recommendations (shown only when coverage is sufficient). Overview tiles read the same stored rollups. Depends on Phase 3; can run alongside Phase 4.

Phase 6 — My Agent and confirmed leads. My Agent reads the same stored observations through a shared evidence selector that cites period, source, freshness and coverage, and refuses when data is missing. Manual confirmed-lead entry/link (optional source post) with dedupe. Depends on Phases 3–5.

## 3. Normalized data contract

Observation (one row per post copy x metric x window):
- workspace_id, social_connection_id / provider account id, platform, provider ("zernio"), provider_post_id, content_item_id (nullable), post_variant_id (nullable), content_type (post | reel | story | video | carousel | short)
- metric_key (Phase 1 key set + `leads_confirmed` excluded — that lives in conversions)
- value (nullable), availability (existing enum strings), window_start, window_end, granularity (lifetime | daily)
- source_reference, calculation_version, captured_at, provider_data_as_of, evidence JSON (no tokens)

Upsert identity (unique): `(workspace_id, platform, provider_account_id, provider_post_id, metric_key, granularity, window_start, window_end)`. Cross-posted copies differ by platform/account/post id, so they never collapse; rollups sum distinct identities only.

Backfill runs: workspace_id, provider_account_id, platform, requested range, covered range, status (queued | running | partial | complete | failed | unsupported), safe_message, last_attempt_at, next_retry_at.

Confirmed leads (`social_lead_conversions`): workspace_id, dedupe_key (normalized email/phone hash or CRM contact id), crm_contact_id/crm_account_id (nullable), attributed provider post identity (nullable), source (manual | crm | form), confirmed_by, confirmed_at. Unique `(workspace_id, dedupe_key)`. Lead actions stay metrics; confirmed leads count only here.

RLS:
- SELECT for authenticated workspace members via existing `is_workspace_member` / `can_access_workspace_feature`.
- Observation and backfill writes only from server code (service role after an authorized check); no client INSERT/UPDATE.
- Conversions: insert/update by workspace managers via existing `can_manage_workspace_feature`; members read.
- Grants: SELECT to authenticated, ALL to service_role; no anon.

## 4. Provider capability model

Static versioned matrix in code: `platform x content_type x metric -> supported | supported_with_permission | not_supported`, plus max history days and lifetime vs daily. Effective availability per value is computed as: matrix says not_supported -> `unsupported`; connection expired -> `connection_expired`; missing scope -> `permission_missing`; fetch failed -> `sync_failed`; not yet fetched -> `not_synced`; provider value 0 and metric supported -> `true_zero`; otherwise `available`. Matrix entries start conservative (unknown = not claimed) and are confirmed against real provider responses in Phase 3.

## 5. Screens and components per phase

- Phase 1: none (lib + tests only).
- Phase 2: none.
- Phase 3: none visible; `zernio.functions.ts`, `live-posts.server.ts`, `routes/api/public/hooks/maintain-social-operations.ts`.
- Phase 4: `components/social/live-posts-library.tsx`, `components/social/analytics-checkup.tsx`, `routes/_authenticated/social.tsx`, `routes/_authenticated/analytics.tsx` (web and mobile variants kept separate).
- Phase 5: `components/campaign/desktop-campaign-manager.tsx`, `mobile-campaign-manager.tsx`, `campaign-readiness-panel.tsx`, `use-campaign-manager.ts`, `components/app/ocean-intelligence-dashboard.tsx`, `layer1-overview.tsx`, `mobile-command-center.tsx`.
- Phase 6: `routes/_authenticated/my-agent.tsx`, `lib/my-agent-analytics.ts`, `lib/my-agent-actions.functions.ts`, CRM contact views for confirming leads.

## 6. Verification and rollback gates

Every phase: full unit suite, typecheck, build; no changes to payments, publishing, permissions, or existing rows.
- P1: tests for identity, dedupe of cross-posts, true zero vs unsupported, lead actions never counted as people, capability resolution.
- P2: migration is additive only; read-only checks of grants/RLS; cross-workspace read denied in test. Rollback: drop the three new tables (nothing else references them).
- P3: ingestion behind a server-side flag; dry-run on one internal workspace; compare stored totals with live provider totals; idempotent re-run produces no duplicates. Rollback: turn flag off; existing snapshot path unchanged.
- P4/P5: signed-in desktop 1280 and phone 390 screenshots; missing data visibly different from 0; campaign total equals sum of distinct copies. Rollback: UI falls back to current live view.
- P6: My Agent answers cite period/source/freshness/coverage and say "unavailable" on missing data; conversion dedupe tests. Rollback: My Agent selector reverts to current snapshot reader.

## 7. Phase 1 build scope (one draft, no production impact)

- New `src/lib/social-metrics-contract.ts`: types for observation, identity key builder, content types, `LeadAction` vs `ConfirmedLead` types.
- New `src/lib/social-provider-capabilities.ts`: conservative matrix and `resolveMetricAvailability()`.
- New `src/lib/social-metrics-rollup.ts`: dedupe by identity, rollup by range (7/30/90/180/365), coverage calculation reusing `combineAnalyticsMetric` semantics.
- Reuse metric keys/availability from `analytics-transparency.ts` (no new parallel enum).
- `tests/unit/social-metrics-contract.test.mjs` covering the rules above.
- `AGENTS.md` rule: per-post metrics use one identity key and the shared capability matrix.
- No migrations, no server-function or UI changes, no provider calls.
