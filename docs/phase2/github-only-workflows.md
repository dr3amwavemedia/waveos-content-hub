# Phase 2 repository-only workflow improvements

This change completes interface work without adding API endpoints, providers, migrations or integrations.

- Equipment and shot lists get add/check-off controls. Checklist rows are stored as readable text in existing project fields. Previous notes and URLs are preserved; edits still require Save and use the existing conflict/navigation protection.
- Wedding greetings respect the existing business-name preference and otherwise use the signed-in person's name with the previous wedding display name as fallback. Wedding query caches are included in workspace-switch cleanup.
- The workspace guide opens on first visit, supports topic selection and progress display, and remains skippable/restartable. Standard client guides explicitly include Contracts. Existing user/workspace/context progress keys remain unchanged.
- Galleries offer larger or denser previews and a Clear filters action. Existing assets, share URLs, downloads and provider behavior remain unchanged.
- Contract records support print/save-to-PDF as well as CSV. Reports exclude hosted signing URLs and do not represent executed agreements.
- Clients administration includes a collapsible vendor/white-label draft composer for quotes, invoices, receipts and approved contract text. Draft PDFs are clearly marked for review. Editable JSON files can be downloaded/reopened; imports validate size, fields and currencies. Drafts stay in memory and navigation is protected. No draft is sent, entered into billing or represented as verified payment/signature evidence.

## Validation

Targeted tests cover old-note preservation, checklist toggling, amount formatting, HTML escaping, omission of private signing URLs, and draft import validation. Synthetic Playwright coverage adds mobile first-visit guide/topic/skip/restart checks and document input/download/navigation checks alongside existing history-navigation regressions. These tests make no production account or provider requests.

Typecheck, production build and focused lint are run locally; GitHub CI runs typecheck/build, the new unit test and the synthetic browser suite. Deployed authentication, migration availability and live client workflows are not verified by these checks.

## Additional polish before merge

- Editable draft downloads and imports become the saved baseline. New edits restore navigation protection. Starting new drafts or replacing unsaved work requires confirmation across all fields.
- Service lines support quantity/rate calculations and totals rounded to cents. Older draft files still import. Sandboxed in-app previews and vendor/reference-based filenames improve document review and PDF naming.
- Printable invoice reports use currency amounts and separate totals by currency. Unknown amounts are counted and excluded from billed/balance subtotals; paid totals include all records. CSV cents remain unchanged.
- Checklist rows have edit/remove actions with removal confirmation. Raw text collapses once rows exist. Legacy notes remain accessible and untouched by item edits.
- Crew role cards show names, responsibilities and reporting groups. Recognizable crew entries use existing organization text; other text is preserved. Changes require the existing project Save action.
- Gallery density is remembered in the browser. Long names wrap on tiles and display at most three lines in the viewer. Horizontal photo swipes navigate; vertical, multi-touch and video-control gestures are ignored.
- Seventeen styled synthetic browser checks cover guide completion, draft import/reset/saved-state navigation, calculation previews, checklist/crew preservation, gallery preference/touch behavior and printable reports. Phone form checks use 320/375/430px widths and reduced height while focused. Narrow screenshots were visually inspected. Actual iPhone keyboard/printing and authenticated directory controls still require live-device acceptance testing.

## Remaining boundaries

Persistent vendor records, finalized documents, reconciled accounting, signature/payment-driven access and external-storage delivery require backend or integration work. They remain separate from this repository-only change. The reported production login failure also requires authenticated reproduction before it can be called resolved. Production publication and live-data changes are not part of this branch.
