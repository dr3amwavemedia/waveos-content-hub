import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/routes/_authenticated/payments.tsx", "utf8");

test("payments page keeps only the ten newest fully paid invoices", () => {
  assert.match(source, /invoice\.status === "paid" && invoice\.paid_at/);
  assert.match(source, /new Date\(b\.paid_at!\).*new Date\(a\.paid_at!\)/);
  assert.match(source, /\.slice\(0, 10\)/);
});

test("recent payments refresh when an invoice changes", () => {
  assert.match(source, /channel\("payments-recent-invoices"\)/);
  assert.match(source, /table: "client_invoices"/);
  assert.match(source, /\(\) => void reload\(\)/);
});

test("recent payment rows display the client, invoice, amount, and paid date", () => {
  assert.match(source, /Recent invoice payments/);
  assert.match(source, /workspaceNameById\.get\(invoice\.workspace_id\)/);
  assert.match(source, /invoice\.number/);
  assert.match(source, /invoice\.amount_paid_cents/);
  assert.match(source, /Paid \{dateKey\(invoice\.paid_at!\)\}/);
});
