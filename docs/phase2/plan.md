# WaveOS — Phase 2 implementation plan

Status: planning and source inspection only. No application code, live data, permissions, existing links, or production deployment changed.

Priority: make daily client and staff tasks easy on phones, keep clients inside WaveOS, and preserve the live service.

## What the current code confirms

- The production dashboard contains separate quick actions, today's panel, projects panel, and device-local preparation tools. A project-centered layout needs both UI consolidation and persistent project associations.
- CRM conversion already links the lead to a new workspace and does not call the invitation sender. Client profile editing already reads linked CRM contacts. However, `InviteQuickForm` initializes email and person names to empty strings. Prefilling that form from the linked contact is a concrete first fix; it must not send automatically.
- Contracts and invoices already have records and status displays, but currently open provider URLs. A recorded status is not proof of verified payment or an executed contract.
- Client account summary CSV export exists. It is not a complete accounting export or a replacement for signed-document archives.
- Two vision sharing routes exist: `/storyboard/<public_token>` and `/vision/<share_token>`. Preserve both and their existing tokens.
- Login code already includes session retries and delayed work outside authentication callbacks. The reported refresh problem still needs reproduction; do not assume another retry solves it.

Source inspected: current `main` in a separate `waveos-phase2` checkout, on local branch `codex/phase2-client-experience`. Existing dirty checkouts and the old Codespace were left alone.

## A. GitHub-first work

These can be implemented and reviewed as code. Items involving new persistent fields also need a separately reviewed database migration before release; being in GitHub does not make them safe to activate automatically.

| Order | Area | Required change | Verification before release |
| --- | --- | --- | --- |
| 1 | Login and authorization | Reproduce cold login, refresh, return from invitation, expired session, slow connection, account switching, and staff preview. Provide bounded loading, useful recovery, and stable session handling without loosening authorization. | Test each existing role/tier with isolated accounts; verify users cannot see a previous user's cached data or another workspace's documents. |
| 2 | CRM contact handoff | Prefill invitation email and person names from the linked primary CRM contact, falling back to the business email. Keep existing profile data editable. Clearly say that conversion creates a profile only; invitation is a separate explicit action. | Convert a test lead; verify no email/invite sent. Open profile, verify details, open invite, verify populated fields. Test missing email, multiple contacts, duplicates, retry and validation failures. |
| 3 | CRM controls | Audit search, filters, lead details, edit, contacts, activities, follow-ups, import/export, conversion and workspace linking. Use labeled actions, readable errors and mobile layouts. | Record pass/fail for each control and each permitted staff role. Destructive controls tested only on disposable data. |
| 4 | Clients directory | Make the client name/card an obvious keyboard-accessible profile opener. Keep secondary actions labeled inside the profile; don't depend on a three-dot menu. Show business and contact names separately. | Tap, keyboard, small-screen and long-name tests; secondary buttons must not accidentally open or close the card. |
| 5 | Personal names | Use the person's name in their own greeting/profile by default. Keep business name for workspace identity. Add an explicit admin-controlled business-name-only display preference if no equivalent already exists. | Multi-user businesses retain different person identities; display preferences never change login email, ownership or access roles. Existing missing names get a safe fallback. |
| 6 | Production layout | Replace the cluttered landing area with Upcoming, Current and Past project views, counts, search and compact cards. Keep an explicit Move to… action; opening a folder only filters and never changes project status. | Existing projects remain visible. Unscheduled projects are discoverable. Timezone boundaries and status transitions tested. |
| 7 | Project workspace | Expand one selected project at a time, with Minimize/Close returning to the list. Place moodboard/vision board, story, script, organization map, equipment, shot list, schedule/location and deliverables inside it. | Links resolve to the correct project; no project sees another project's notes. Existing device-local checklists are not silently overwritten or assigned to an arbitrary project. |
| 8 | Vision sharing | Link the correct board directly from its project. Preserve existing direct freelance links. Add clear Copy share link controls, and design scoped expiration/revocation for new links where supported. | Existing URLs still work as intended. A freelance link grants only the shared board and intended assets, never CRM, invoices, contracts or unrelated projects. |
| 9 | Client home | Compact tap cards for Invoices, Contracts, Deliverables/Gallery, Projects and Help, with counts/status and one clear next action. Put long lists inside their destination screens. | At common phone sizes the primary action grid appears near the top without horizontal scrolling. Support text zoom and assistive technology rather than promising zero scrolling on every device. |
| 10 | Tutorials | A short guided introduction tailored to the actual role/access tier, showing where to find invoices, contracts and deliverables. Next, Back, Skip and Done always work; Help can restart it. | No step points to hidden/unauthorized tools. Progress survives refresh with user-scoped persistence. Skipping the tutorial never skips required payment/signing gates. |
| 11 | Delivery gallery UI | Add a Gallery button under Deliverables. Use a branded cover, generous image grid, mobile lightbox, clear downloads and optional selection/favorites. Keep video playback and document links in WaveOS when supported. | Correct project/client scope, keyboard navigation, loading/error states, large galleries, thumbnail quality and download permissions. Full storage-backed release depends on Section B. |
| 12 | Documents and exports | Build consistent document lists and templates for quotes, invoices, receipts and contracts. Add date/client/project/status filters and professional PDFs plus CSV exports of the underlying records. Clients download only their own documents. | Correct totals/currency/date handling, escaped CSV cells, readable PDFs, no cross-client export, reconciliation with source transactions. |
| 13 | Vendor / white-label work | Separate vendors, outgoing client revenue and vendor costs. Support vendor quotes, agreements, invoices received or issued in the appropriate direction, payment records and receipts only for actual payments. | Vendor financials never appear in client downloads. Identify who issues and receives each document; no fabricated vendor invoice or tax record. |

