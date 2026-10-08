import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_SERVICE_FEE_BASIS_POINTS,
  invoiceCheckoutAmounts,
  invoiceServiceFeeCents,
} from "../../src/lib/invoice-service-fee.ts";

const invoiceForm = readFileSync("src/routes/_authenticated/clients.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260918194500_default_invoice_service_fee.sql",
  "utf8",
);
const invoiceDocument = readFileSync("src/lib/invoice-document.ts", "utf8");
const checkout = readFileSync("src/lib/payments.functions.ts", "utf8");
const paymentRecorder = readFileSync("src/lib/stripe-invoice-payment.server.ts", "utf8");
const checkoutMigration = readFileSync(
  "supabase/migrations/20261008031911_checkout_processing_fee.sql",
  "utf8",
);

test("the default service fee is exactly 2.9 percent in whole cents", () => {
  assert.equal(DEFAULT_SERVICE_FEE_BASIS_POINTS, 290);
  assert.equal(invoiceServiceFeeCents(10_000), 290);
  assert.equal(invoiceServiceFeeCents(9_000), 261);
  assert.equal(invoiceServiceFeeCents(1), 0);
});

test("checkout adds 2.9 percent without changing the invoice payment", () => {
  assert.deepEqual(invoiceCheckoutAmounts(55_000), {
    invoicePaymentCents: 55_000,
    processingFeeCents: 1_595,
    checkoutTotalCents: 56_595,
  });
});

test("new invoices default the fee on while existing invoices keep their stored choice", () => {
  assert.match(invoiceForm, /invoice \? invoice\.service_fee_percent > 0 : true/);
  assert.match(invoiceForm, /Add 2\.9% at Stripe Checkout/);
  assert.match(invoiceForm, /Fee on — remove/);
  assert.match(invoiceForm, /Fee off — add 2\.9%/);
});

test("historical invoices are backfilled with zero and retain their totals", () => {
  assert.match(migration, /service_fee_percent integer not null default 0/);
  assert.match(migration, /service_fee_cents integer not null default 0/);
  assert.doesNotMatch(migration, /update public\.client_invoices[\s\S]*290/i);
  assert.match(checkoutMigration, /processing_fee_at_checkout boolean not null default false/);
  assert.match(checkoutMigration, /case when processing_fee_at_checkout then 0/);
});

test("invoice documents disclose checkout fees without adding them to invoice totals", () => {
  assert.match(invoiceDocument, /Service fee \(/);
  assert.match(invoiceDocument, /It is not included in this invoice total/);
  assert.match(invoiceDocument, /serviceFeeCents/);
});

test("Stripe itemizes the processing fee while only the base amount settles the invoice", () => {
  assert.match(checkout, /name: `Processing fee \(/);
  assert.match(checkout, /processing_fee_cents: String\(checkoutAmounts\.processingFeeCents\)/);
  assert.match(paymentRecorder, /amount_cents: appliedPayment/);
  assert.match(paymentRecorder, /processing_fee_cents: checkoutAmounts\.processingFeeCents/);
  assert.match(paymentRecorder, /alreadyPaid \+ appliedPayment/);
});
