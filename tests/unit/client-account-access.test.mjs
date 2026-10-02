import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  appRoleForClientAccess,
  canViewClientFinancials,
  clientAccountAccess,
  clientAccountAccessLabel,
  workspaceRoleForClientAccess,
} from "../../src/lib/client-account-access.ts";

test("maps Client Admin to financial access and Client Second Account to editor access", () => {
  assert.equal(clientAccountAccess("owner"), "client_admin");
  assert.equal(clientAccountAccess("admin"), "client_admin");
  assert.equal(clientAccountAccess("editor"), "client_second_account");
  assert.equal(clientAccountAccess("viewer"), "client_second_account");
  assert.equal(canViewClientFinancials("admin"), true);
  assert.equal(canViewClientFinancials("editor"), false);
  assert.equal(workspaceRoleForClientAccess("client_admin"), "admin");
  assert.equal(workspaceRoleForClientAccess("client_second_account"), "editor");
  assert.equal(appRoleForClientAccess("client_admin"), "client_owner");
  assert.equal(appRoleForClientAccess("client_second_account"), "client_viewer");
  assert.equal(clientAccountAccessLabel("client_admin"), "Client Admin");
  assert.equal(clientAccountAccessLabel("client_second_account"), "Client Second Account");
});

test("grandfathers existing client access before applying financial policies", async () => {
  const sql = await readFile(
    new URL(
      "../../supabase/migrations/20261002133000_client_admin_and_second_account_access.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const grandfatherIndex = sql.indexOf("UPDATE public.workspace_members");
  const invoicePolicyIndex = sql.indexOf('CREATE POLICY "Client admins view their invoices"');
  assert.ok(grandfatherIndex >= 0);
  assert.ok(invoicePolicyIndex > grandfatherIndex);
  assert.match(sql, /SET role = 'admin'/);
  assert.match(sql, /UPDATE public\.invites[\s\S]*workspace_role = 'admin'/);
  assert.match(sql, /member\.role IN \('owner', 'admin'\)/);
  assert.match(sql, /Client admins view their contracts/);
  assert.match(sql, /Client admins view autopay schedules/);
  assert.match(sql, /_role NOT IN \('admin', 'editor'\)/);
});

test("renders the member and pending-invite access switches", async () => {
  const clients = await readFile(
    new URL("../../src/routes/_authenticated/clients.tsx", import.meta.url),
    "utf8",
  );

  assert.match(clients, /admin_set_client_invite_access/);
  assert.match(clients, /clientAccountAccessLabel/);
  assert.match(clients, /workspaceRoleForClientAccess/);
  assert.match(clients, /aria-label={`Set \$\{email \|\| name\} as Client Admin`}/);
});
