import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260918193000_invoice_autopay_schedules.sql",
  "utf8",
);
const adminForm = readFileSync("src/routes/_authenticated/clients.tsx", "utf8");
const authorization = readFileSync("src/lib/autopay.functions.ts", "utf8");
const chargeWorker = readFileSync("src/routes/api/public/hooks/charge-autopay-due.ts", "utf8");
const stripeWebhook = readFileSync("src/routes/api/public/hooks/stripe.ts", "utf8");

test("autopay schedules are workspace-scoped and protected by RLS", () => {
  assert.match(migration, /create table if not exists public\.invoice_autopay_schedules/);
  assert.match(
    migration,
    /alter table public\.invoice_autopay_schedules enable row level security/,
  );
  assert.match(migration, /Workspace members view autopay schedules/);
  assert.match(migration, /Staff manage autopay schedules/);
  assert.match(migration, /frequency in \('one_time','monthly'\)/);
});

test("admins can configure one-time or monthly automatic charge dates", () => {
  assert.match(adminForm, /Enable automatic card charges/);
  assert.match(adminForm, /One-time fixed service/);
  assert.match(adminForm, /Monthly retainer/);
  assert.match(adminForm, /type="datetime-local"/);
  assert.match(adminForm, /Automatic charge time must be in the future/);
});

test("clients explicitly authorize a card through Stripe setup mode", () => {
  assert.match(authorization, /mode: "setup"/);
  assert.match(authorization, /payment_method_types: \["card"\]/);
  assert.match(authorization, /status: "pending_authorization"/);
  assert.doesNotMatch(authorization, /card_number|cvc|expiry/);
});

test("due charges use off-session confirmation and idempotency", () => {
  assert.match(chargeWorker, /off_session: true/);
  assert.match(chargeWorker, /confirm: true/);
  assert.match(chargeWorker, /idempotencyKey: `autopay:/);
  assert.match(chargeWorker, /status: "action_required"/);
});

test("Stripe webhooks activate authorizations and settle or pause schedules", () => {
  assert.match(stripeWebhook, /checkout\.session\.completed/);
  assert.match(stripeWebhook, /payment_intent\.succeeded/);
  assert.match(stripeWebhook, /payment_intent\.payment_failed/);
  assert.match(stripeWebhook, /sendPaymentReceiptEmail/);
});
