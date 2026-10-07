import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const externalServer = readFileSync("src/lib/external-media.server.ts", "utf8");
const externalRoute = readFileSync("src/routes/api/external-media/$provider.ts", "utf8");
const externalFilesRoute = readFileSync("src/routes/api/external-media/$provider.files.ts", "utf8");
const externalMigration = readFileSync(
  "supabase/migrations/20260811220000_external_media_connections.sql",
  "utf8",
);
const zernioServer = readFileSync("src/lib/zernio.server.ts", "utf8");
const zernioFunctions = readFileSync("src/lib/zernio.functions.ts", "utf8");
const publisher = readFileSync("src/lib/zernio-publish.server.ts", "utf8");
const publishFunctions = readFileSync("src/lib/publish.functions.ts", "utf8");
const createRoute = readFileSync("src/routes/_authenticated/create.tsx", "utf8");
const userContext = readFileSync("src/hooks/use-waveos.ts", "utf8");
const settingsRoute = readFileSync("src/routes/_authenticated/settings.tsx", "utf8");
const releaseMigration = readFileSync(
  "supabase/migrations/20261003133000_staff_direct_content_release.sql",
  "utf8",
);
const scheduledPublisher = readFileSync("src/routes/api/public/hooks/publish-due.ts", "utf8");

test("Google Drive and Dropbox are shared by workspace but only managers replace the connection", () => {
  assert.match(externalMigration, /UNIQUE \(workspace_id, provider\)/);
  assert.match(
    externalServer,
    /\.eq\("workspace_id", workspaceId\)[\s\S]*\.eq\("provider", provider\)/,
  );
  assert.match(externalServer, /membershipRole === "owner"/);
  assert.match(externalServer, /membershipRole === "admin"/);
  assert.match(externalServer, /access\.manageable !== true/);
  assert.match(
    externalRoute,
    /action === "status"[\s\S]*requireExternalMediaWorkspace[\s\S]*requireExternalMediaWorkspaceManager/,
  );
  assert.match(externalFilesRoute, /requireExternalMediaWorkspace\(request, workspaceId\)/);
  assert.match(settingsRoute, /actualUser\.staffType === "media_manager"/);
  assert.match(settingsRoute, /Shared access/);
});

test("client admins and assigned Social Managers manage the same workspace social profile", () => {
  assert.match(zernioServer, /select\("workspace_id,role"\)/);
  assert.match(zernioServer, /can_staff_manage_workspace/);
  assert.match(zernioServer, /memberRole === "owner"/);
  assert.match(zernioServer, /memberRole === "admin"/);
  assert.match(zernioFunctions, /ensureZernioProfile[\s\S]*requireSocialWorkspaceManager/);
  assert.match(zernioFunctions, /createZernioConnectUrl[\s\S]*requireSocialWorkspaceManager/);
  assert.match(zernioFunctions, /disconnectZernioAccount[\s\S]*requireSocialWorkspaceManager/);
});

test("every immediate or scheduled publish is pinned to the content workspace's Zernio profile", () => {
  assert.match(publisher, /from\("zernio_profiles" as never\)/);
  assert.match(publisher, /\.eq\("workspace_id", item\.workspace_id\)/);
  assert.match(publisher, /const profileIds = \[/);
  assert.match(publisher, /profile\.profile_id/);
  assert.match(publisher, /verifiedAccountIds\.has\(connection\.provider_account_id\)/);
  assert.match(publisher, /accountId: connection\.provider_account_id/);
  assert.match(publisher, /selected media files do not belong to this client workspace/);
  assert.match(scheduledPublisher, /publishContentItemWithZernio\(item\.id\)/);
});

test("publishing keeps audit attribution on the authenticated real actor", () => {
  assert.match(userContext, /export function useActualCurrentUser/);
  assert.match(publishFunctions, /middleware\(\[requireSupabaseAuth\]\)/);
  assert.match(publishFunctions, /publishContentItemWithZernio\(data\.contentId, context\.userId\)/);
  assert.match(publisher, /actor_user_id: actorUserId \?\? null/);
  assert.match(releaseMigration, /actor_user_id[\s\S]*_uid/);
  assert.match(releaseMigration, /'content_release_mode_selected'/);
});
