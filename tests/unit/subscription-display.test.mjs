import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync("src/lib/subscription-display.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const subscription = {};
new Function("exports", compiled)(subscription);

test("Stripe lifecycle states are represented without an administrative flag", () => {
  assert.equal(subscription.subscriptionDisplayState(null).key, "none");
  assert.equal(subscription.subscriptionDisplayState({ status: "active" }).key, "active");
  assert.equal(subscription.subscriptionDisplayState({ status: "past_due" }).key, "past_due");
  assert.equal(
    subscription.subscriptionDisplayState({
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2030-01-02T12:00:00Z",
    }).key,
    "canceling",
  );
});

test("internal test access is explicitly non-Stripe", () => {
  const state = subscription.subscriptionDisplayState({
    status: "active",
    internalTestAccess: true,
  });
  assert.equal(state.key, "internal_test");
  assert.match(state.detail, /without a Stripe subscription or payment/);
});
