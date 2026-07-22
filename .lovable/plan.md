## Plan: Fix WaveOS public sign-in and invite landing loops

### Goal
Make the published app complete the full login journey:
- Admin signs in with Google and lands in `/home` instead of returning to the login/homepage screen.
- Invited clients can accept an invite, create/sign in to their account, and land on their tier-appropriate `/home` experience.

### What I will change
1. **Add a public auth callback route**
   - Create a same-origin public `/auth/callback` page that waits for the auth session to hydrate.
   - It will read the intended destination from a safe `next` value or session storage, then redirect to `/home` or the preserved invite URL.
   - This prevents OAuth returning to `/` or `/auth` before the browser session is ready.

2. **Update Google sign-in redirect handling**
   - Change Google sign-in to use `/auth/callback` as the `redirect_uri` instead of only the site origin.
   - Keep the intended post-login path in session storage so admin and client flows go to the correct page after Google completes.
   - Keep the existing Google popup behavior intact.

3. **Fix invite token preservation**
   - Preserve the invite token in session storage before stripping it from the visible URL.
   - Ensure sign-up confirmation and sign-in flows return to `/accept-invite?token=...` or restore the token from storage.
   - This addresses clients getting returned to a dead page or login screen after accepting an email invite.

4. **Make invite completion deterministic**
   - After a client signs up or signs in from an invite, call the existing `accept_invite` RPC with the restored token.
   - On success, route to `/home`, where the existing tier logic will show the project-client overview or the higher-tier dashboard.
   - Keep email-mismatch protections unchanged.

5. **Verify the flows**
   - Use browser verification against the local preview for:
     - Google button starts OAuth with `/auth/callback` as the return target.
     - `/auth/callback` redirects signed-in sessions to `/home`.
     - `/accept-invite` keeps the invite token available after URL cleanup.
   - Confirm the route files include required metadata.

### Technical notes
- I will not change database roles, invite security, or workspace tier logic unless the verified redirect bug requires it.
- I will avoid exposing backend keys or changing generated integration files.
- After implementation, the public link will still need a new publish for the fixed code to reach production.