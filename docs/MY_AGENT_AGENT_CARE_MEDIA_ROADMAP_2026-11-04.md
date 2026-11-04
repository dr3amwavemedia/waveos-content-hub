# WaveOS: My Agent, Agent Care and Media Publishing Implementation Plan

Status: approved product requirements; not a statement that features are implemented. Last reviewed 2026-11-04.

## Principles
- One shared My Agent engine, workspace-scoped memory and actions for web and mobile; responsive presentation may differ.
- Plain-language conversation and interactive tools; user can revise active campaign steps without restarting.
- Never claim an action, connection repair, publishing success, or performance improvement without verifying it.
- Prefer real leads, conversions, clicks and qualified messages over vanity metrics. Explain sample sizes, missing data and comparison periods.
- Respect plan entitlements and workspace permissions; preserve live Stripe billing.

## Agent Care: diagnosis and escalation
1. Add read-only health checks for Google Drive, Dropbox, Frame.io, client deliveries, device uploads, social provider connection and publish job status. Only inspect resources for the authenticated workspace; avoid exposing OAuth tokens or raw private file contents in support tickets.
2. Surface user-friendly explanations: expired/revoked access, missing scopes, picker failure, unavailable source, file format/size limit, upload interruption, missing permissions or platform API failure. Distinguish confirmed cause from suspicion.
3. Safe automatic fixes only (retry transient requests with limits, refresh tokens on server when authorized, clear stale local picker state). Never silently broaden OAuth scopes, revoke user access, change billing, publish a post, delete originals, or modify production code.
4. Reauthorization is user-driven; link to the correct provider consent flow and verify connection afterward.
5. If unresolved, create a workspace-scoped support case with redacted error category, correlation ID, timestamp, provider, attempted steps, affected feature, and consented diagnostics. Notify authorized owner/technical staff; implement least-privilege support role and audit log. Never automatically give staff access to client media or OAuth secrets.
6. Agent can report case status, and must not promise a repair until verified.

## Customer-owned storage
- Prioritize browsing Google Drive and Dropbox folders; Frame.io where connected.
- Avoid permanent duplicate media when provider URLs are usable; use short-lived, permission-checked working copies for transcoding/publishing when needed.
- Camera roll/device files use the existing 500 MB temporary workspace quota unless a verified product setting says otherwise. Check actual quota server-side.
- Confirm retention, cleanup, provider URL expiry and publishing retries; never delete the original customer-owned file.
- Provider APIs may require server-side transfer even when users do not download to their devices.

## Media preflight and quality comparison
1. Validate per-destination size, codec, duration, aspect ratio, resolution, audio and platform API restrictions using versioned rules. Different destinations may require different exports.
2. If the file is acceptable, do not compress solely because it is large.
3. If conversion is needed, present estimated output and options. Produce a short representative comparison preview with temporary storage; label it as a sample, not guaranteed final quality.
4. Preserve source. Offer original vs optimized preview, with explicit approval before posting if quality changes noticeably. Do not promise lossless compression from 1.4 GB to 300 MB.
5. Encode on a bounded background worker with progress, cancellation, resource limits, temporary retention, retries and cleanup. Do not transcode 4K media in the web request or rely on the phone browser.
6. Measure and disclose actual output size and dimensions. Posting may still trigger social-platform recompression.
7. If no suitable conversion is possible, recommend editor export settings or direct platform upload, with no false success message.

## Conversation and campaign state
- Persist workspace-scoped chats, tool state and explicit brand preferences in Supabase with RLS, retention/delete controls and audited access.
- Allow updates such as "10 posts, at least four photos only" and validate the chosen folder has enough distinct usable photo assets. Preserve other choices and request confirmation before schedule/publish.
- Summarize edits clearly and show actionable next steps.
- My Agent UI: compact chat, responsive interactive cards, gentle wave/surfing progress animation; support reduced-motion settings.
- "Catching the right wave…" default; context-specific task copy only when grounded in actual work.

## Release gates
- Tests for permission denial, expired OAuth, missing provider scopes, file limit mismatch, failed transcode, slow upload, canceled action, missing metrics, inaccessible workspace, and duplicate publishing.
- Verify actual database migrations and row-level security; no production schema assumptions.
- Test both mobile and desktop, plus cross-device chat sync and accessible reduced-motion UI.
- Check costs for storage, egress, transcode, AI tokens and support notifications under realistic usage.
- No App Store readiness or live deployment claim without build, review and production verification.
