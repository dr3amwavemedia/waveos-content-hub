# Complimentary WaveOS access codes

## Product intent

An authorized DWM owner/admin can issue a code that lets an eligible WaveOS user skip payment entirely and receive the selected WaveOS plan and its included platform access. This is **complimentary access**, not a free trial, extended trial, discount, coupon or fake paid subscription.

## Admin controls

When creating a code, the owner/admin selects:

- internal label and secure redemption code;
- WaveOS plan: Ripple, Current or Tidal;
- maximum redemptions;
- when the code can be redeemed;
- optional eligible email address or email domain;
- access duration: until explicitly revoked or until a stated access end date;
- whether future redemptions are active or paused.

The admin can see redemptions and active grants, pause future use, and explicitly revoke or change an individual grant. Editing a code never silently changes users who already redeemed it.

## Redemption behavior

1. The user signs in or creates a WaveOS account and enters the complimentary code.
2. The server resolves the user, OS workspace and current billing state.
3. The server validates code availability, eligibility, redemption limits and the selected plan atomically.
4. WaveOS creates a distinct complimentary entitlement and grants the selected plan's normal features and connected-platform limits.
5. The user enters WaveOS without Stripe Checkout, a payment method, a trial record or a payment due date.
6. Both the user and admin see a durable receipt stating the plan, complimentary status, grant date and duration.

The same user or workspace cannot consume the same code twice. A general code may support multiple users only up to its configured redemption limit.

## Billing and entitlement safeguards

- Complimentary access is a first-class entitlement source such as `complimentary_code`; it must not reuse `trialing`, `internal_test_access` or a fabricated Stripe status.
- Redemption creates no Stripe customer, subscription, Checkout Session, invoice or payment-failure lifecycle.
- An existing active Stripe subscription is never cancelled, overwritten or converted by code redemption. The user receives a clear message and the admin must handle any future transition explicitly.
- Existing failed, cancelled or incomplete Stripe records require an admin-reviewed transition so provider events cannot later overwrite the complimentary state.
- Feature access and connected-account limits come from the selected Ripple, Current or Tidal plan. Complimentary status bypasses payment collection only; it does not bypass plan limits, workspace membership or role permissions.
- Revocation removes the complimentary entitlement according to the documented access policy without deleting the workspace, content, social connections or audit history.
- Paid revenue, MRR and subscriber calculations exclude complimentary grants. Operations reporting counts them separately.

## Security and audit requirements

- Only a server-verified DWM owner/admin can create, edit, pause or revoke codes and grants.
- Redemption endpoints use rate limiting and generic invalid/unavailable responses to reduce code enumeration.
- High-value codes should be securely generated; validation must not expose the list of valid codes to clients.
- Redemption count checks and entitlement creation occur in one database transaction so concurrent requests cannot exceed the limit.
- Every lifecycle action records the actor, code/grant identifier, user, workspace, selected plan, before/after state, reason and timestamp in the activity log.
- Tables in the exposed schema require RLS and least-privilege grants. Users may read only their own resulting entitlement and cannot write plan or grant state directly.

## Current-state gap confirmed November 9, 2026

- Current OS promo codes only add limited bonus days to a promotional trial.
- WaveOS already has an owner-only complimentary invitation flow for a brand-new email, but it is not a user-redeemable code and it rejects existing accounts.
- That invitation currently uses `internal_test_access`, which mixes complimentary customers with internal product testers and should not become the permanent model for this feature.
- The administrative `payments_enabled` profile flag explicitly does not change Stripe or subscription entitlement.

Therefore, the requested payment-waiver code does not exist yet and must be implemented as a separate, auditable complimentary entitlement.
