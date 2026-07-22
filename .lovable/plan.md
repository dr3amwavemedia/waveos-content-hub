## Confirmed issue
The public `/auth` page renders, but React crashes before click handlers can run. A browser check on the published URL shows this runtime error:

`Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY`

That means the Google button is visually present but dead because the published frontend bundle did not hydrate.

## Plan
1. **Verify env wiring in the app bundle**
   - Inspect the generated backend auth client import path and the app config usage.
   - Confirm the client is reading the correct public build-time variables for Lovable Cloud.

2. **Patch only the auth/runtime config failure**
   - Update the relevant frontend-safe environment fallback so the published bundle can initialize auth correctly.
   - Do not change invite tiers, admin approval, workspace routing, or database policies in this pass.

3. **Verify locally against production-like behavior**
   - Run a focused browser check on `/auth` after the patch.
   - Confirm the Google button has an active click handler and no hydration crash.

4. **Publish the repaired build**
   - The latest security scan currently shows no unresolved findings, so publishing should no longer be blocked.
   - After publish, re-check `https://waveos-content-hub.lovable.app/auth` and confirm clicking **Continue with Google** opens/starts the Google OAuth flow instead of doing nothing.

## Success criteria
- Public `/auth` has no missing-env runtime crash.
- **Continue with Google** is clickable on the public link.
- The flow starts Google/Lovable OAuth and returns signed-in users toward `/home`.