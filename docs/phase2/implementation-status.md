# Phase 2 — first implementation batch

Prepared on an isolated branch. Not merged or published. No production database writes, migrations, invitations, provider setup or live user/link changes performed.

## Implemented

- Client name opens the existing profile drawer on desktop/mobile; labeled Profile action replaces the three-dot affordance. Drawer tools wrap into a mobile grid.
- Invitation form prefills the linked CRM primary contact, with business-email fallback. Manual field edits—including clearing a field—take precedence over late/refetched contact data. Form remounts for a different workspace. Conversion still creates no invitation; sending remains explicit.
- Production Upcoming/Current/Past filters and search; one expanded project at a time. Existing status editor remains. Filters never update records. Today and personal prep tools are collapsed initially, preserving existing device-local data.
- Project-client home gets compact document/delivery/project shortcuts. Invoice/contract lists collapse. Existing hash links reveal the appropriate section.
- Uploaded photos open in an accessible in-app lightbox; existing downloads and video playback remain. Gallery shortcut added under Deliverables. Existing storage and share URLs remain unchanged.
- Skippable/restartable guide uses the current user's permitted navigation. Progress is browser-local and keyed by user, workspace and tier/staff context, not a shared global completion flag. Tutorial completion grants no access.
- Session and role reads have timeout recovery, plus a visible route-loading state. Authorization predicates are unchanged. This is resilience work, not proof that the reported production login problem is fully diagnosed.

## Verified

- TypeScript check and production build pass using the existing local dependency installation.
- Contact-selection tests: primary contact, business fallback, blank/missing fields, normalization and no source-record mutation.
- Timeout tests: success, original error, stalled read and safe late rejection.
- Existing payment-progress tests pass.
- Synthetic, writes-disabled browser preview: mobile project expansion/minimize, folder switching, search empty state; guide start/next/back/skip and persistence after reload.

## Still required before this batch can go live

- GitHub CI passed its install, typecheck and build workflow. The existing workflow regenerates the lockfile before `npm ci`; a strict unchanged-lockfile reproduction remains a separate release check.
- Full staged authenticated regression for CRM invitation sending, each user tier, client-profile controls, gallery access/downloads and invoice deep links. No real invitation was sent during testing.
- Verify the production login/refresh report with isolated accounts and network conditions.
- Review and explicitly approve release. Preserve main and production until then.

## Remaining Phase 2 / integration work

- Per-project persistent planning tools and board association: requires the additive data-model work recorded in the following-phase prompts. Existing personal prep tools are preserved, not falsely presented as project-specific storage.
- Complete CRM button/role audit, personal/business display override, expanded accounting/PDF exports and vendor documents.
- Polished complete gallery delivery workflow and external storage; embedded payments/signatures and automatic server-enforced access progression.
- Deployed security, backup/restore, hosting and billing review.

The full requirement inventory and integration prompts are adjacent to this file. This batch is not completion of the entire Phase 2 plan.

## Additional GitHub work — September 14

- Added per-project Story, Script, Equipment, Shot list and Organization notes, plus an explicit association with an existing production vision board. Only published boards offer the existing freelance share URL; no token or sharing policy changes. Organization currently means crew roles/responsibilities in a text plan, not a graphical diagram. Vision Studio decks are still a separate system.
- Added a draft additive migration for those project columns. It inherits the current staff-only project policies. **Not applied or tested against a real database; staging migration and access tests are required.** The UI reports unavailable tools when the schema is absent. Existing personal prep data is not moved or erased.
- Saves check the project's update timestamp to reject stale edits. Tool/folder/project changes warn before discarding unsaved text; browser unload is protected. General in-app navigation away still requires a broader navigation-blocker pass.
- Added invoice record CSV and printable/PDF reports to staff client invoices and project-client home. Filters apply to issued date (UTC) and status. Cents, currency, recorded paid and balance are separate columns; unknown totals stay blank, overpayments remain negative balances. This is a record export, not a verified receipt, executed contract archive or complete tax ledger.
- Added a business-name display preference to existing workspace feature settings, reflected in the shared account footer and project-client greeting. Person records, email, roles and membership are unchanged. Other tier-specific greetings still require review.
- Account profile, role and membership read failures now surface errors instead of becoming empty results; account/workspace reads have timeouts and retry UI. Production login diagnosis remains open.
- Explicit workspace predicate added to the existing invoice-delete query.

Additional verification: TypeScript and targeted lint; invoice export unit checks covering partial/unknown/overpaid amounts, CSV formula protection and HTML escaping; mobile synthetic preview verified separate project fields and no note carry-over into another project. Synthetic writes stay in memory and do not validate deployed RLS or persistence.

The user confirmed there is no selected payment/signature provider. Keep provider activation in the following phase. Do not cancel Bloom.

## Gallery and document navigation batch

- Replaced the flat uploaded-media list with a workspace collection: photo/video filters, filename search, 24-record pages, a shared next/previous viewer, in-app video controls, preview retry and original-file links. Media records and storage paths remain unchanged. Frame.io imports with no playable original use their existing provider fallback instead of treating a thumbnail as the original.
- Gallery, project links and connected-media errors are independent, so one unavailable source does not hide the others. Larger collections can load subsequent pages rather than relying on an unpaged response. Existing storage still serves full-sized WaveOS images; thumbnail generation/external storage is not implemented by this UI change.
- Wedding home now has compact contract/payment/contact/delivery shortcuts and collapsible document lists. Existing active/pending gates remain unchanged. Standard client tiers already share Layer1Overview in home.tsx, so the earlier compact layout also covers growth/retainer/social clients.
- Router-aware expandable document sections preserve existing invoice/contract hash navigation, including tutorial links. Dialog close controls have larger touch targets.
- Contract record CSVs added to staff client profiles and both client home variants. They export recorded status/date metadata only and exclude hosted signing URLs. They are not an executed-contract archive. Wedding clients also receive the invoice export controls.

Verification: TypeScript, local production build, focused lint and invoice/contract export tests passed. A 390px synthetic preview verified viewer next/previous, pagination from 24 to 30 sample files, search locating file 30 and a document hash opening its collapsed section. No authenticated database or provider integration was exercised. The gallery uses the existing access checks; no permission/security certification is implied.

## Explicit production moves

- Added labeled Move to Upcoming / Current / Past controls. Confirmation explains the exact status change (Pre-production / Shooting / Complete). Merely opening a folder remains read-only. Successful moves reveal the destination folder.
- Status saves compare the original status and require a returned row; stale or denied updates cannot silently appear successful. Failed saves keep the expanded project and draft notes. Project switching and note editing pause while the status request is pending. Unrecognized existing statuses remain visible in the status selector.
- Mock query tests verify project/status predicates, returned-row checks, network failure and no source mutation. No production database query or write was used; staging persistence and permission tests remain required. Supabase guidance informed the returned-row check without changing authorization policies.
