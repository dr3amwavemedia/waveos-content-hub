# WaveOS live technical readiness audit

Date: October 7, 2026

This audit compares the current WaveOS implementation with publicly documented controls in Buffer,
Hootsuite, Later, Sprout Social, Zernio, and current Supabase production guidance. It distinguishes
verified production behavior from recommended work.

## Verified strengths

- Workspace-bound Zernio profiles and server-side account-limit enforcement.
- Idempotency keys for publishing and Stripe/autopay operations.
- Webhook reconciliation for asynchronous publish completion.
- Stripe subscription invoices persisted in WaveOS.
- Row-level security enabled on every public table checked in production.
- Private media storage with 300 MB file, 500 MB workspace, and 1.5 GB global safety limits.
- Temporary camera-roll media deletion only after every destination confirms success.
- Google Drive and Dropbox references avoid consuming local media allowance.
- Scheduled publishing and autopay cron jobs run every five minutes and recent runs succeeded.
- The public scheduled-publish endpoint rejects an unauthenticated POST.
- HTTPS includes HSTS, `nosniff`, and strict-origin referrer protection.
- Production contained no stale temporary media during this audit.

## Priority work

### P0 — implement automatic Zernio offboarding and reactivation

The agreed six-month retention and seven-day connection grace period are documented separately, but
the automation is not live. Subscription expiration must schedule Zernio disconnection, successful
payment must cancel it, and nightly reconciliation must catch missed webhooks.

### P0 — failed-post operations center

Production has historical failed attempts and two legacy attempts still marked `sending`. Build a
reconciler that closes stale attempts, retries only safe transient failures with bounded exponential
backoff, and never duplicates a post. Add an OS Data failed-post queue with the provider reason,
workspace, platform, next action, retry history, and a controlled resend action. Notify the customer
and staff through in-app and email channels.

### P0 — canary publishing and alerting

Create dedicated test connections for every supported platform and publish private/test content on a
schedule. Alert staff when connection health, OAuth scopes, callbacks, scheduling, or provider
publishing fails. Synthetic checks should test the actual POST workflow, not only page availability.

### P1 — emergency publishing pause

Add owner-only workspace and global kill switches that stop queued and scheduled publishing without
deleting drafts. Record who enabled the pause and require explicit confirmation to resume.

### P1 — database function privilege review

All checked public tables have RLS. However, production has multiple public `SECURITY DEFINER`
functions that are executable by `anon` or `authenticated`. Many may validate `auth.uid()` correctly,
but each must be reviewed and unnecessary grants revoked. Move internal-only privileged functions to
a private schema. Run Supabase security and health advisors after remediation.

### P1 — customer-facing audit trail

Expose an immutable, workspace-scoped history of logins, social connections, publishing, scheduling,
AI drafts, billing state changes, role changes, and offboarding. OS Data should provide a broader
owner-only view and export.

### P1 — security headers

Production has HSTS, `X-Content-Type-Options`, and a strict referrer policy. Add and test a Content
Security Policy with `frame-ancestors`, plus a Permissions Policy. Roll CSP out in report-only mode
first so Stripe, OAuth, Google Picker, and required media origins are not accidentally blocked.

### P1 — backups and restore drills

Confirm the paid backup/PITR configuration, document recovery objectives, and perform a restore drill
on a non-production project. A backup is not verified until restoration has been tested.

### P2 — dependency and supply-chain gate

The repository uses `package-lock.json`, while local developer commands currently use pnpm without a
pnpm lockfile. Standardize on one package manager, run vulnerability and license scanning in CI, pin
GitHub Actions by immutable SHA, and enable dependency-update automation.

### P2 — performance and accessibility budgets

Add mobile Web Vitals, API latency, upload failure rate, publishing-success rate, webhook delay, and
background-job age dashboards. Run automated accessibility checks and keyboard/mobile workflows in
CI.

## Competitive benchmark

- Buffer documents organization/channel permissions, separate access levels, and approval-aware
  drafts.
- Hootsuite documents multi-step approvals and failure reasons visible in its calendar.
- Sprout documents customer audit trails, multi-step approvals, multi-channel failed-post alerts, a
  failed-post workspace, and an emergency publishing pause.
- Later documents explicit expired-connection detection and detailed failed-post troubleshooting.
- Zernio bills per connected account with daily proration, making automatic disconnection a direct
  cost-control requirement.

WaveOS already has stronger client billing integration, mixed external/local media organization, and
storage lifecycle controls than the compared publishing products document as one cohesive workflow.
It should not claim overall technical superiority until P0 items are live and P1 security,
observability, audit, recovery, and incident controls have been verified.

## Sources

- https://support.buffer.com/articles/adding-users-and-setting-up-permissions-ixjiLpe2fd
- https://help.hootsuite.com/s/article/troubleshoot-failure
- https://help.hootsuite.com/s/article/ask-for-approval
- https://sproutsocial.com/security/sprout-social-application/
- https://support.sproutsocial.com/hc/en-us/articles/360032870391-Failed-post-notifications
- https://help.later.com/hc/en-us/articles/360060833574-Troubleshooting-Failed-Posts
- https://docs.zernio.com/pricing
- https://supabase.com/docs/guides/security/product-security
