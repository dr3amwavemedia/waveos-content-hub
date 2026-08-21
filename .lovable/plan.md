# WaveOS Production Expansion — Audit, Architecture, and Phased Plan

## 1. Current access model (as built today)

Authorization is already centralized; no competing role system will be created.

- **Source of truth:** `public.user_roles` (`app_role` = `dream_wave_owner` | `dream_wave_team`, plus `staff_type` = `sales` | `media_manager` | `crew`). Checked server-side by `has_role()`, `is_dream_wave_staff()`, `can_staff_manage_workspace()`.
- **Admin** = `dream_wave_owner`. Full management, Clients, Tools, Staff, CRM, Vision Studio.
- **Staff** = `dream_wave_team`, further narrowed by `staff_type` route allowlists in `src/routes/_authenticated/route.tsx` (`TEAM_ALLOWED_ROUTES`, `MEDIA_MANAGER_ALLOWED_ROUTES`, `CREW_ALLOWED_ROUTES`).
- **Client** = membership in `workspace_members` (`owner` / `approver` / `viewer` via `workspace_role()` and `is_workspace_member()`), plus tier gating from `workspaces.access_tier` + `feature_overrides` through `has_feature()` server-side and `usePermissions()` / `<FeatureGate />` client-side.
- **Public** = token RPCs only (`get_public_vision_deck`, `get_public_vision_board`, `get_public_promo_campaign`, `get_invite_public`).
- **Activity logs** (`activity_logs`) are already insert/update/delete denied and staff-read.

Nothing in this plan changes any of the above. All new access is expressed as new tables with new policies.

## 2. Profile and workspace structure

- `profiles` (id → auth.users, first/last name, avatar) — user identity.
- `workspaces` — the client account (tier, status, wedding fields, branding, CRM sync).
- `workspace_members` — user ↔ workspace ↔ role.
- `crm_accounts` / `crm_contacts` — lead/business records, `linked_workspace_id` to a converted client.
- Client-facing data: `client_deliveries`, `client_invoices`, `client_contracts`, `client_requests`, `client_checklist_items`. Staff-only: `workspace_internal_notes`, `content_item_internal_notes`, `client_request_internal_notes`.

## 3. Current Production and Vision Studio

- **Production** today = `/videographer` (crew dashboard) + `production-today-panel` and `production-projects-panel`, backed by `production_projects` (title, crm_account_id, workspace_id, assigned_to, scheduled_at, location, status, client_snapshot) and RPC `assign_production_project`.
- **Vision Studio** = `/vision-studio` + `/vision-board` + `/vision-board/$boardId`, tables `vision_decks` (+ `vision_deck_events`) and `production_vision_boards`, public routes `/vision/$token` and `/storyboard/$token`.
- **Tools** = `/tools` (owner-only, QR Promo Links) with `promo_campaigns`.

These all stay. The redesign is navigation/grouping only; existing routes remain valid (new grouped routes redirect into them, never replace them).

## 4. Proposed new tables (all additive, all RLS-enabled with GRANTs)

Core project model (extends, does not replace, `production_projects`):

- `projects` — name, business_name, client_name, project_type (`one_time` | `retainer` | `campaign` | `wedding`, extensible), description, status, is_active, start/end/event dates, workspace_id (nullable), crm_account_id (nullable), client_visible, published_at, timestamps.
- `project_client_assignments`, `project_staff_assignments` (position, responsibilities), `project_notes` (`visibility`: internal | client), `project_schedule_items`, `project_references` (link/image/video, is_approved, is_active), `project_deliverables`, `project_milestones`.

Wedding Studio:

- `wedding_details` (1:1 with project), `wedding_contacts`, `wedding_schedule_items`, `wedding_presentation_shares` (token hash, revoked_at, expires_at, allowed sections), `wedding_presentation_events` (append-only open log).

Team Meetings:

