import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/routes/_authenticated/payments.tsx", "utf8");
const clientPortal = readFileSync("src/components/app/layer1-overview.tsx", "utf8");

test("recent payments list every recorded transaction, not just settled invoices", () => {
  assert.match(source, /const recentTransactions = entries/);
  assert.match(source, /entry\.kind === "payment" \|\| entry\.kind === "refund"/);
  assert.match(source, /entry\.status === "posted"/);
  assert.match(source, /\.slice\(0, 15\)/);
});

test("recent payments refresh when an invoice or a payment changes", () => {
  assert.match(source, /channel\("payments-recent-invoices"\)/);
  assert.match(source, /table: "client_invoices"/);
  assert.match(source, /table: "payment_ledger"/);
  assert.match(source, /\(\) => void reload\(\)/);
});

test("recent payment rows display the client, invoice, source, amount and date", () => {
  assert.match(source, /Recent invoice payments/);
  assert.match(source, /workspaceNameById\.get\(entry\.workspace_id\)/);
  assert.match(source, /invoiceById\.get\(entry\.invoice_id\)/);
  assert.match(source, /Card payment|Imported from Bloom/);
  assert.match(source, /money\(entry\.amount_cents\)/);
  assert.match(source, /dateKey\(entry\.occurred_at\)/);
});

test("clients see their own payment history on each invoice", () => {
  assert.match(clientPortal, /from\("payment_ledger"\)/);
  assert.match(clientPortal, /Payment history/);
  assert.match(clientPortal, /entry\.kind === "refund" \? "Refund" : "Payment received"/);
});
