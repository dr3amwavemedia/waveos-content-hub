## Goal
Make the Google/Gmail sign-in button work reliably from the WaveOS login/home entry point, and ensure the admin account signs into the correct admin workspace experience.

## What I verified
- The public home page routes users to `/auth`.
- The Google button is wired to `lovable.auth.signInWithOAuth("google")`.
- The current OAuth redirect is set to `/auth`, while the managed Google auth guidance for this app expects a full same-origin public origin/callback and then redirects after the session is confirmed.
- The protected app routes are gated under `/_authenticated`, so Google should not redirect directly into protected pages.

## Plan
1. **Enable/refresh Google auth provider configuration**
   - Run the managed Google auth configuration so the backend provider is active for Lovable Cloud.
   - This addresses the common “button does nothing / unsupported provider” failure mode.

2. **Repair the Google button flow**
   - Update the Google sign-in handler to use a safe public redirect target: `window.location.origin`.
   - Preserve the intended destination separately in `sessionStorage`, instead of relying on Google to redirect directly to a protected app path.
   - Keep the existing invite-only email/password flow unchanged.

3. **Make post-login destination explicit**
   - After the Google session is confirmed, route users through the existing auth gate to `/home`.
   - Existing tier/staff logic will then show admins the full admin-capable app and clients their assigned tier homepage.

4. **Improve error visibility**
   - If Google sign-in returns an error, show a clear toast instead of appearing like the button did nothing.
   - Keep logging limited to non-secret error information.

5. **Verify the behavior**
   - Check that clicking “Continue with Google” starts the OAuth flow rather than silently failing.
   - Confirm the app’s protected route redirects still work after sign-in.
   - If a real Google round-trip cannot be completed inside the test environment, mark only that end-to-end part as externally dependent and verify all local wiring/runtime signals.