# Hybrid WaveOS: self-service workspaces + Dream Wave invites

## What stays intact

- All existing tables, RLS, invite RPCs (`create_invite`, `accept_invite`, `revoke_invite`, `resend_invite`), `has_role`, `is_dream_wave_staff`, `handle_new_user`, and the staff bootstrap workspace `11111111-...`.
- Existing Dream Wave admin, clients, approvals pages.
- Existing `workspace_members` roles (`owner`, `approver`, `viewer`) — reused as workspace-level roles; we add `admin` and `editor`.

## Database migration

1. Extend `workspace_member_role` enum: add `admin`, `editor`. (Existing `owner` = Workspace Owner, `viewer` = Workspace Viewer, `approver` kept for Dream Wave client workflow.)
2. New RPC `public.create_brand_workspace(_name text, _business_name text, _industry text, _website text, _timezone text, _language text, _service_area text)`:
   - `SECURITY DEFINER`, requires `auth.uid()`.
   - Sanitizes inputs, generates unique slug from name.
   - In one transaction: inserts `workspaces` row (not demo, not archived), inserts `workspace_members(owner)`, inserts `brand_profiles` row with supplied fields, inserts 8 default rows into `media_folders` (Photos, Videos, Reels, Brand Assets, Logos, Uploads, Campaigns, Archived), writes an `activity_logs` entry.
   - Guards: user can create up to N workspaces they own (soft cap 10 to prevent abuse; staff exempt).
   - Returns new workspace id + slug.
3. `handle_new_user` unchanged — still bootstraps first user as `dream_wave_owner`. Subsequent self-serve users just get a profile row; no auto workspace (wizard handles it explicitly on next screen).
4. Verify RLS on `workspaces`, `workspace_members`, `brand_profiles`, `media_folders`, `media_assets` already scopes by `is_workspace_member` / `is_dream_wave_staff`. Add owner-can-rename policy if missing.
5. Storage: keep single `media` bucket; RLS on `storage.objects` scoped by `workspace_id` folder prefix (verify + patch if needed).

## Frontend changes

### Onboarding
- New route `src/routes/_authenticated/onboarding.tsx` — 3-step wizard (Welcome → Workspace form → Success). Calls `create_brand_workspace` via a new server function `createBrandWorkspace` (uses `requireSupabaseAuth`), then invalidates `waveos/workspaces` and sets active workspace.
- In `WorkspaceProvider`: when loading finishes and `workspaces` is empty, redirect to `/onboarding` (skipped if user is on `/accept-invite` or `/auth`).
- Replace the "Ask Dream Wave Media to add you" empty state in `AppShell`'s `WorkspaceSwitcher` with a "Create workspace" CTA linking to `/onboarding`.
- Add "+ Create new workspace" action at the bottom of the switcher dropdown.

### Media uploader
- Upgrade `social-accounts`... actually `content` / media upload surface: build a new `<MediaUploader>` component supporting:
  - Multi-file `<input multiple>`, drag/drop zone, clipboard paste, folder assignment, tag input.
  - Per-file queue with progress (XHR upload to Supabase Storage signed upload URL), states waiting/uploading/completed/failed, per-file retry/cancel, batch progress bar.
  - Duplicate detection by name+size within workspace before upload.
  - After each success, insert `media_assets` row scoped to active workspace.
- Wire into existing content/media page (I'll locate the current uploader in `src/hooks/use-media.ts` and the content route).

### Home dashboard
- Ensure `/home` reads real counts (media, scheduled posts, connected socials, pending approvals) for the active workspace and shows empty states + quick actions (Upload / Create Post / Connect Socials / Invite Team). Small polish; keep existing stat cards.

### Team invites
- The existing invite RPC accepts `_workspace_role` from the `workspace_member_role` enum, so it auto-supports the new `admin`/`editor` values once the enum is extended. Add a "Team" tab under `/settings` with invite form (email + role select) + pending invites list + resend/revoke, gated to workspace `owner`/`admin`.

## Out of scope for this turn (call out explicitly)

- Chunked/TUS resumable uploads for very large files (>50 MB): standard multi-part upload via storage SDK; retry works, true resume-on-drop does not.
- Ownership transfer UI.
- Per-permission RBAC beyond the 4 workspace roles.
- Rewriting analytics — dashboard shows placeholders where data doesn't exist.

## Technical notes

- Migration is one SQL file; RPC is `SECURITY DEFINER` with `SET search_path = public`, schema-qualified refs, and `auth.uid()` derivation only.
- Server function `createBrandWorkspace` in `src/lib/workspaces.functions.ts` using `requireSupabaseAuth` + `context.supabase.rpc('create_brand_workspace', ...)` — RLS still applies to the SELECT that returns the new row.
- All new activity-log entries use `log_activity` with safe metadata (no tokens/keys).
- Uploader writes directly from the browser using the existing `supabase` client (RLS on `storage.objects` enforces workspace path); no new server function needed for uploads.

## Deliverables checklist I'll report at the end

Migration file, tables touched, new RPC, new/changed RLS, new routes, new components, tests I ran (RLS spot-check across two workspaces, invite acceptance round-trip, multi-upload happy path + one forced failure retry).

---

**Reply "go" to build this, or tell me what to change** (e.g. skip the team-invite tab, defer the uploader rewrite, change the workspace cap, add ownership transfer, etc.).