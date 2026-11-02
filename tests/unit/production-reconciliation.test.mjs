import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20261102233529_reconcile_waveos_production_baseline.sql";
const migration = readFileSync(migrationPath, "utf8");
const verification = readFileSync("docs/production-waveos-reconciliation.sql", "utf8");

test("production reconciliation follows the Mac handoff and is one transaction", () => {
  assert.ok("20261102233529" > "20261102225954");
  assert.match(migration, /^-- Reconcile the verified WaveOS production baseline/);
  assert.match(migration, /\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.doesNotMatch(migration, /supabase_migrations\.schema_migrations/);
});

test("reconciliation is retry-safe for schema objects", () => {
  const tableCreates = migration.match(/CREATE TABLE(?!SPACE)/g) ?? [];
  const guardedTableCreates = migration.match(/CREATE TABLE IF NOT EXISTS/g) ?? [];
  assert.equal(guardedTableCreates.length, tableCreates.length);

  const indexCreates = migration.match(/CREATE (?:UNIQUE )?INDEX(?!ED)/g) ?? [];
  const guardedIndexCreates =
    migration.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/g) ?? [];
  assert.equal(guardedIndexCreates.length, indexCreates.length);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS data_source/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS optimization_mode/);
  assert.match(migration, /DROP POLICY IF EXISTS "authorized authors create content"/);
  assert.match(migration, /DROP TRIGGER IF EXISTS content_items_validate_media_assets/);
});

test("reconciliation preserves billing, users, and webhook history", () => {
  assert.doesNotMatch(migration, /stripe_customer_id\s*=\s*NULL/i);
  assert.doesNotMatch(migration, /stripe_subscription_id\s*=\s*NULL/i);
  assert.doesNotMatch(migration, /stripe_checkout_session_id\s*=\s*NULL/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+public\.webhook_events/i);
  assert.doesNotMatch(migration, /UPDATE\s+public\.user_roles/i);
  assert.doesNotMatch(
    migration,
    /UPDATE\s+public\.client_invoices\s+SET\s+(?:amount_cents|number)\b/i,
  );
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.can_staff_manage_workspace/);
  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'client_data'/,
  );
  assert.match(
    migration,
    /delivery_lock_enabled = coalesce\(delivery_lock_enabled, false\)/,
  );
});

test("reconciliation installs final entitlement and Phase 1 boundaries", () => {
  for (const name of [
    "workspace_social_subscriptions",
    "workspace_social_subscription_invoices",
    "social_strategy_items",
    "os_account_support_requests",
    "delivery_payment_holds",
    "campaign_plans",
    "ai_usage_events",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name}\\b`));
  }

  for (const name of [
    "social_subscription_is_active",
    "has_feature",
    "can_access_workspace_feature",
    "can_manage_workspace_feature",
    "claim_webhook_event",
    "record_autopay_payment",
  ]) {
    assert.match(
      migration,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b`),
    );
  }

  assert.match(migration, /SET search_path = ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_webhook_event/);
  assert.match(migration, /TO service_role/);
  assert.match(migration, /phase1 tenant audit failed/);
  assert.ok(
    migration.indexOf("phase1 tenant audit failed") <
      migration.indexOf("content_items_id_workspace_key"),
  );
});

test("production verification covers schema, tenant, and payment invariants", () => {
  assert.match(verification, /tbucuohokbklgauxlpia/);
  assert.match(verification, /SECTION A — PRE-APPLY SNAPSHOT/);
  assert.match(verification, /SECTION B — POST-APPLY VERIFICATION/);
  assert.match(verification, /client_data_subscription_rows/);
  assert.match(verification, /duplicate_stripe_subscription_ids/);
  assert.match(verification, /invoice_negative_amount_paid/);
  assert.match(verification, /cross_workspace_social_strategy/);
  assert.match(verification, /pg_policies/);
  assert.match(verification, /information_schema\.triggers/);
});

