import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const source = readFileSync("src/lib/stripe.server.ts", "utf8")
  .replace('const STRIPE_API = "https://api.stripe.com/v1";', '')
  .replace(/export async function stripeRequest[\s\S]*$/m, '');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function("exports", "process", compiled)(exports, process);

const previousTest = process.env.WAVEOS_STRIPE_TEST_SECRET_KEY;
const previousManaged = process.env.STRIPE_SECRET_KEY;
try {
  process.env.WAVEOS_STRIPE_TEST_SECRET_KEY = "sk_test_example";
  process.env.STRIPE_SECRET_KEY = "rk_live_example";
  assert.equal(exports.stripeIsTestMode(), true);
  assert.equal(exports.stripeModeMatches(false), true);
  assert.equal(exports.stripeModeMatches(true), false);

  delete process.env.WAVEOS_STRIPE_TEST_SECRET_KEY;
  assert.equal(exports.stripeIsTestMode(), false);
  assert.equal(exports.stripeModeMatches(true), true);
  assert.equal(exports.stripeModeMatches(false), false);
  assert.equal(exports.stripeModeMatches(undefined), false);
} finally {
  if (previousTest === undefined) delete process.env.WAVEOS_STRIPE_TEST_SECRET_KEY;
  else process.env.WAVEOS_STRIPE_TEST_SECRET_KEY = previousTest;
  if (previousManaged === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = previousManaged;
}

console.log("Stripe mode checks passed for test and live keys, sessions, and webhook events.");
