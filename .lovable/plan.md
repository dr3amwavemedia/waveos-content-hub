
# WaveOS Upgrade Plan — Audit and 7-Phase Implementation

## Audit Summary

The codebase is already substantial (~4.7k lines across authenticated routes) and functioning. Key findings:

**Reusable and keep as-is:**
- Auth stack: Supabase client, `_authenticated` gate, invite/accept flow, MCP OAuth, Google OAuth via Lovable broker
- Data layer: workspaces, workspace_members, invites (SHA-256 hashed, atomic accept), user_roles (separate table with `has_role`), activity_logs (with redaction), notifications, content_items/post_variants/approvals/comments, media_assets/folders, social_connections, publish_attempts, ayrshare_profiles, webhook_events
- Ayrshare integration (server-side JWT, workspace-scoped, webhook HMAC verified)
- Publishing: cron `publish-due` endpoint with `CRON_SECRET`
- Design system (dark navy + light-blue accent), AppShell with sidebar/mobile drawer/bottom nav, workspace switcher
- Existing routes: home, content, calendar, create, analytics, social-accounts, brand-voice, feedback, settings, clients, approvals, admin, onboarding

**Gaps blocking the new spec:**
1. **No client access tiers.** Every workspace member gets full nav; there's no `project_client` / `growth_90` / `retainer_full` model, no term/expiration, no feature flags.
2. **Public self-registration is enabled** — `/auth` allows signup and `WorkspaceProvider` auto-redirects new users to `/onboarding` to create their own workspace. Spec requires invite-only.
3. **Nav is not permission-driven.** `app-shell.tsx` shows the same client nav to everyone (staff gets extra items appended).
4. **No client-facing modules** for: Your Information (profile), Invoices, Your Content (external delivery links), Intake Submissions, CRM sync status.
5. **No locked-preview UX** for Layer 2 (90-day) restricted features.
6. **No "View as Client" preview mode** for admins.
7. **Overview is one-size-fits-all**, not tier-adaptive.
8. **No projects table** for organizing client work.
9. **Admin clients page** exists but lacks tier/term/expiration controls, invoice/delivery management, activity view, preview button.
10. **Mobile:** tables in `/clients` and `/approvals` will overflow at 320px; needs stacked cards + full-screen sheets.

**Security items to fix during Phase 1:**
- Disable email/password self-signup at the app level; keep Google only for admin-invited users OR require invite token on all signups.
- Prevent `create_brand_workspace` RPC from being called by non-staff (currently allows anyone; spec says only admins create workspaces).
- Ensure new tier/invoice/delivery tables have complete GRANT + RLS following the four-step rule.

## Phased Implementation

### Phase 1 — Access Foundation (schema + permissions + invite-only)
Migration:
- `client_access_tier` enum: `project_client`, `growth_90`, `retainer_full`
- `agreement_term` enum: `one_time`, `90_day`, `6_month`, `12_month`
- `account_status` enum: `pending`, `active`, `suspended`, `expired`, `archived`
- Add to `workspaces`: `access_tier`, `agreement_term`, `access_starts_at`, `access_expires_at`, `account_status`, `activated_at`, `invited_at`, `admin_notes`, `feature_overrides jsonb`, `crm_sync_status`, `crm_external_id`
- Server-side `has_feature(workspace_id, feature_key)` function that reads tier + overrides
- Update `create_brand_workspace` RPC → restrict to `is_dream_wave_staff` and require `_access_tier` + `_agreement_term`
- Restrict `workspace_members` INSERT for self (only via invite accept RPC)

Frontend:
- Central `src/lib/permissions.ts` — pure derivation of feature flags from tier/overrides/status
- `usePermissions(workspaceId)` hook
- `<FeatureGate feature="..." mode="hidden|preview">` component
- Remove signup form + workspace-creation onboarding from public flow; `/auth` becomes sign-in only (with password reset). Onboarding page becomes admin-only "New Client" wizard.
- Update `WorkspaceProvider` to no longer redirect to `/onboarding` — instead show a "You haven't been invited yet" empty state for orphaned auth users.

### Phase 2 — Admin Client Management
New/updated routes under `/admin/*`:
- `admin/clients` (rebuild): search + filters (tier/term/status/activation/CRM), mobile stacked cards, desktop table. Quick actions: open, edit access, add invoice, add delivery, resend invite, suspend/restore, upgrade/downgrade, view activity, retry CRM.
- `admin/clients/$id` — full client account editor: profile, tier/term/dates, feature overrides, projects, invoices, deliveries, members, invitations, activity.
- `admin/intake` — intake submissions list.
- `admin/invitations` — invite management (create/resend/revoke).
- `admin/activity` — global activity log.

