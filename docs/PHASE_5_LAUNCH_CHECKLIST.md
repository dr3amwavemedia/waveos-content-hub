# WaveOS Phase 5 launch checklist

Use this checklist in Preview before publishing. Test with accounts created only for QA; never share an owner password.

## Required test roles

- Dream Wave owner/admin
- Sales staff member
- Media manager
- Layer 1 project client: owner, approver, and viewer
- Layer 2 growth client: owner, approver, and viewer
- Layer 3 retainer client: owner, approver, and viewer

## Access checks

- Owner can open every admin, CRM, client, approval, and Vision Studio screen.
- Owner can preview a client as Layer 1, Layer 2, and Layer 3 and can exit preview.
- Sales sees Overview, assigned CRM records, Approvals, and Vision Studio only.
- Media manager sees the approved social/content tools but not Staff or Clients administration.
- Clients never see CRM, Staff, another client workspace, or internal notes.
- Suspended clients have read-only access; expired clients receive the renewal message.
- A direct URL to a hidden route redirects safely.

## Workflow checks

- Create, edit, prioritize, assign, convert, and delete a test lead.
- Import a small Bloom CSV and confirm duplicates are skipped.
- Create a client, edit its name and access, invite a test client, and refresh/revoke the invite.
- Export the client account summary and confirm the values are correct.
- Change an invoice among deposit, paid, and unpaid.
- Add a deliverable revision and confirm the in-app notification appears.
- Confirm the Admin audit history records recent supported actions.
- Permanently delete only a disposable test client and confirm it disappears.

## Mobile checks

Test at 320 px, 375 px, and 430 px wide.

- Bottom navigation has four primary destinations and More.
- The More drawer scrolls while the account footer remains reachable.
- CRM leads and Clients render as cards without horizontal page scrolling.
- Staff controls wrap and all buttons have comfortable touch targets.
- Lead/client dialogs fill the phone screen and remain scrollable.
- Keyboard focus does not hide Save or Close controls.
- iPhone safe-area spacing keeps bottom actions visible.

## Release checks

- `npm ci`
- `npm run typecheck`
- `npm run build`
- GitHub quality check passes.
- Run the read-only Supabase security review and confirm every exposed table has RLS.
- Confirm Outlook navigation remains disabled until its Edge Functions are deployed.
- Publish to Preview, complete the matrix above, and then publish live.
