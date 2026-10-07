# Zernio subscription offboarding and reactivation

## Product decision

Inactive customers keep their WaveOS login and workspace. Inactivity is not deletion. They can sign
back in later, update their payment method, reactivate a subscription, and continue in the same
workspace without creating another account.

WaveOS must track ownership with a verified mapping:

`WaveOS workspace ID -> Zernio profile ID -> Zernio connection IDs`

Never identify connections for disconnection from an email address or business name alone.

## Automatic offboarding

Offboarding begins when a trial expires without payment, a paid period ends after cancellation, a
payment remains unresolved, or the user explicitly closes the account.

1. Lock publishing, scheduling, AI Assist, and new social connections immediately when entitlement
   ends.
2. Preserve login access to billing, invoices, workspace data, and reactivation controls.
3. Notify the customer of the exact scheduled disconnection date.
4. Use a seven-day grace period for trial expiration and unresolved payment failures. A cancellation
   remains active through the already-paid period. An explicitly confirmed account deletion can skip
   the grace period.
5. Create an auditable offboarding job containing the workspace, Zernio profile, current connection
   IDs, reason, deadline, attempts, errors, and completion time.
6. Cancel the pending job automatically if Stripe confirms a successful payment or reactivation.
7. At the deadline, fetch the current accounts directly from the workspace's Zernio profile,
   disconnect every account, fetch again, and complete the job only after Zernio reports zero active
   connections.
8. Notify the customer and OS Data. Failed jobs retry automatically and appear in an OS Data
   **Needs attention** queue only after retries are exhausted.

Run nightly reconciliation between Stripe entitlement, WaveOS subscription state, and Zernio
connections so missed webhooks or manual provider changes cannot leave inactive accounts billable.

## Reactivation

An inactive customer returning later should:

1. Sign in with the existing WaveOS account.
2. See a reactivation screen instead of the normal publishing workspace.
3. Update the existing Stripe customer's payment method and select a plan.
4. Regain plan entitlements only after Stripe confirms payment.
5. Reconnect social accounts through Zernio OAuth if automatic offboarding previously disconnected
   them. WaveOS must not retain or restore old social credentials.
6. Return to the same workspace, folders, drafts, settings, invoices, and Brand Voice data.

The user does not create a new WaveOS account or workspace. A new subscription record may be created
for billing history, but it remains associated with the existing workspace and Stripe customer.

## Retention and deletion

Recommended policy: retain an inactive workspace for 12 months unless the customer requests earlier
deletion or applicable law requires another period. Send reminders before permanent deletion. When
the retention period ends, delete or anonymize customer content according to the published retention
policy while retaining only legally required financial records.

Account deletion must be a separate, clearly confirmed action. It should disconnect Zernio first,
cancel active billing, revoke sessions and integrations, then begin the documented deletion process.

## OS Data controls

Add an **Offboarding & Zernio Usage** view containing:

- active Zernio connections by workspace;
- estimated connected-account cost;
- grace-period deadlines;
- scheduled, canceled, completed, and failed offboarding jobs;
- exhausted retries requiring manual attention; and
- reactivation history.
