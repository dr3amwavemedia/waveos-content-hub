import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261002120000_invoice_delivery_access_locks.sql",
  "utf8",
);
const clients = readFileSync("src/routes/_authenticated/clients.tsx", "utf8");
const paymentReturn = readFileSync("src/routes/_authenticated/payment-return.tsx", "utf8");

test("legacy invoices and deliveries remain unlocked while new invoices default on", () => {
  const backfill = migration.indexOf("SET delivery_lock_enabled = false");
  const defaultOn = migration.indexOf("ALTER COLUMN delivery_lock_enabled SET DEFAULT true");
  assert.ok(backfill >= 0);
  assert.ok(defaultOn > backfill);
  assert.match(migration, /PRIMARY KEY \(invoice_id, delivery_id\)/);
  assert.doesNotMatch(
    migration,
    /INSERT INTO public\.invoice_delivery_locks[\s\S]*FROM public\.client_deliveries[\s\S]*UPDATE public\.client_invoices/,
  );
});

test("new and revised deliveries snapshot every outstanding enabled invoice", () => {
  assert.match(
    migration,
    /invoice\.delivery_lock_enabled[\s\S]*invoice\.status NOT IN \('draft', 'paid', 'void'\)/,
  );
  assert.match(
    migration,
    /AFTER INSERT OR UPDATE OF title, description, kind, url, delivered_at, is_pinned/,
  );
  assert.match(migration, /PERFORM public\.attach_outstanding_invoice_locks\(_delivery\.id\)/);
});

test("client delivery reads stay server-enforced until the linked invoice is paid or disabled", () => {
  assert.match(migration, /CREATE POLICY "Members view unlocked deliveries"/);
  assert.match(migration, /public\.delivery_access_unlocked\(id\)/);
  assert.match(
    migration,
    /invoice\.delivery_lock_enabled[\s\S]*invoice\.status NOT IN \('paid', 'void'\)/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON public\.invoice_delivery_locks FROM PUBLIC, anon, authenticated/,
  );
});

test("invoice rows expose an accessible admin switch and locked deliveries do not leak by email", () => {
  assert.match(clients, /Delivery lock \{i\.delivery_lock_enabled \? "on" : "off"\}/);
  assert.match(clients, /aria-label=\{`\$\{i\.number \|\| "Invoice"\} delivery lock`\}/);
  assert.match(clients, /if \(access\.data === true\)/);
  assert.match(clients, /if \(inApp < 0\)/);
});

test("payment completion refreshes invoices and newly-unlocked review content", () => {
  assert.match(paymentReturn, /queryKey: \["layer1", "deliveries"\]/);
  assert.match(paymentReturn, /queryKey: \["your-content"\]/);
});
