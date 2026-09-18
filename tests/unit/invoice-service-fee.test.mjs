import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_SERVICE_FEE_BASIS_POINTS,
  invoiceServiceFeeCents,
} from "../../src/lib/invoice-service-fee.ts";

const invoiceForm = readFileSync("src/routes/_authenticated/clients.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260918194500_default_invoice_service_fee.sql",
  "utf8",
);
const invoiceDocument = readFileSync("src/lib/invoice-document.ts", "utf8");

test("the default service fee is exactly 2.9 percent in whole cents", () => {
  assert.equal(DEFAULT_SERVICE_FEE_BASIS_POINTS, 290);
  assert.equal(invoiceServiceFeeCents(10_000), 290);
  assert.equal(invoiceServiceFeeCents(9_000), 261);
  assert.equal(invoiceServiceFeeCents(1), 0);
});

test("new invoices default the fee on while existing invoices keep their stored choice", () => {
  assert.match(invoiceForm, /invoice \? invoice\.service_fee_percent > 0 : true/);
  assert.match(invoiceForm, /Add 2\.9% service fee/);
  assert.match(invoiceForm, /Uncheck to remove it/);
});

test("historical invoices are backfilled with zero and retain their totals", () => {
  assert.match(migration, /service_fee_percent integer not null default 0/);
  assert.match(migration, /service_fee_cents integer not null default 0/);
  assert.doesNotMatch(migration, /update public\.client_invoices[\s\S]*290/i);
});

test("invoice documents itemize the service fee", () => {
  assert.match(invoiceDocument, /Service fee \(/);
  assert.match(invoiceDocument, /serviceFeeCents/);
});
