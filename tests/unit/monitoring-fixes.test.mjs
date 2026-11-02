import assert from "node:assert/strict";
import test from "node:test";
import { ANALYTICS_METRIC_KEYS, snapshotMetricKey } from "../../src/lib/analytics-transparency.ts";
import { manualPaymentLedgerTarget } from "../../src/lib/manual-payment-ledger.ts";

const STORED_METRIC_KEY = /^[a-z][a-z0-9_.-]{1,99}$/;

test("story views history is saved as story_views", () => {
  assert.equal(snapshotMetricKey("storyViews"), "story_views");
});

test("every analytics history key passes the database's lowercase rule", () => {
  for (const key of ANALYTICS_METRIC_KEYS) {
    assert.match(snapshotMetricKey(key), STORED_METRIC_KEY, key);
  }
});

test("editing an invoice paid before the ledger updates its existing entry instead of adding a second", () => {
  const target = manualPaymentLedgerTarget("inv-1", [
    { id: "row-legacy", source: "invoice_backfill", external_id: "inv-1" },
  ]);
  assert.deepEqual(target, { action: "update", id: "row-legacy" });
});

test("an invoice already recorded manually keeps its single manual entry", () => {
  const target = manualPaymentLedgerTarget("inv-1", [
    { id: "row-legacy", source: "invoice_backfill", external_id: "inv-1" },
    { id: "row-manual", source: "invoice_backfill", external_id: "manual:inv-1" },
  ]);
  assert.deepEqual(target, { action: "upsert", externalId: "manual:inv-1" });
});

test("an invoice with no prior entry gets one manual entry", () => {
  assert.deepEqual(manualPaymentLedgerTarget("inv-2", []), {
    action: "upsert",
    externalId: "manual:inv-2",
  });
});
