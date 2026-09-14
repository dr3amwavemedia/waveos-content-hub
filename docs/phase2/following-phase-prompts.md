# WaveOS — saved prompts for the following phase

Drafts only. These have not been sent to Lovable. Run after reviewing GitHub work and choosing the necessary providers. Do not paste all prompts at once.

## Common boundary for every prompt

WaveOS is live. Inspect the current repository and completed Phase 2 work before making changes. Preserve existing clients, emails, roles, workspaces, records, document URLs, delivery links, `/storyboard/` tokens and `/vision/` tokens. Do not overwrite GitHub changes. Prepare and verify work in an isolated staging environment. Do not publish, deploy production migrations, send invitations, enable charges, remove data or revoke existing access without explicit approval. Never claim security is verified based only on a successful build.

## 1. Production data associations

Inspect existing production projects and both vision-board implementations. Propose the smallest additive schema changes needed to associate each project's moodboard, story, script, organization map, equipment and shot list. Preserve existing board URLs and tokens. Existing device-local tools require an explicit import path into a chosen project, not automatic reassignment. Reuse existing structures where possible and show how unlinked old content remains accessible. Implement authorization and tests in staging; include migration and rollback plans for review. The production landing screen should have Upcoming, Current and Past filters and one expandable project at a time, matching the GitHub implementation rather than rebuilding it.

## 2. Payments, signing and access progression

First inventory existing billing, contract and access code, plus available provider connections. Identify the remaining provider choices and secrets without exposing them. After the payment and signing providers are selected, build test-mode embedded payment and signing flows inside WaveOS, reusing existing invoice/contract records where appropriate. Verify signed callbacks, deduplicate events, reconcile delayed payments and handle partial payments, deposits, failures, refunds and disputes. Archive final signed document versions and signing evidence. Only server-confirmed events may satisfy access prerequisites. Preserve existing active-client access and allow invoice/contract access before service access. Demonstrate the complete workflow with synthetic accounts, then provide a reviewed production activation checklist. Do not cancel Bloom.

## 3. Media storage and client galleries

Inspect current delivery links, uploads, storage and embedded players. After the external storage provider is selected, configure a private test bucket and server-side authorization for short-lived uploads/downloads. Keep credentials server-side. Build or connect the GitHub gallery under Deliverables with branded covers, responsive thumbnails, lightbox, permitted downloads and in-app playback. Support resumable uploads and visible retry errors. Propose video transcoding/streaming separately if required. Preserve all existing delivery URLs and assets. Provide a copy-and-verify migration plan with rollback, tenant isolation tests and realistic storage/bandwidth cost estimates before production activation.

## 4. Documents, vendors and exports

Inspect existing invoice, contract, quote and export code. Complete persistent document/version records and vendor relationships needed by the GitHub UI without duplicating existing models. Keep client billing separate from vendor costs and white-label job records. Generate branded PDFs and accountant-ready CSV exports with identifiers, dates, currency, amounts, payment/refund history and document references. Signed documents must remain immutable and retrievable. Clients can download only their own documents; vendors cannot access private client financials. Verify amounts, access and export safety using test records. Do not invent legal terms, tax classifications or vendor-issued documents.

## 5. Deployed security and release verification

Perform a read-only review of the actual deployed auth, database/storage policies, secrets configuration, backups, public sharing and endpoint authorization. Report evidence, severity and a proposed patch for each issue; do not silently tighten policies that could break active clients. Test new patches in staging with owner, staff, freelancer and each client tier, including cross-workspace denial, logout/account switch, expired links and direct URL requests. Verify old links and records survive. Separate confirmed findings from unverified assumptions and provide an explicit rollback and production release plan. Do not send real invitations or change live permissions during the audit.
