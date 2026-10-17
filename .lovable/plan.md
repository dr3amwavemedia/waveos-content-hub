# Remaining decision: prevent accidental live Stripe charges

The only Stripe key in use is a live one. Invoice checkout, autopay card setup and the scheduled autopay charge hook all use it, whatever `WAVEOS_ENABLE_LIVE_SUBSCRIPTIONS` says.

## Options (choose one)
- **A. Live-charge switch.** In `src/lib/stripe.server.ts`, `stripeRequest` refuses POST calls with a live key unless `WAVEOS_ALLOW_LIVE_CHARGES === "true"`. Add a unit test that a live key without the switch is refused.
  - Effect: published client payments pause until you set the switch.
- **B. Test key.** You add `WAVEOS_STRIPE_TEST_SECRET_KEY`. Change the key order so `STRIPE_SECRET_KEY` (live) is used only when `WAVEOS_ALLOW_LIVE_CHARGES === "true"`, and add the same test.
  - Effect: previews and safe mode use the test key, and live charges need the switch.
- **C. Leave as is.**
  - Effect: live charges keep working, with no protection.

Reply with A, B or C. Nothing will be published, deployed or changed in the database.
