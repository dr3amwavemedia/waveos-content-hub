# Subscription and cross-device release audit

## Objective

Determine, with inspectable evidence, whether WaveOS trials, paid subscriptions and entitlement enforcement are operating correctly and whether critical public WaveOS and DWM client workflows are reliable on mobile and desktop web.

This audit is read-only against production. Any state-changing lifecycle exercise must use an isolated backend and Stripe test mode. It must not create a live charge, change a live plan, replay a production webhook or alter client records.

## Evidence levels

The final report labels every result:

- **Production verified** — supported by authorized read-only production database/provider evidence.
- **Runtime verified** — exercised end to end in an isolated environment with synthetic accounts.
- **Browser verified** — observed in the named real browser/device and environment.
- **Code/test supported** — supported by implementation review or automated tests but not a live lifecycle.
- **Unverified** — required evidence was unavailable or blocked.

Static tests that search source code for expected strings cannot be presented as proof that Stripe, Supabase, email, OAuth or a deployed browser flow currently works.

## Production subscription reconciliation

For every OS workspace, reconcile:

- workspace data source and active membership;
- subscription plan, status and account limit;
- trial start/end and promotional redemption where applicable;
- billing interval and current period end;
- Stripe customer, subscription and checkout identifiers;
- cancellation and payment-failure state;
- service lock and feature entitlement result;
- internal-test or future complimentary entitlement source;
- connected-account count against the plan limit;
- latest subscription invoice and recent lifecycle/webhook evidence.

Flag impossible or suspicious combinations, including:

- active paid plan without an authoritative Stripe subscription;
- trialing without the required Stripe/promo conditions;
- expired trial that still receives paid features;
- active subscription that is service locked;
- canceled/expired subscription that can publish, schedule, connect accounts or use premium AI;
- valid recovered payment that remains locked;
- duplicate Stripe subscription or Checkout IDs;
- DWM client workspace appearing in OS subscription tables;
- internal-test or complimentary access counted as paid MRR;
- account usage over the plan limit;
- checkout-pending records that are stale with no recoverable provider state.

Cross-check Stripe read-only objects for status, customer/workspace metadata, plan/price, interval, period, cancellation, latest invoice and collection state. Redact emails, customer IDs and payment details from the user-facing report.

## Webhook and lifecycle health

- Confirm the deployed webhook endpoint and intended Stripe mode/account.
- Review recent event counts, event age, signature-verification failures, duplicates and processing errors.
- Confirm idempotent claims prevent duplicate lifecycle effects.
- Measure time from provider event to subscription/invoice/entitlement update.
- Verify checkout success, subscription changes, invoice success/failure and cancellation events map to the expected WaveOS state.
- Verify transactional email outcomes separately from entitlement success; an email failure must not corrupt billing state.
- Never replay production events during the audit.

## Isolated Stripe test-mode lifecycle

Use synthetic accounts and a truly separate backend to exercise:

1. account creation and workspace provisioning;
2. plan selection and secure hosted Checkout;
3. return confirmation and webhook activation;
4. promo-trial card collection and trial entitlement;
5. trial end and first successful invoice;
6. first failed payment and grace state;
7. second failed payment and service lock;
8. payment-method update and confirmed recovery;
9. cancellation at period end and final access boundary;
10. reactivation without losing workspace content/connections;
11. billing portal access for authorized billing admins only;
12. plan/account-limit enforcement and provider reconnection behavior.

Record the exact expected and observed state after each transition. No test-mode success may be presented as live-production proof.

## Mobile and web matrix

Minimum environments:

| Device/browser | Required context |
| --- | --- |
| iPhone Safari | Normal browser tab |
| iPhone Home Screen | Installed standalone/PWA context |
| Android Chrome | Mobile browser and installable context where supported |
| Desktop Chrome | Current supported desktop flow |
| Desktop Safari | Current supported macOS flow |
| Desktop Edge | Current supported Windows/browser flow |

Critical journeys:

- signup, email confirmation, sign-in/out and password recovery;
- checkout redirect, browser return, refresh and duplicate-payment protection;
- Settings subscription state, invoices and billing portal;
- workspace selection and session persistence;
- social account connection/reconnection;
- Create Post with device upload and supported external media;
- analytics sync/readiness and honest unavailable states;
- Campaign Manager save/reload and caption workflow;
- My Agent access and permission behavior;
- DWM client approvals, complete deliveries, contracts and invoices;
- error recovery, keyboard behavior, safe areas, orientation and responsive layout.

No live content is published, no live charge is made and no real signature request is sent during verification.

## Automated and technical gates

- clean dependency install;
- TypeScript typecheck;
- complete unit suite;
- production build;
- targeted billing and entitlement tests;
- authenticated smoke tests in the isolated environment;
- browser console and failed-network-request review;
- accessibility and keyboard checks on critical screens;
- route/link, overflow and responsive checks;
- Supabase RLS/privilege/advisor review for billing tables and privileged functions.

## Current evidence note — November 9, 2026

- The repository contains dedicated tests for subscription gating, signup, promo trials, payment locks, display state, Stripe mode, mobile session persistence and responsive shell behavior.
- Several billing tests validate source structure and expected code patterns; they do not execute a complete real provider lifecycle.
- Production reconciliation SQL exists, but prior documentation states the connected Supabase account did not expose the documented production project. Therefore live production subscription health cannot be claimed from repository evidence alone.
- The known iPhone Home Screen Google Drive regression remains a release blocker, so cross-device health cannot currently receive an unconditional pass.
- Priorities P1–P9 also contain documented capability and experience gaps that must be reflected in any release decision.

## Final decision format

The report ends with one decision:

- **Pass** — all critical production reconciliation and device journeys pass with no open P0/P1 blocker.
- **Conditional pass** — core billing/access is verified, with explicitly accepted non-critical limitations and owners/dates.
- **Fail / not release-ready** — billing evidence is inconsistent/unavailable or a critical mobile/web journey is broken.

Every failure includes severity, affected users, evidence, reproducible steps, owner, safe next action and retest criteria.
