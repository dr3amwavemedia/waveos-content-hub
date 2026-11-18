import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const server = read("src/lib/external-media.server.ts");
const start = read("src/routes/api/external-media/$provider.ts");
const files = read("src/routes/api/external-media/$provider.files.ts");
const hook = read("src/hooks/use-external-media.ts");
const create = read("src/routes/_authenticated/create.tsx");
const settings = read("src/routes/_authenticated/settings.tsx");

test("full Drive access is explicit, manager-controlled, and distinguishable from Picker access", () => {
  assert.match(server, /GoogleDriveAccessMode = "none" \| "selected_files" \| "full_drive"/);
  assert.match(server, /granted\.has\(GOOGLE_DRIVE_READONLY_SCOPE\)[\s\S]*return "full_drive"/);
  assert.match(start, /action !== "connect_full"/);
  assert.match(start, /fullDrive = action === "connect_full"/);
  assert.match(start, /requireExternalMediaWorkspaceManager/);
  assert.match(start, /accessMode: driveAccessMode/);
  assert.match(hook, /startGoogleDriveFullConnection/);
  assert.match(settings, /Enable full browsing/);
});

test("the in-app browser covers My Drive, Shared with me, Shared drives, and pagination", () => {
  assert.match(files, /folderId \?\? "root"/);
  assert.match(files, /sharedWithMe = true/);
  assert.match(files, /drive\/v3\/drives/);
  assert.match(files, /nextPageToken/);
  assert.match(files, /while \(nextPageToken && pages < 10\)/);
  assert.match(files, /corpora", "drive"/);
  assert.match(create, /Drive stays inside WaveOS/);
  assert.match(create, /status\.accessMode !== "full_drive"/);
  assert.match(create, /Search Google Drive/);
});

test("Google imports are re-read from Drive before workspace records are saved", () => {
  const importBlock = files.slice(files.indexOf('if (body.action === "import")'));
  assert.match(importBlock, /drive\/v3\/files\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(importBlock, /googleProviderFile\(result\)/);
  assert.ok(
    importBlock.indexOf("googleProviderFile(result)") < importBlock.indexOf("media_assets"),
  );
  assert.match(importBlock, /google_drive_file_unavailable/);
});
