# WaveOS — Build Status

## Phase status

- ✅ **Phase 1** — Foundation, auth, workspace shell, dark design system.
- ✅ **Phase 2** — Media library, brand voice onboarding, client invites.
- ✅ **Phase 2.5** — Security hardening, invite hashing, last-owner protection, activity log redaction.
- ✅ **Phase 3** — Content items, per-platform variants, approvals, comments.
- ✅ **Phase 4** — Ayrshare integration (server fns, connect flow, publishing, webhook).
- ✅ **Phase 5** — Calendar, Wave Assistant AI, analytics scaffold pulling from social_connections.
- ✅ **Phase 6** — Notifications bell, Privacy/Terms pages, integration diagnostics.

## What is live in the app

- Create posts with per-platform captions, media picker, scheduling, and submit-for-approval workflow.
- Approvals inbox for staff with approve / request changes / reject decisions and a comments thread.
- Calendar month view showing all scheduled/published content, click-through to editor.
- Social Accounts page with Ayrshare connect flow (opens white-label window) and per-channel status.
- Analytics scaffold ready for per-platform metrics once first publish completes.
- Notifications bell in the header with unread count and mark-as-read.
- Admin → Integration Status panel (booleans only, secrets never exposed).
- Legal pages at `/privacy` and `/terms`.
- Scheduled cron job (`waveos-publish-due`, every 5 min) that publishes due content via Ayrshare.
- Ayrshare webhook receiver at `/api/public/hooks/ayrshare` with HMAC verification.
- Wave Assistant server function (`waveAssist`) using Lovable AI Gateway (Gemini 2.5 Flash) for caption / hashtag / tone / translate suggestions — always suggestion-only.

## Manual steps required

1. **Publish the app** so cron and Ayrshare webhooks can reach the endpoints at
   `https://project--5e51f033-dba6-4b7a-acb2-008cdd739997.lovable.app/api/public/hooks/*`.
2. In Ayrshare's dashboard set the **webhook URL** to
   `https://project--5e51f033-dba6-4b7a-acb2-008cdd739997.lovable.app/api/public/hooks/ayrshare`
   using the `AYRSHARE_WEBHOOK_SECRET` you just stored.
3. In Ayrshare's white-label settings set the **redirect URL** to
   `https://project--5e51f033-dba6-4b7a-acb2-008cdd739997.lovable.app/social-connections/callback`.
4. Sign in for the first time — the first sign-up is auto-promoted to Dream Wave Owner and added to the seeded "Dream Wave Media" workspace.
5. In **Clients → New workspace**, onboard a real client and share the copy-only invite link.
6. In the client workspace → **Social Accounts**, click **Connect a channel** to open the Ayrshare white-label window and link the first social account.

## Tested end-to-end

- Sign-up → auto-owner bootstrap → Dream Wave Media workspace seeded.
- Media upload → workspace-scoped storage RLS → signed URLs for preview.
- Client invite create → hashed token, email match on acceptance, single-use.
- Content item create → per-platform variants → submit for approval → approve → status transitions.
- Comments thread on approval detail.
- Notifications bell polling + mark-read.
- Admin integration diagnostics reflects secret presence booleans correctly.

## Not tested (requires the manual steps above)

- Ayrshare profile creation for a client workspace (needs real Ayrshare account + a client workspace member trying to connect).
- Actual publish attempt to a live social platform.
- Cron-driven publish-due (needs published deployment).
- Ayrshare webhook signature verification against a real event.

## Follow-ups worth doing later

- Drag-to-reschedule in calendar (currently click-to-open only).
- Assistant panel UI inside the Create Post page (server function exists; wire a "Suggest caption" button).
- Per-platform analytics dashboard once Ayrshare returns first metrics.
- Demo workspace seeding script (deferred; Dream Wave Media internal workspace already covers empty-state demo needs).
