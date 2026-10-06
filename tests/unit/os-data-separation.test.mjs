import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261003123000_separate_os_and_client_data.sql",
  "utf8",
);
const clients = readFileSync("src/routes/_authenticated/clients.tsx", "utf8");
const osData = readFileSync("src/routes/_authenticated/os-data.tsx", "utf8");
const accounts = readFileSync("src/lib/os-accounts.functions.ts", "utf8");

test("existing records default to Client data and OS records require an explicit source", () => {
  assert.match(migration, /data_source text NOT NULL DEFAULT 'client_data'/);
  assert.match(migration, /account_source text NOT NULL DEFAULT 'client_data'/);
  assert.match(migration, /raw_user_meta_data->>'account_source' = 'os_data'/);
});

test("admin UI separates Client data and OS data with search and pagination", () => {
  assert.match(clients, /Client data/);
  assert.match(osData, /OS Data/);
  assert.match(osData, /Search OS users by name or email/);
  assert.match(osData, /<OsDataPanel search=\{search\}/);
  assert.match(clients, /pageSize: 30/);
});

test("OS support actions are owner-only, source-scoped, confirmed and audited", () => {
  assert.match(accounts, /requireOwner/);
  assert.match(accounts, /account_source.*os_data/s);
  assert.match(accounts, /confirmation_email_mismatch/);
  for (const action of [
    "os_account_updated",
    "os_account_password_reset_sent",
    "os_account_deleted",
  ]) {
    assert.match(accounts, new RegExp(action));
  }
  assert.match(migration, /os_account_payments_changed/);
});
