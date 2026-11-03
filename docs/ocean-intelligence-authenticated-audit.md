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
- The provider's stored dashboard backfill metadata is now returned to the UI, including real ranked-post evidence when the provider supplies it. A single historical observation is presented as an explicit collection state instead of a mostly empty chart.

## Screenshot reconciliation

- Trending Now: provider response text fields are normalized into supported original-video URLs; connection, provider-failure, and no-match states are distinct and never replaced with sample trends.
- Analytics: the growth surface collapses to an honest collection state until at least two compatible observations exist; source coverage, ranges, record counts, and provider-reported top posts remain inspectable.
- Production command center: `/videographer` now opens on today's production window and the current/upcoming/past pipeline, with personal tools secondary.
- Creative Studio: Brand Assist is a compact disclosure so templates and the working canvas remain primary.
- Mobile administration: navigation groups use compact one-column disclosures inside a narrower drawer.
- Content Library: sources, folders, and storage are compact disclosures above the asset controls rather than two permanently expanded side panels.

## Live-data verification note

The connected Supabase account exposed a different project than the WaveOS production project named in the repository reconciliation documentation. A read-only query against the documented production project was denied, so this branch does not claim live-row verification. No database writes were attempted. The UI and server changes preserve unavailable states until the authorized production connection can be checked.

## Review checklist

- Confirm desktop and mobile hierarchy in project-client, wedding-client, public OS, media-manager, crew, sales, and owner workspaces.
- Exercise invoice payment/autopay, contract signing/copy/download, delivery links, social connection, analytics refresh/mode/period/metric controls, and mobile navigation.
- Verify unavailable and partial Analytics states with provider sync, permission, and connection failures.
- Verify Trending Now with a connected provider, an empty result set, a provider failure, and an account lacking competitive-intelligence permission.
- Verify the production current/upcoming/past order, Creative Studio template prominence, Content Library disclosures, and the mobile administration drawer against the supplied screenshots.
- Run typecheck, unit tests, lint, production build, and authenticated Playwright coverage before merge.
