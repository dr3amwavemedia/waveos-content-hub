# WaveOS staging isolation — setup guide

## Why this exists

Today the WaveOS preview and the live site at `waveos.dreamwavemedia.co` are
served by **one and the same backend**. There is no second database. That means
any test payment, signature request, migration or webhook we register lands in
the same place as real client records. That is the blocker this document closes.

## What the build system can and cannot do

| Capability | Available from inside this project? |
| --- | --- |
| Create a second database inside this project | No — one project has exactly one backend |
| Create a *draft* of this project | Yes, but a draft shares the same backend, so it does **not** isolate data |
| Create a brand-new project with its own backend | No — project creation is an account action |
| Prepare the staging code, schema, seed data and webhook handlers | Yes (done, see below) |

So option 1 (a separate staging project) is the safest available route, and it
needs a small number of manual steps from the account owner.

## Manual steps for the owner

1. **Create the staging project.** In the Lovable dashboard, use *Remix* /
   *Duplicate* on `waveos-content-hub` and name it `waveos-staging`.
   A remix gets its **own** database, auth users, storage and secrets. It does
   not copy any row, user or uploaded file from the live backend.
2. **Confirm isolation.** In the new project, open the backend view and check
   the workspaces/clients tables are empty. If any real client row appears,
   stop — the copy was not a clean remix.
3. **Publish staging** so it gets its own public HTTPS address, e.g.
   `https://waveos-staging.lovable.app`. Keep it private/unlisted.
4. **Apply the staging schema.** In the staging project's SQL editor, run
   `docs/phase2/staging/0006_contract_signature_archive.sql` from this repo.
   (Migrations `0000`–`0005` come across with the remix.)
5. **Add staging secrets** (staging project only — never reuse live values):
   - `WAVEOS_PUBLIC_RETURN_URL` = the staging address from step 3
   - `WAVEOS_STRIPE_TEST_SECRET_KEY` = a Stripe **test** secret key
   - `STRIPE_WEBHOOK_SECRET` = from step 6
   - `SIGNWELL_API_KEY` = SignWell key, `SIGNWELL_LIVE_MODE` left unset
   - `SIGNWELL_WEBHOOK_ID` = from step 7
6. **Stripe test webhook** (test mode only, "Your account", not Connect):
   `https://<staging-domain>/api/public/hooks/stripe`
   Events: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded`, `charge.dispute.created`.
   Copy its `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
7. **SignWell test webhook:**
   `https://<staging-domain>/api/public/hooks/signwell`
   Copy the webhook's **ID** (not a secret you invent) into
   `SIGNWELL_WEBHOOK_ID` — SignWell signs each event with that ID.
8. **Seed synthetic data only.** Two fake client workspaces, fake contacts with
   mailbox addresses you own, fake invoices. No real name, email, document,
   provider link or session is ever copied over.

## About the three completed Stripe test sessions

The $1,000, $1,500 and $900 test-mode checkouts are preserved as evidence in
Stripe. They are not re-charged and their browser redirects never mark an
invoice paid — only a signature-verified webhook does that.

**Can their events be replayed into staging later?** Partly, and it is not
recommended as-is:

- Stripe can resend past events to a destination, but those events carry the
  original session and invoice IDs, which will not exist in a fresh staging
  database. The staging handler would correctly reject them as unknown.
- The clean equivalent is `stripe trigger checkout.session.completed` against
  the staging endpoint, or simply running a fresh test checkout end to end in
  staging. That proves the same path with IDs staging actually owns.
- They must **not** be reconciled into real accounting or used to unlock any
  real deliverable. They remain test-mode evidence only.
