# Diagnosis: Social, Deliveries and Stripe mode (read-only)

## 1. Social "Failed to fetch"
- I couldn't reproduce it while signed in. Opening `/social` produced no failed requests to the backend.
- The only failures were the app's own code files aborting (`react.js`, `client.js` and similar, `net::ERR_ABORTED`) while the browser moved from `/` to `/social`.
- The earlier error came from the database connection setup (`src/integrations/supabase/client.ts:19`). It fits a request cancelled by that page change, not a failing table or server function.
- **Severity: LOW, not a bug.** No fix proposed.

## 2. Deliveries 401
- Exact request: `GET https://picture2.frame.io/image/s3://frameio-assets-production/image/0d3852e5-.../image_small_522.jpg?...&sig=...`, loaded twice.
- It's a Frame.io thumbnail link whose signature has expired or is no longer valid. It's an image load in the browser, not a WaveOS table or server function.
- Where: `src/routes/_authenticated/deliveries.tsx` lines 131–137. This `<img>` has **no `onError`**, so the broken image stays on the card.
- `delivery-gallery.tsx` lines 317, 381 and 390 do handle this with a fallback.
- **Severity: MEDIUM** (a cosmetic broken thumbnail, no data risk).
- Minimal fix: add the same `failed` state and `onError` fallback to the file-type icon. Optionally refresh Frame.io thumbnail links when they are loaded.

## 3. Stripe mode (`src/lib/stripe.server.ts`)
- The active key is chosen in this order: `WAVEOS_STRIPE_LIVE_SECRET_KEY`, then `WAVEOS_STRIPE_TEST_SECRET_KEY`, then `STRIPE_SECRET_KEY` (lines 12–19).
- Current runtime (key types only, never values):
  - `WAVEOS_STRIPE_LIVE_SECRET_KEY` and `WAVEOS_STRIPE_TEST_SECRET_KEY` are both unset.
  - `STRIPE_SECRET_KEY` is a **live** restricted key (`rk_live`).
- So every Stripe call runs in **live mode** right now.
- `WAVEOS_ENABLE_LIVE_SUBSCRIPTIONS` only switches public social subscriptions on or off (`stripePublicSubscriptionsEnabled` line 38, used in `social-subscriptions.functions.ts:205`). With it unset, those stay off.
- **These paths do not check that switch and will use the live key:**
  - Invoice checkout: `src/lib/payments.functions.ts` (checkout sessions).
  - Autopay card setup: `src/lib/autopay.functions.ts:31,43`, creating customers and checkout sessions.
  - Scheduled autopay charging: `src/routes/api/public/hooks/charge-autopay-due.ts:116`, creating real payment intents for saved cards.
  - `stripeModeMatches` only makes Stripe objects agree with the key's mode. It does not stop live charges.
- **Answer: yes.** With the test key missing, invoice payments, autopay setup and scheduled autopay charges run against live Stripe whatever `WAVEOS_ENABLE_LIVE_SUBSCRIPTIONS` says. Only public social subscriptions are blocked.
- **Severity: HIGH**, given the safe-mode rule of no real charges.
- Minimal options (need your approval):
  - A. Add a test key as `WAVEOS_STRIPE_TEST_SECRET_KEY` and move the live key out of the fallback. A test key alone won't help while `STRIPE_SECRET_KEY` stays later in the order.
  - B. Add a single launch switch (for example `WAVEOS_ALLOW_LIVE_CHARGES === "true"`). `stripeRequest` would refuse any POST with a live key unless the switch is on, covering invoices, autopay and the scheduled charge hook.

No edits, publishing, deploys or database changes were made.
