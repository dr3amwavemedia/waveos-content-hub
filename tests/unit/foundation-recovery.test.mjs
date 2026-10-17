import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('drizzle/migrations/0025_recover_missing_waveos_feature_tables.sql', 'utf8');
const tables = ['product_releases', 'release_user_states', 'release_preferences', 'workflow_drafts', 'social_intelligence_profiles', 'social_intelligence_snapshots', 'creative_designs', 'campaign_plans', 'campaign_plan_items', 'competitors', 'competitive_reports'];

test('foundation recovery creates only 11 required tables with grants before RLS', () => {
  assert.equal((sql.match(/CREATE TABLE public\./g) ?? []).length, 11);
  for (const table of tables) {
    const create = sql.indexOf(`CREATE TABLE public.${table} `);
    const grant = sql.indexOf(` ON public.${table} TO authenticated;`, create);
    const service = sql.indexOf(`GRANT ALL ON public.${table} TO service_role;`, create);
    const rls = sql.indexOf(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`, create);
    assert.ok(create >= 0 && grant > create && service > grant && rls > service, table);
  }
});

test('foundation recovery never changes existing client, billing or workspace access records', () => {
  assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION/i);
  for (const table of ['workspaces', 'workspace_members', 'client_invoices', 'payment_ledger', 'workspace_social_subscriptions', 'invoice_autopay_schedules']) {
    assert.doesNotMatch(sql, new RegExp(`(?:ALTER TABLE|GRANT .* ON|CREATE POLICY .* ON) public\\.${table}\\b`, 'i'));
  }
  assert.doesNotMatch(sql, /REFERENCES auth\.users/);
});