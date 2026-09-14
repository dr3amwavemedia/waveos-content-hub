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

- A clean dependency install and CI check against the committed lockfile.
- Full staged authenticated regression for CRM invitation sending, each user tier, client-profile controls, gallery access/downloads and invoice deep links. No real invitation was sent during testing.
- Verify the production login/refresh report with isolated accounts and network conditions.
- Review and explicitly approve release. Preserve main and production until then.

## Remaining Phase 2 / integration work

- Per-project persistent planning tools and board association: requires the additive data-model work recorded in the following-phase prompts. Existing personal prep tools are preserved, not falsely presented as project-specific storage.
- Complete CRM button/role audit, personal/business display override, expanded accounting/PDF exports and vendor documents.
- Polished complete gallery delivery workflow and external storage; embedded payments/signatures and automatic server-enforced access progression.
- Deployed security, backup/restore, hosting and billing review.

The full requirement inventory and integration prompts are adjacent to this file. This batch is not completion of the entire Phase 2 plan.
