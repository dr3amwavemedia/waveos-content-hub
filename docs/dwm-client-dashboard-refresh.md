# DWM client dashboard refresh requirements

## Product outcome

Every Dream Wave Media client should open a modern, polished WaveOS dashboard that immediately answers:

1. Where does my project or service stand?
2. What needs my attention now?
3. What has Dream Wave delivered or scheduled?
4. Where are my contracts, invoices and payments?
5. How do I contact the team or continue working?

This is a presentation, hierarchy and responsive-experience upgrade over the existing client portal. It is not a replacement for the delivery, document, payment or branding systems.

## Client tiers in scope

- Project Client
- 90-Day Growth Client
- Full Retainer Client
- Social Management Client
- Wedding Client

Each tier keeps its existing permissions and available tools. Wedding clients retain their dedicated wedding information, stage and theme while receiving the same overall quality, responsiveness and clarity as the other dashboards.

## New dashboard hierarchy

### 1. Branded welcome

- Workspace logo or brandmark, configured display name and workspace palette.
- Personalized greeting and concise current relationship/project status.
- One primary next action based only on existing records, such as reviewing content, signing a contract, paying an invoice or opening a new delivery.

### 2. At a glance

- Project or service stage.
- Items awaiting the client's attention.
- Upcoming shoot, meeting, scheduled content or milestone when available.
- Latest delivery and latest approved/published update.
- Financial summary only for roles already permitted to view client financials.

### 3. Quick actions

- Review approvals.
- Open deliveries.
- Review/sign contracts.
- View/pay invoices.
- Request something or contact Dream Wave.
- Open the client-allowed My Agent experience when that feature is implemented.

Only actions permitted by the client's existing tier, status, membership and feature access appear.

### 4. Recent and active work

- Recent deliveries and media.
- Active approvals or requested changes.
- Current/upcoming project work.
- Active contracts and invoices requiring action.
- Historical records inside compact expandable sections rather than dominating the first screen.

## Non-regression contract

### Deliveries

- Continue reading the existing `client_deliveries` and authorized media/provider sources.
- Preserve delivery IDs, kinds, dates, descriptions, URLs, provider detection, previews, open/download actions and access control.
- Do not duplicate, migrate, relabel or rewrite delivery records during the visual redesign.

### Contracts

- Continue using existing `client_contracts` records and provider identifiers.
- Preserve draft exclusion, published visibility, SignWell/Bloom/other-provider state, sent/viewed/signed/declined/expired/void status, signing, PDF and copy/download behavior.
- Do not trigger a signature request, modify a contract or change its provider state during dashboard rendering or testing.

### Invoices and payments

- Continue using existing invoice, autopay schedule and posted payment-ledger records.
- Preserve invoice totals, line-item snapshots, discounts, service fees, schedules, checkout, payment status, receipts and autopay authorization.
- Keep `canViewClientFinancials` and existing RLS behavior unchanged. A member without financial access must not gain it through new summary cards or direct links.
- Do not create a Stripe session or charge while loading or visually testing the dashboard.

### Branding

- Preserve the workspace logo/brandmark, business-name-only preference, configured colors and generated palette.
- Preserve wedding display name, accent/theme, date, location and client-facing welcome copy.
- Branding changes made through the existing editor must remain visible after refresh and workspace switching without changing dashboard permissions or records.

## Responsive and accessibility requirements

- Design mobile first, then use the wider desktop canvas for stronger hierarchy rather than simply stretching phone cards.
- Keep primary actions reachable and obvious without a dense technical dashboard appearance.
- Use readable contrast, visible focus, semantic headings, accessible status text, minimum touch sizes and safe-area spacing.
- Support long business/client names, empty sections, slow providers and errors without overflow or layout collapse.
- Preserve direct links such as invoice, contract and content section hashes and reveal the correct section when opened.

## Verification matrix

For every client tier, test on phone and desktop:

- initial load, refresh and workspace switching;
- logo, name, color and theme persistence;
- active, pending, expired and inactive states where supported;
- approval navigation and requested-change state;
- delivery provider open/download behavior;
- contract view, sign, copy and signed-document download;
- invoice view, payment schedule, checkout entry and autopay authorization without making a live charge;
- financial and non-financial member visibility;
- empty, unavailable and provider-error states;
- direct navigation to dashboard sections.

Use isolated or synthetic records for mutations and payment-provider tests. Production client records must not be altered to verify a visual refresh.

## Current-state note confirmed November 9, 2026

- Standard non-wedding DWM clients currently render the shared `Layer1Overview`; wedding clients render `WeddingOverview`.
- Those components already contain the live delivery, contract, invoice, payment and branding integrations that must be preserved.
- The refreshed experience should reuse those integrations and their authorization checks rather than introduce a second dashboard data model.

The redesign is complete only after the full non-regression matrix passes; a new visual shell alone is not sufficient.
