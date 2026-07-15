
# WaveOS — Phased MVP Build Plan

Full platform will ship across ~6 focused phases. Each phase is a complete, shippable slice. This turn = **Phase 1**. Later phases run in follow-up turns.

## Phase 1 (this turn) — Foundation
- Enable Lovable Cloud (Postgres + Auth + Storage + server functions).
- Dark cinematic WaveOS design system in `src/styles.css` (near-black bg, deep navy panels, electric-blue accents, Inter font, thin translucent borders, generous spacing).
- Branded auth page (`/auth`): email/password + Google sign-in, invite-only messaging, "A Dream Wave Media platform" footer. No public signup CTA — form supports login + accept-invite via URL token.
- DB schema (with RLS + GRANTs):
  - `workspaces`, `workspace_members`, `profiles`, `invites`
  - `user_roles` (app_role enum: `dream_wave_owner`, `dream_wave_team`, `client_owner`, `client_approver`, `client_viewer`) + `has_role()` security-definer fn
  - `workspace_role()` helper for per-workspace role checks
- Protected app shell under `_authenticated/`:
  - Left sidebar (desktop) + bottom nav (mobile): Home, Content, Calendar, Create, Analytics, Social Accounts, Brand Voice, Feedback, Settings (staff see Clients/Approvals/Admin).
  - Workspace switcher in header.
  - Home dashboard with 5 summary cards, upcoming content, needs-attention, recent performance, quick actions — all wired to real (empty) data + polished empty states.
- Sitemap.xml, robots.txt, real head metadata.

## Phase 2 — Media Library + Brand Voice + Onboarding
- Storage bucket `media` with per-workspace RLS.
- Media library: upload (drag-drop), grid, folders, tags, filters, preview.
- Brand profile table + 5-step onboarding wizard.
- Public direct media URLs (for Ayrshare later).

## Phase 3 — Post Creation + Approvals
- `content_items`, `post_variants` (per-platform captions), `approvals`, `comments`.
- Guided create-post workflow with per-platform caption tabs (independent editing, confirmation before overwrite).
- Approval workflow with all statuses; client review UI.

## Phase 4 — Ayrshare Integration
- Secrets: AYRSHARE_API_KEY, AYRSHARE_DOMAIN, AYRSHARE_PRIVATE_KEY, AYRSHARE_PRIVATE_KEY_BASE64, APP_BASE_URL, APP_ENVIRONMENT, AYRSHARE_WEBHOOK_SECRET.
- `ayrshare_profiles` table (server-only key).
- Server fns: `ensureAyrshareProfile`, `createAyrshareConnectUrl`, `publishPost`.
- Social Accounts page + popup connect flow + `/social-connections/callback`.
- White-label Ayrshare where plan supports; admin notice otherwise.
- `publish_attempts` with partial-success handling, idempotency, UTC conversion.

## Phase 5 — Calendar + Wave Assistant + Analytics
- Calendar (month/week/agenda) with drag-to-reschedule.
- Wave Assistant panel using Lovable AI Gateway (`openai/gpt-5.5`) for captions/hashtags/tone/translate — suggestions only, never auto-publish.
- Analytics page pulling from Ayrshare analytics endpoints; "Not available from this platform" fallback.

## Phase 6 — Notifications, Legal, Admin Diagnostics, Polish
- In-app notifications table + bell UI.
- Privacy Policy + Terms pages.
- Admin-only integration status page (booleans only, no secret values).
- Demo workspace seed (dev only).
- Final acceptance test pass + implementation report.

## Technical notes
- Stack: TanStack Start + Lovable Cloud (Supabase under the hood — never mentioned to users). Auth via managed `_authenticated` gate.
- Roles stored in `user_roles` (separate table, security-definer helpers) to prevent privilege escalation.
- Every table gets explicit GRANTs + RLS. Ayrshare Profile Keys granted only to `service_role`, loaded via `supabaseAdmin` inside server-fn handlers.
- All UI uses semantic tokens in `styles.css` — no hardcoded colors in components.
- Google OAuth via `lovable.auth.signInWithOAuth("google", ...)` + `supabase--configure_social_auth`.

## Phase 1 deliverable
After this turn you'll have a signed-in, workspace-scoped WaveOS shell with the full design system and navigation, ready for staff to invite clients. Phases 2–6 layer on features without redesigning anything.

Reply "approve" (or edit any phase) and I'll start Phase 1.