Migration additions:
- `projects` table (workspace-scoped)
- `client_invoices` table (title, number, provider, external_url, amount, due_date, status enum, description)
- `content_deliveries` table (title, description, provider enum, external_url, thumbnail_url, content_type, status enum, expiration, downloads_available, action_required, sort_order, admin_notes)
- `intake_submissions` table (raw payload + sync fields)
- `admin_preview_sessions` table (audit trail)
- `preview_as_client(_workspace_id)` RPC — issues a signed short-lived preview context (server-scoped, not a password swap). Logged in activity_logs.

"View as Client" implementation:
- Admin session stays intact; a `preview_workspace_id` is stored in sessionStorage + validated server-side against `admin_preview_sessions`. Persistent banner + "Exit Preview" in AppShell. All feature checks resolve against the previewed workspace's tier. Mutation surface disabled unless admin explicitly enables.

### Phase 3 — Layer 1 Portal (project_client)
- Tier-driven nav config in `app-shell.tsx` (single source, generated from permissions)
- `/home` adapts: Layer 1 shows welcome, project status, most recent invoice, most recent delivery, contact card, single primary CTA
- `/your-information` — safe client profile edit (name, phone, business, socials, billing, project goals). Admin-only fields hidden.
- `/invoices` — client sees invoice cards with status badges, "View/Pay" links (external)
- `/your-content` — delivery cards; validate https, open external in new tab with `noopener`; safe iframe fallback
- `/contact` — Dream Wave contact info + support form
- `/intake` public route (invite-required) — collects business info; on submit creates/updates client + activity log + email notify + CRM sync attempt

CRM sync architecture:
- `crm_sync_attempts` table with status + external_id + error
- Server function `sync_client_to_crm(workspace_id)` — pluggable (Bloom API/webhook/Zapier). Emits honest status (not_connected/pending/synced/failed). Admin can retry.

### Phase 4 — Layer 2 Preview (growth_90)
- Same full nav as Layer 3 rendered, but locked modules use `<FeatureGate mode="preview">` — shows title, screenshot/mock, lock icon, "Available with a 6- or 12-month retainer", subtle CTA
- Access-period banner (start/end/days remaining)
- Server-side enforcement: RLS + RPC guards reject premium mutations for `growth_90` (publish, schedule, connect socials, invite members, AI captions, export)
- Nightly cron transitions expired `growth_90` → `project_client` (data preserved)

### Phase 5 — Layer 3 Full Access (retainer_full)
- Wire existing scheduling/publishing/analytics/AI/team/approvals features to `usePermissions`
- Enable `invite_member` RPC only when `has_feature(_ws, 'can_invite_members')`
- Server functions re-check permission before mutation (defense in depth)

### Phase 6 — Mobile & Accessibility Pass
- Replace tables in `/clients`, `/approvals`, `/admin/*` with responsive card lists at `<sm`
- Convert modals to bottom sheets on mobile using existing dialog components
- Audit at 320/375/390/430/tablet/desktop
- Focus rings, aria labels, keyboard nav, error copy rewrite ("We couldn't save this…"), empty states, sticky primary CTAs on long forms
- Skeleton loaders on all query-driven pages

### Phase 7 — Security & Quality Review
- Run Supabase linter + security scan; fix critical findings
- Cross-workspace access tests (attempt to read/mutate another workspace)
- Verify no service-role key in client bundle (`rg -n "SERVICE_ROLE" src/`)
- Verify invitation table has no anon/authenticated broad SELECT
- Verify tiered mutation guards
- Storage bucket policies + signed URL expiry review

## Technical Notes

- All new tables follow the CREATE → GRANT → RLS → POLICY four-step rule; deny-by-default for client tables.
- Every migration is additive (no drops on production columns). Enum values added with `ALTER TYPE ... ADD VALUE`.
- Backfill: existing workspaces default to `retainer_full` + `active` + no expiration to preserve current behavior.
- Permission derivation is pure and unit-testable; server RPCs mirror the same table for enforcement.
- No new edge functions — all backend logic through TanStack `createServerFn` + server routes per project conventions.
- Ayrshare, MCP, publishing cron untouched except for permission checks.

## Deliverables per Phase
After each phase I will list the exact files created/modified and the migration name, then pause for you to review before starting the next. Phase 1 is the largest single migration; Phases 2–7 are smaller batches.

Reply "go" (or with adjustments) and I'll begin Phase 1.