- `team_meetings`, `meeting_collaborators`, `meeting_sections` (production/sales/marketing/management, is_active), `meeting_projects`, `meeting_notes` (private | shared | presentation), `meeting_action_items`, `meeting_statistics` (editable chart data JSON).

Activity log:

- `account_activity_events` — append-only, admin-read-only: actor, subject user/workspace, event_type, related project/invoice/contract, description, platform category, created_at. No tokens, no secret URLs, no passwords.

Profile fields (Phase 1):

- `profiles.business_name`, `profiles.client_name` — both `text NULL`, no backfill.
- `workspaces.business_name`, `workspaces.client_name` — both `text NULL`, no backfill. Display falls back to existing `workspaces.name` / profile names.

## 5. Permission matrix for new tables

| Data | Admin (owner) | Staff (team) | Client | Public token |
|---|---|---|---|---|
| projects | full | read where assigned | read only if assigned AND `client_visible` AND published | no |
| project internal notes | full | read where assigned | never | never |
| project client notes | full | read where assigned | read for their project | no |
| wedding_details | full | read where assigned | no (unless later opened) | approved sections only |
| presentation shares | full | read where assigned | no | validated token only, read-only RPC |
| team_meetings | full | only where collaborator | never | never |
| meeting private notes | own only | own only | never | never |
| account_activity_events | read only | never | never | never |

Enforcement: security-definer helpers (`is_project_staff`, `is_project_client`, `is_meeting_collaborator`) mirroring the existing `has_role` pattern; public presentation access exclusively through a token RPC that returns approved fields only — no direct table grants to `anon`.

## 6. Existing policies

No existing policy is dropped or weakened. Only additions:

- New nullable columns on `profiles` and `workspaces` inherit their existing policies (already scoped to self / membership / staff).
- If a client-facing read of a new column is needed, it is added as a *new* policy on a *new* table, never by widening an existing one.

## 7. Preserving current access

- No `UPDATE`/`DELETE` on existing rows in any migration; no reseeding, no role changes, no membership changes.
- All new columns nullable with no defaults that alter behavior.
- New navigation entries are gated by the existing role/tier logic, so current clients and staff see exactly what they see today until an admin explicitly assigns and activates content.
- Feature flag constant (`PRODUCTION_V2_ENABLED`) keeps unfinished areas admin-only until validated.

## 8. Phased rollout

1. **Phase 1** — Business Name + Client Name (nullable), display fallbacks, regenerate types.
2. **Phase 2** — Core project data model + RLS + helpers (no UI exposure).
3. **Phase 3** — Production reorganization: Overview / Projects / Schedule / Assignments / Vision Studio / Wedding Studio / Team Meeting, with redirects from existing routes.
4. **Phase 4** — Admin Projects management (create, edit, duplicate, archive, assign, notes, references, deliverables, milestones).
5. **Phase 5** — Client-facing project overview inside the client workspace (assigned + client-visible only).
6. **Phase 6** — Wedding Studio, slideshow (edit + present modes), revocable/expiring freelance share links with open logging.
7. **Phase 7** — Admin-only Activity Log tab with filters and incremental loading.
8. **Phase 8** — Team Meeting tool, selectable sections, slideshow with editable charts, private-by-default notes.
9. **Phase 9** — Active/Not Active controls across optional content.
10. **Phase 10** — Mobile, permission, accessibility, and regression testing; then enable flags.

Each phase ends with: lint, typecheck, production build, unauthorized-access checks against a controlled test account (never production customer data), and a written summary of what changed and what was left untouched.

## 9. Rollback plan

- Every migration is paired with a reverse script that only `DROP`s objects created in that same migration (new tables, new policies, new functions) and `ALTER TABLE ... DROP COLUMN` for the new nullable columns. No existing object is ever referenced by a rollback.
- Because no existing row is written, rollback restores the prior state exactly.
- UI is behind a feature flag, so an instant rollback is flipping the flag off without touching the database.

Approve this and I'll start with Phase 1 only.
