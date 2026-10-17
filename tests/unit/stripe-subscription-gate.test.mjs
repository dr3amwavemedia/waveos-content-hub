import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

// Load the pure mode helpers from stripe.server.ts (no network calls).
const source = readFileSync("src/lib/stripe.server.ts", "utf8")
  .replace('const STRIPE_API = "https://api.stripe.com/v1";', "")
  .replace(/export async function stripeRequest[\s\S]*$/m, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const stripe = {};
new Function("exports", "process", compiled)(stripe, process);

const KEYS = [
  "WAVEOS_STRIPE_LIVE_SECRET_KEY",
  "WAVEOS_STRIPE_TEST_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "WAVEOS_ENABLE_LIVE_SUBSCRIPTIONS",
];
function withEnv(env, fn) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, env);
    return fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const subscriptions = readFileSync("src/lib/social-subscriptions.functions.ts", "utf8");
const checkoutHandler = subscriptions.slice(
  subscriptions.indexOf("export const createSocialSubscriptionCheckout"),
  subscriptions.indexOf("export const confirmSocialSubscriptionCheckout"),
);

test("WaveOS subscription checkout is refused with a live key when the switch is off", () => {
  withEnv({ STRIPE_SECRET_KEY: "rk_live_example" }, () => {
    assert.equal(stripe.stripeIsTestMode(), false);
    assert.equal(stripe.stripePublicSubscriptionsEnabled(), false);
  });
  withEnv(
    { STRIPE_SECRET_KEY: "rk_live_example", WAVEOS_ENABLE_LIVE_SUBSCRIPTIONS: "false" },
    () => assert.equal(stripe.stripePublicSubscriptionsEnabled(), false),
  );
  // The gate runs before any Stripe call that creates or reuses a subscription session.
  const gate = checkoutHandler.indexOf("if (!stripePublicSubscriptionsEnabled())");
  const firstStripeCall = checkoutHandler.indexOf("await stripeRequest");
  const createCall = checkoutHandler.indexOf('stripeRequest<StripeCheckoutSession>("/checkout/sessions"');
  assert.ok(gate > 0, "subscription checkout must check the live-subscription switch");
  assert.ok(gate < firstStripeCall && gate < createCall);
  assert.match(checkoutHandler, /mode: "subscription"/);
  assert.match(checkoutHandler, /data_source !== "os_data"/);
});

test("WaveOS subscription checkout is allowed when the switch is on, or with a test key", () => {
  withEnv(
    { STRIPE_SECRET_KEY: "rk_live_example", WAVEOS_ENABLE_LIVE_SUBSCRIPTIONS: "true" },
    () => assert.equal(stripe.stripePublicSubscriptionsEnabled(), true),
  );
  withEnv({ WAVEOS_STRIPE_TEST_SECRET_KEY: "sk_test_example" }, () =>
    assert.equal(stripe.stripePublicSubscriptionsEnabled(), true),
  );
});

test("the subscription switch does not gate generic Stripe requests", () => {
  const request = readFileSync("src/lib/stripe.server.ts", "utf8").slice(
    readFileSync("src/lib/stripe.server.ts", "utf8").indexOf("export async function stripeRequest"),
  );
  assert.doesNotMatch(request, /stripePublicSubscriptionsEnabled|ENABLE_LIVE_SUBSCRIPTIONS/);
});

test("DWM invoice checkout and payment flow are not blocked by the subscription switch", () => {
  const payments = readFileSync("src/lib/payments.functions.ts", "utf8");
  assert.doesNotMatch(payments, /stripePublicSubscriptionsEnabled|ENABLE_LIVE_SUBSCRIPTIONS/);
  assert.match(payments, /stripeRequest/);
});

test("DWM card setup and autopay are not changed by the subscription switch", () => {
  for (const file of [
    "src/lib/autopay.functions.ts",
    "src/routes/api/public/hooks/charge-autopay-due.ts",
  ]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /stripePublicSubscriptionsEnabled|ENABLE_LIVE_SUBSCRIPTIONS/, file);
    assert.match(text, /stripeRequest/, file);
  }
});