## Proposed production flow

Production → Upcoming / Current / Past → choose project → expand project details.

Inside the project: Overview; Moodboard / Vision; Story & Script; Organization Map; Equipment; Shot List; Deliverables.

Minimize closes the project. Selecting another opens that project. On mobile, show a short project summary and compact section buttons, loading the selected section rather than rendering every section down the page.

Use existing statuses where possible: assigned/pre-production generally Upcoming; shooting/uploading/editing Current; complete Past. Preserve raw status values and define explicit handling for cancelled/archived/custom statuses before implementing moves. Dates help sorting; they must not silently mark unfinished work complete.

## B. Following phase — integrations, setup and activation

These are not inherently “Lovable-only.” GitHub can contain the implementation, while Lovable or provider dashboards may be needed to configure secrets, deploy server functions and activate approved migrations. Prompts are saved separately and must be reconciled with completed GitHub changes.

### Replace Bloom payments and signing

Build a WaveOS billing/signing experience backed by selected payment and signature providers. Payment fields should be served by the processor; WaveOS should not store raw card details. Prefer an embedded payment experience where supported. Bank authentication or some payment methods may still require a provider-controlled step.

Use server-verified payment notifications, matching client/workspace, currency and amount. Processing/pending is not paid. Handle duplicate, delayed and out-of-order events, failed payments, partial payments, deposits, refunds and disputes. Reconcile missed events. Gate access on the configured payment milestone, not necessarily full payment for every client.

Choose a signature provider based on embedded signing, evidence/audit records, final document export, webhook support and cost. Store final signed documents with their version/hash and evidence record; don't substitute a typed name or a manually set “signed” status for a verified signing workflow. Contract wording, retention requirements and tax requirements need the business's approved policies; this plan is not a legal compliance certification.

Access progression: invited → authenticated → required agreement signed → required payment confirmed → approved service access. Enforce it on the server. Keep document review/payment available before full service access. Existing active clients keep their access; apply the new gates only to explicitly enrolled/new workflows. Do not retroactively lock clients out.

Before cancelling Bloom: archive existing agreements and payment history, reconcile balances, validate the replacement in test mode, run an approved pilot, and check ongoing subscriptions/recurring billing responsibilities. The user's current $70/month spend is the comparison baseline, not a guaranteed saving: processor fees, signature service, storage and maintenance remain to be priced.

### External media storage with an in-app experience

Store original photos and videos in a private external object store, with ownership and metadata in the application database. Cloudflare R2 is a candidate, not a selected or provisioned service. A server checks access before issuing short-lived upload/download URLs. The WaveOS gallery can render that media without navigating clients to the storage provider.

Use image thumbnails and lazy loading; resumable/multipart uploads for large media; quotas and retry/error handling. Video streaming/transcoding is a separate decision from storing original files. Existing embeds and delivery URLs remain supported; migrate by copying and verifying first, never by deleting originals or rewriting all links in place. Browser embedding depends on the source provider's actual permissions and headers.

### Private data and durable documents

Review deployed database/storage policies, server endpoints, share tokens, exports and provider callbacks against the role matrix. Require private defaults, least privilege, server-side access checks, secret storage outside client bundles, auditable changes, verified backups and a restore test. Signed contracts need durable versioned archives and authorized retrieval. Avoid sensitive contents in logs. No production security guarantee until deployed configuration and cross-account access are tested.

## Release boundaries

1. Keep work on isolated branches, not the Lovable-connected main branch.
2. Record existing route/token behavior and representative counts before any migration. Use synthetic clients in a separate test environment.
3. Prefer additive nullable fields and explicit backfills. No deletion/renaming of live IDs, users, workspaces, contracts or delivery links.
4. Review implementation and migration separately. No production writes, invitation sends, provider purchases, or publishing as part of planning.
5. Verify desktop and mobile workflows plus permission failures. A passing build is not an authorization audit.
6. Review a staged preview, document rollback, then obtain the user's explicit release approval before merging/publishing or activating migrations.

## Decisions to resolve when their implementation starts

- Which payment/signature providers and accounts already exist? Which payment milestones should unlock which services?
- What are the exact current roles/tiers and approved tutorial content for each?
- What does “organization map” mean in this workflow: shoot locations, crew assignments, or project structure?
- What upload volume, largest video size, retention period and expected downloads should storage support?
- Which vendor documents are issued by Dream Wave versus received from vendors? Which accounting fields does the accountant require?

## Sources

- Picflow gallery/proofing reference: https://picflow.com/
- Zenfolio gallery reference: https://zenfolio.com/uk/features/photo-gallery/
- Stripe server-confirmed payment fulfillment: https://docs.stripe.com/checkout/fulfillment
- Cloudflare private object access: https://developers.cloudflare.com/r2/api/s3/presigned-urls/

The supplied Picflow landing URL could not be fetched and the supplied Zenfolio page rate-limited the request. Official related pages were used for high-level reference only; no claim is made that their exact layouts were visually reviewed.
