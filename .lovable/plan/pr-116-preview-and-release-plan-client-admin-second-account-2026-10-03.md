# PR #116 preview and release plan (Client Admin / Second Account + invoice delivery locks)

## Current status (checked)
- This project only sees `main` (latest: "Fixed admin workspace routing").
- Branch `codex/mobile-client-portal-preview` and commit `212b716` are **not visible** here yet. PR #116 hasn't been merged or switched into the editor.

## Step 1 — Make the branch visible (you do this, no live impact)
Pick one:
- **Recommended:** in the editor, open the branch switcher (Git/GitHub menu) and select `codex/mobile-client-portal-preview`. The preview then runs that branch. The live site and `main` stay the same.
- Or merge PR #116 into `main` on GitHub. This brings the code in, but it still won't go live until you publish.

## Step 2 — Code review in the preview (no database changes)
- Confirm the commit is `212b716` and list every changed file and migration.
- Review the migration SQL without running it. Check that it only adds things, that existing members and pending invites are grandfathered as Client Admin, that grants and privacy rules are in place, and that it can be rolled back.
- Check that Second Accounts are blocked from invoices, contracts, autopay and payment documents **on the server side**. Hiding the menu items isn't enough.
- Check the delivery lock logic for each invoice state: paid, deposit, unpaid, refunded, and no invoice.
- Run the typecheck and unit tests here.

## Step 3 — Preview walkthrough (read-only)
- Until the migration runs, the new switches can't save. I'll report which screens depend on it.
- Screenshot on desktop and phone: Overview, Deliveries, Invoices, Clients (access switches), and Settings → Team.
- Confirm nothing breaks before the migration: existing clients still see their invoices and deliveries.

## Step 4 — Review report for you
The report will cover:
- Pass / Needs attention for each requirement
- Migration summary and rollback steps
- Any risk to current client access

## Step 5 — Production activation (only after your final "approve")
1. Apply the migration to the live database. Then check that every existing member shows as Client Admin and the counts haven't changed.
2. You publish (Publish → Update).
3. Live check with TEST CLIENT: test a second account and a locked delivery, then clean up.

## Not doing until approved
- No publishing
- No migrations
- No invitations
- No changes to client access
