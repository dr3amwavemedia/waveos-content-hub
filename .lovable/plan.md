## Diagnosis so far

- OAuth server config is correct: Site URL is `https://waveos-content-hub.lovable.app` and the published origin is in the allow-list, so this is **not** a redirect-URI issue.
- On the published `/auth` page, the "Continue with Google" button HTML is present but has **no click handler in the SSR markup** (handlers are attached during React hydration). "Nothing happens on click" almost always means the published bundle failed to hydrate — the button is inert paint.
- The last preview error (`Sign in was cancelled`) is unrelated: that's the preview, where hydration works and the user closed the Google popup.

Root cause is not yet confirmed. Most likely candidates, in order:

1. The published bundle is stale — it was built before the recent `auth.tsx` / `lovable` import fixes and now throws during hydration.
2. `@lovable.dev/cloud-auth-js` or the Supabase client throws at import time on the published origin (e.g. missing `VITE_SUPABASE_*` at build), which aborts hydration for the whole route.
3. A runtime error inside `AuthPage`'s `useEffect` (session check) throws before React attaches the click handler.

## Plan

### 1. Confirm the cause on the live published site
- Open `https://waveos-content-hub.lovable.app/auth` in a headless browser, capture:
  - Console errors and unhandled promise rejections at load.
  - Whether `window.__TSR__`/React hydration completed (test by clicking the button and observing whether any network request or new tab is attempted).
  - The exact bundle hash vs. the current preview bundle hash to detect a stale deploy.

### 2. Fix based on what step 1 finds
- **If stale deploy:** the fix is a republish; call it out and stop.
- **If hydration error from a thrown import/effect:** wrap the offending code so failure doesn't take down hydration:
  - Guard the session-check `useEffect` in `src/routes/auth.tsx` with a try/catch so a Supabase error can't abort mount.
  - Make `handleGoogle` resilient to `lovable.auth.signInWithOAuth` throwing synchronously (already in try/catch, but confirm the button remains interactive if hydration is broken elsewhere).
- **If missing env in the published build:** surface a clear on-screen error instead of a silent dead button, and instruct republish.

### 3. Add a visible fallback so this never presents as a "dead button" again
- On click, if `lovable.auth.signInWithOAuth` returns/throws with no popup opened within ~1.5s, show a toast: "Popup blocked or sign-in unavailable — please allow popups and retry."
- Log the failure to the console with enough context to diagnose next time (provider, origin, whether `lovable` was defined).

### 4. Verify
- Re-run the headless check on the published URL: button click must open the Google popup **or** show the fallback toast — never do nothing.
- Confirm the existing preview flow still works (no regression to the popup path).

### Technical notes

- Files likely to change: `src/routes/auth.tsx` only. No backend or schema changes.
- No changes to `src/integrations/lovable/index.ts` (auto-generated).
- If step 1 shows the deploy is simply stale, no code change is needed — republish is the fix.
