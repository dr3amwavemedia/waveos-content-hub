# Phase 2 merge readiness

**Not ready to merge.** PR #75 is a draft. This checklist deliberately separates code present from verified full requirements.

| Requirement | Current coverage | Still needed |
| --- | --- | --- |
| Production folders and mobile project expansion | Implemented | Full staged workflow; direct Move to folder UX |
| Tools inside each project | Text planning and production-board association implemented | Apply/test additive schema in staging; structured checklist/organization diagram; Vision Studio association; project-specific deliverables |
| Preserve freelance links | Existing production-board URLs reused | Deployed share-link and cross-account regression |
| CRM conversion and invitation email | Prefill and explicit send implemented | Staged conversion, duplicate/missing contact, invitation and all CRM control/role tests |
| Clients directory | Name opens profile; labeled actions | Full client-button audit and long-name mobile checks |
| Personal/business identity | Preference in staff Access settings, shared footer and project-client greeting | Other tier greetings; staged preference save |
| Login/refresh | Bounded reads, errors and retry UI | Reproduce original issue; expired session, account switching and every role |
| Compact dashboards/tutorials | Project-client shortcuts and role navigation guide | Full tier-specific home layout and tutorial walkthrough |
| Gallery | In-app photo viewer and gallery entry | Branded cover, large-gallery workflow, download permissions and external storage |
| Accounting export | Existing invoice CSV/print report and CRM CSV | Contracts/quotes/receipts/vendor records, approved templates, complete ledger and client downloads across tiers |
| Payments/signatures/access progression | Planned | Provider selection, server integration, webhook/security tests and pilot |
| Private data/archives | Existing access rules preserved | Deployed policy audit, backup/restore and signed-document retention |

## Release sequence

1. Finish the unresolved code above; don't call it provider setup if it is ordinary application work.
2. Use a separate test database and disposable accounts for migration, permissions and end-to-end tests. No live invites, client writes or production migration for testing.
3. Record preview evidence and migration rollback/deactivation procedure. Leaving unused additive columns is safer than dropping them after data exists.
4. Review the final diff and release approval before merging main or publishing. Existing clients retain access and all existing links.

No production data, provider account, invitation or deployment changed in this implementation session.
