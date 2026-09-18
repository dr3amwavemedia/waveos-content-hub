import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  nextInvoicePaymentCents,
  nextInvoicePaymentLabel,
} from "../../src/lib/invoice-payment-schedule.ts";

test("remaining mode charges the complete outstanding balance", () => {
  const invoice = {
    amountCents: 145018,
    amountPaidCents: 25000,
    checkoutPaymentType: "remaining",
    checkoutPaymentCents: null,
  };
  assert.equal(nextInvoicePaymentCents(invoice), 120018);
  assert.equal(nextInvoicePaymentLabel(invoice), "Pay remaining balance");
});

test("deposit mode charges the deposit first and the balance afterward", () => {
  const firstPayment = {
    amountCents: 250000,
    amountPaidCents: 0,
    checkoutPaymentType: "deposit",
    checkoutPaymentCents: 50000,
  };
  assert.equal(nextInvoicePaymentCents(firstPayment), 50000);
  assert.equal(nextInvoicePaymentLabel(firstPayment), "Pay deposit");
  assert.equal(nextInvoicePaymentCents({ ...firstPayment, amountPaidCents: 50000 }), 200000);
  assert.equal(
    nextInvoicePaymentLabel({ ...firstPayment, amountPaidCents: 50000 }),
    "Pay remaining balance",
  );
});

test("a Deposit + balance plan stays cohesive with Stripe and defaults to 50 percent", () => {
  const invoice = {
    amountCents: 119000,
    amountPaidCents: 0,
    paymentPlan: "deposit_balance",
    checkoutPaymentType: "remaining",
    checkoutPaymentCents: null,
  };
  assert.equal(nextInvoicePaymentCents(invoice), 59500);
  assert.equal(nextInvoicePaymentLabel(invoice), "Pay deposit");
});

test("fixed mode charges equal installments and clamps the final payment", () => {
  const invoice = {
    amountCents: 100000,
    amountPaidCents: 80000,
    checkoutPaymentType: "fixed",
    checkoutPaymentCents: 30000,
  };
  assert.equal(nextInvoicePaymentCents(invoice), 20000);
  assert.equal(nextInvoicePaymentLabel(invoice), "Pay installment");
});

test("WaveOS uses one schedule choice and sends that wording to Stripe", () => {
  const admin = readFileSync("src/routes/_authenticated/clients.tsx", "utf8");
  const stripe = readFileSync("src/lib/payments.functions.ts", "utf8");
  assert.match(admin, /This selection controls the amount and wording shown in Stripe Checkout/);
  assert.doesNotMatch(admin, /<Field label="Payment link charges">/);
  assert.match(stripe, /payment_type: paymentType/);
  assert.match(stripe, /Deposit toward a/);
  assert.match(stripe, /unit_amount: dueNow/);
});
