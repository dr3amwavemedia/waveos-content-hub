# Google Drive Picker 403 — diagnosis and fix

## Findings (read-only)
- Code revision checked: 9963360 (the current synced main).
- Settings: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_API_KEY and GOOGLE_DRIVE_APP_ID are all present. The app ID is exactly 897500225618, and the client ID starts with that project number.
- Browser key: Google accepts it when the request comes from the WaveOS address (200) and turns it down without that address (401). The key restrictions are working as set up.
- Picker setup in the code is correct: developer key, app ID, access token, the page's own address, and one Docs view.
- **Root cause:** the Google Drive connection saved today (02:54 UTC) only has `openid email profile`. It does **not** have `drive.file`. The older connection from August does have it. Google now lets people untick single permissions on the consent screen. The Drive box was left unticked, so the picker gets a token with no Drive access, and Google shows a generic 403.
- A preview test would not add anything: the preview address is not on the key's allowed list, so it would give a different error.

## Fix
1. **Now, no code needed:** in Settings, disconnect Google Drive and connect it again. On Google's screen, tick the box for "See, edit, create and delete only the specific Google Drive files you use with this app". Then open the picker again.
2. **Code change (needs approval):**
   - After Google sign-in, check the permissions Google actually granted. If `drive.file` is missing, don't save the connection. Show "Google Drive permission was not granted, please reconnect and tick the Drive box."
   - Before the picker opens, check the saved permissions the same way. If Drive is missing, return a clear "reconnect required" message instead of opening a broken picker.

## Technical details
- `src/routes/api/external-media/$provider.callback.ts`: look at the `scope` in the token response and refuse to save if `https://www.googleapis.com/auth/drive.file` is missing.
- `src/routes/api/external-media/$provider.files.ts` `picker_token`: if `connection.scopes` lacks drive.file, return 409 `reconnect_required`. The picker UI already shows that message.
- No database, secret or publishing changes.
