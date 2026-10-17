# SaaS Dashboard implementation report

## Route and files
- New route: `/saas-dashboard` (`src/routes/_authenticated/saas-dashboard.tsx`). Owner gate, unique page metadata, KPI cards and Overview, Subscribers, Plans, Revenue, Usage and System Health tabs.
- `src/lib/saas-dashboard.functions.ts`: authenticated read-only reporting; checks the caller's existing `dream_wave_owner` role before privileged reads. No other top-level admin role currently exists in the role enum.
- `src/lib/saas-metrics.ts`: shared calculations and role predicate.
- `src/components/app/app-shell.tsx`: owner-only navigation under OS on mobile and WaveOS App on desktop. Existing DWM menu items/routes are preserved.
- `tests/unit/saas-metrics.test.mjs`: role boundaries, OS versus DWM segregation, internal-test/unfinished-checkout exclusion, trial and failed-payment counts.
- `AGENTS.md`: read-only reporting architecture rule.
- `roadmap.md`: implementation and verification tracking.
- `docs/saas-dashboard.md`: this report.

## Metric sources and limits
All business subscription metrics use `workspaces.data_source = 'os_data'`, exclude demo workspaces, and use `workspace_social_subscriptions` rows with a Stripe subscription ID and without internal test access. DWM client invoices, card setup and autopay are not queried or changed.

| Metric | Source and calculation |
| --- | --- |
| MRR | Unavailable: stored rows do not contain actual recurring Stripe prices, quantities, currency, discounts or effective price history. Catalog prices are not substituted. |
| Active subscribers | `workspace_social_subscriptions.status = active`, no service lock; one workspace subscription is one subscriber, not a deduplicated person. |
| New subscriptions this month | Explicitly labeled **new subscription records**: `created_at` in the current UTC calendar month. Actual activation dates are not stored. |
| Cancellations | Counts `cancel_at_period_end`; canceled records count current `status = canceled`. Monthly churn rate and churn history remain unavailable. |
| Past due / failed payments | Subscription `status = past_due` or `payment_failure_count > 0`, counted once per workspace; not an individual failed-payment event count. |
| Subscriber growth | Unavailable without activation/cancellation history. An explicitly labeled six-month cumulative **OS workspace creation** series uses `workspaces.created_at` for still-stored non-demo OS workspaces. |
| Revenue | `workspace_social_subscription_invoices.status = paid`, sum `amount_paid_cents`, separate currencies; matched to the filtered workspace and stored Stripe subscription ID. Gross stored receipts only, not net revenue, refunds, tax-adjusted revenue or payout totals. |
| Revenue over time | Same paid invoices, grouped by `stripe_created_at` (fallback `created_at`) invoice creation month, not payment settlement date. No historical MRR claims. |
| Plan mix | Active subscription counts by stored `plan`; labels Ripple, Current, Tidal come from `src/lib/social-plans.ts`. |
| Recent activity | Latest subscription rows ordered by `updated_at`, with current status; explicitly not a full event log. |
| Active accounts/workspaces | Non-demo OS workspaces with `status = active` and not archived. Distinct from paid subscribers. |
| Usage | Active workspace count only; engagement/product usage is unavailable. |
| System Health | Existing `social_subscription_lifecycle.state`, recorded checks and presence of `last_error`; no raw error payloads exposed. Uptime, webhook health and error-rate metrics unavailable. |

The page performs no Stripe API writes, checkout changes, webhook modifications, database migrations or data mutations. It does not alter keys, live flags, client access or existing payment records. Reporting fails safely rather than displaying truncated subscription/workspace totals; invoice read/coverage failure is explicitly unavailable.

## Verification
- Signed-in owner opened `/saas-dashboard`; all six tabs loaded real stored data.
- Phone 430×850 and desktop 1280×1800 screenshots reviewed; no horizontal page overflow or runtime page errors.
- Focused SaaS and existing Stripe mode/subscription-gate tests passed, 9/9.
- Full unit suite passed, 205/205 after aligning the new route declaration with the project's route-inventory convention.
- Preview harness reported build OK; no manual build/typecheck was run.
- No publishing, payments, database writes, migrations or permission changes.
- Role denial covered by unit tests and enforced in both route and server; no other user's session was minted for browser verification.