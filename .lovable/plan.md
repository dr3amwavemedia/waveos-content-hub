# WaveOS pre-publish audit at GitHub commit 46ae5443, and fix plan

The working tree matches 46ae54430ddc90fea153dfbad9d6c5e96dd71b71 exactly, with no local changes.

## BLOCKER
1. **The production build fails, and Trending Now crashes in the preview.**
   - Where: `src/lib/trending-now.functions.ts` line 12, column 127.
   - The commit contains a literal `\n` (backslash plus "n") instead of a real line break, before `const connectionKey:string=key;`.
   - Effects:
     - The type check fails (TS1127 "Invalid character").
     - The production build fails with "Expecting Unicode escape sequence".
     - `/trending-now` shows "WaveOS could not open this screen".
   - Fix: replace that `\n` with a real line break. No other change.

## HIGH
2. **Several tables in the database change files do not exist in the live database.**
   - `supabase/migrations/20261014121000_phase1_foundation_tables.sql` (and the 20261014120000 file before it) create these tables, all absent live: `workflow_drafts`, `creative_designs`, `competitors`, `product_releases`, `release_user_states`, `social_intelligence_profiles`, `campaign_plans`.
   - The app already reads them:
     - `src/routes/_authenticated/creative-studio.tsx` lines 196, 221 and 231
     - `src/hooks/use-workflow-draft.ts` lines 39 and 59
     - `src/hooks/use-product-releases.ts`
   - Effects:
     - Home and Creative Studio show 404 errors in the console.
     - Saving designs or drafts and showing release notes cannot work after publishing.
   - The database's change log lists 44 applied changes, while the project has 137 change files. Before applying anything, each pending file needs reviewing to check it is additive only.
   - Fix: needs your approval. Review and apply only the two Oct 14 files, as additive changes. Alternatively, keep those features hidden or failing gracefully until they are applied.
3. **The test Stripe key is missing** (`WAVEOS_STRIPE_TEST_SECRET_KEY`). The live `STRIPE_SECRET_KEY` and the webhook secret are both set.
   - Safe-mode payments that expect the test key may fall back to the live key or fail.
   - Fix: confirm which key safe mode should use before publishing. No code change until confirmed.

## MEDIUM
4. **Social** (`/social`): one "Failed to fetch" error from the database connection while the page loads. The page still rendered. Likely a cancelled or failed background request; needs a retry check, not a blocker.
5. **Deliveries** (`/deliveries`): one 401 (unauthorized) response while loading. The page rendered "Your Content". Likely a permission-checked request for content this account cannot see; check that the screen handles it quietly.
6. **Live Trending Now smoke test**: it couldn't run against the app at this commit because of the blocker. At 87bb8456 plus the type fix, the same search kept 12 usable TikTok videos, all with thumbnails, and dropped no links. Dead links were confirmed to return 400 from TikTok. Re-run after fixing the blocker.

## LOW
7. The Content Security Policy notice about "upgrade-insecure-requests" being ignored appears on every page. This is harmless noise.
8. The saved browser keys are scoped to the workspace or session (`waveos.active-workspace`, `waveos-research-<workspace>`, `waveos.gallery.layout`, `waveos:pending-social-oauth`). None would hide new screens. No stale-key problem found.

## Passed
- All 195 unit tests pass.
- The phone layout at 430×786 was checked on Home, Create Post, Creative Studio, Social, Analytics, Deliveries and Payments:
  - no sideways scrolling;
  - the header and bottom bar are present;
  - no fixed buttons overlap the bottom bar.
- Connection keys present: research, AI, Zernio, live Stripe, Stripe webhook, SignWell.
- No production-write paths were triggered during the audit.

## Not fully covered (say if you want these done)
- Role-by-role permission checks for admin, staff, DWM, public, client and wedding accounts. Only the signed-in owner account was exercised. This needs test accounts for each role.
- Safe-area insets were checked visually only, not on a real device.

## Proposed next steps (after approval)
1. Fix the BLOCKER: one character change at line 12. Then re-run the type check, production build, unit tests and the live Trending Now smoke test, including the thumbnail and dead-link counts.
2. Report the exact pending database changes for item 2 and wait for separate approval before applying any.
3. No publishing, deploying or database writes as part of this plan.
