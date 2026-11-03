# Ocean Intelligence authenticated product audit

This branch is a review-only redesign. It changes presentation and hierarchy, not production deployment, workspace authorization, billing, storage, publishing, or analytics calculation rules.

## Shared system

- App shell: deep-navy Ocean canvas, compact cyan-accent navigation, consistent desktop/mobile chrome, and narrow-screen containment.
- Core surfaces: `surface-card`, Ocean panels, hero headers, status pills, controls, and native `details`/`summary` disclosures now share one visual language.
- Accessibility: visible focus treatment, minimum control height, native disclosure semantics, reduced-motion support, and mobile safe-area padding remain in place.

## Authenticated route map

The `_authenticated` route tree remains intact. The shared shell and primitives cover overview, create, social, analytics, competitive intelligence, trending, brand voice, media/content, calendar, approvals, deliveries, creative studio, campaigns, clients, projects, CRM, payments, templates, catalog, admin/tools, OS data, SaaS dashboard, settings, and wedding surfaces.

Routes with dense task-specific editors keep their established interaction patterns and inherit the shared canvas, card, control, navigation, focus, and responsive language. This avoids changing creation, publishing, approval, payment, or administrative behavior during a design-system pass.

## Client dashboards

- Project clients: personalized Ocean hero, project status, action shortcuts, primary action, shoot planning, attention center, Frame.io media, delivery, contracts, invoices, content, and contact remain connected to their existing data and actions.
- Wedding clients: the configured wedding accent is retained inside the same Ocean shell and panel system. Stage, planning, delivery, contract, invoice, and contact behavior is unchanged.
- Financial queries and sections remain gated by `canViewClientFinancials(activeWorkspace?.role)` in both variants.

## Analytics truth model

- Current totals continue to come from provider responses; local WaveOS-published counts are labeled separately.
- Missing, unsupported, expired, failed, or unsynced values remain unavailable rather than becoming zero.
- Trends require dated historical observations. Comparisons remain limited to compatible provider, calculation version, coverage, mode, and equal non-overlapping periods.
- Evidence-backed observations are separated from unavailable content-format, competitive-benchmark, brand-consistency, and AI conclusions.
- Source provenance and calculation detail are compact native disclosures, available on demand.

## Review checklist

- Confirm desktop and mobile hierarchy in project-client, wedding-client, public OS, media-manager, crew, sales, and owner workspaces.
- Exercise invoice payment/autopay, contract signing/copy/download, delivery links, social connection, analytics refresh/mode/period/metric controls, and mobile navigation.
- Verify unavailable and partial Analytics states with provider sync, permission, and connection failures.
- Run typecheck, unit tests, lint, production build, and authenticated Playwright coverage before merge.
