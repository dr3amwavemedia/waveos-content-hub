## Current behavior (verified from code)

**Tier-based homepage routing — already correct:**
- `src/routes/_authenticated/home.tsx` reads `usePermissions()` and renders `<Layer1Overview />` when the signed-in user is not staff and their active workspace `access_tier === "project_client"` (Layer 1). Staff, Layer 2 (`growth_90`), and Layer 3 (`retainer_full`) get the growth `HomeDashboard`.
- `AppShell` swaps to `LAYER1_NAV` for Layer 1 clients (Overview / Your Content / Invoices / Info / Contact), and to `filterByFeature(CLIENT_NAV)` for higher tiers, so navigation matches the tier.
- Access data comes from `workspaces.access_tier`, `account_status`, `access_expires_at`, and `feature_overrides`, mirrored on the server by `public.has_feature(...)`.

**Admin-first client creation — already correct:**
- `create_brand_workspace` RPC is staff-only (`is_dream_wave_staff` check); public signup at `/auth` is disabled.
- In `/clients`, an admin creates the workspace, picks the tier (`project_client` / `growth_90` / `retainer_full`), and issues a single-use invite via `create_invite` for a specific email. The invite is 14-day, SHA-256 hashed, and case-insensitive email-bound.
- `/accept-invite?token=…` verifies the invite email matches the signup/sign-in email (`accept_invite` RPC rejects mismatches with `invite_email_mismatch`), then adds the user to that workspace with the assigned role. The user cannot pick their own tier and cannot create a workspace.

## What "make sure it works" means here

No feature is missing — the flow the message describes is already the app's design. This plan is a verification pass, not new work, so approving it produces a small confirmation + a couple of small UX guarantees, no schema changes.

## Verification and small guarantees

1. **Runtime verification with Playwright**
   - Sign in as the seeded staff owner, open `/clients`, create a test workspace at tier `project_client`, generate an invite for a test email, copy the link.
   - In a fresh browser context, open the invite link, complete signup, land on `/home`, and confirm `<Layer1Overview />` renders and the sidebar shows the Layer 1 nav.
   - Repeat for `growth_90` and `retainer_full` and confirm each lands on the correct home + nav.
   - Capture a screenshot per tier as evidence.

2. **Small UX guarantees (only if the runtime check exposes them)**
   - `/auth`: keep the "WaveOS is invite-only — contact Dream Wave Media" copy visible and make sure email/password signup is not exposed on the sign-in card (Google sign-in still works, but only if a matching invite has been accepted; otherwise the user sees an empty state and cannot create a workspace).
   - `/home`: if the signed-in user has zero workspace memberships (edge case: signed in but no accepted invite), show a clear "You haven't been invited to a workspace yet — contact Dream Wave Media" empty state instead of a blank dashboard.
   - `/clients` "New client" dialog: make the tier picker the primary field and confirm the invite email is required before the workspace is created, so the admin cannot forget to send the invite.

3. **No database or permission changes**
   - `create_brand_workspace`, `create_invite`, `accept_invite`, `has_feature`, and the workspace/tier columns are already correct; this pass will not touch them.

## Deliverable

A short report per tier (with screenshots) confirming the signed-in client lands on the correct home and sees the correct navigation, plus any of the small UX guarantees above that turn out to be needed.