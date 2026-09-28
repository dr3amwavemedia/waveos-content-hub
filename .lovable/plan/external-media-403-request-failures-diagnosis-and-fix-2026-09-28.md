# External media 403 / request failures — diagnosis and fix

Read-only diagnosis of the Google Drive Picker 403 and the Dropbox "External media request failed" after a successful sign-in. No code, secrets, connections, or data were changed; no token values were read.

## 1. Google Drive Picker 403

- Code revision checked: 9963360 (current synced main).
- Settings present: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_API_KEY, GOOGLE_DRIVE_APP_ID. App ID is exactly 897500225618; client ID starts with that project number.
- Browser key works from the WaveOS address (Google returns 200 with the WaveOS referer, 401 without it) — key restrictions are fine.
- Picker construction in code is correct (developer key, app ID, OAuth token, page origin, one Docs view).
- **Root cause:** the Google Drive connection saved today (02:54 UTC) has only `openid email profile` — **no `drive.file`**. The older August connection had it. Google now lets people untick individual permissions on the consent screen; the Drive box was left unticked, so the picker receives a token with no Drive access and shows a generic 403.
- **User fix (no code needed):** Settings → disconnect Google Drive → connect again → on Google's screen tick "See, edit, create and delete only the specific Google Drive files you use with this app" → open the picker again.

## 2. Dropbox "External media request failed"

- Sign-in itself succeeded (callback returned 302, status checks returned 200). The failure is the file-list call: `POST /api/external-media/dropbox/files` returned 500 with a generic error page at 03:14 UTC (production logs).
- Saved Dropbox connection (jean@dwmsrq.com, updated 03:14 UTC) has scope **`account_info.read` only** — missing `files.metadata.read` and `files.content.read`. A refresh token is stored and the token state is healthy, so token exchange/storage is not the problem.
- **Root cause:** missing Dropbox permissions. Unlike Google, Dropbox permissions are set at the app level, so the consent screen only offered account info because the Dropbox app only has that permission enabled. The file-list call then fails and the server returns an unhandled 500.
- **User fix:** Dropbox App Console → the WaveOS app → Permissions tab → enable `files.metadata.read` and `files.content.read` → submit → in WaveOS Settings disconnect Dropbox and connect again → open Create Post → Pick from library → Dropbox.

## 3. Code guards (advisable, not yet implemented)

1. After each provider's sign-in callback, check the granted scopes. If a required scope is missing (`drive.file` for Google; `files.metadata.read` + `files.content.read` for Dropbox), do not save the connection — show "required permission not granted, reconnect and allow it."
2. Before opening the picker or listing files, check the saved scopes and return a clear 409 "reconnect required" instead of proceeding.
3. Wrap the Dropbox file-list call so a provider error returns a clear message instead of a 500 error page.

No database, secret, or publishing changes are needed for the user fixes.
