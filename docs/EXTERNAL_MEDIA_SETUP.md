# Google Drive and Dropbox setup

WaveOS keeps original media in the client's provider. It stores encrypted OAuth
tokens and file metadata only. Google Drive media is streamed through a signed,
short-lived WaveOS relay when Ayrshare publishes it; Dropbox receives a fresh
temporary link at publish time.

## Protected deployment variables

Add these in the WaveOS deployment environment. Never add them to GitHub or a
browser-visible `VITE_` variable.

```text
WAVEOS_APP_URL=https://waveos.dreamwavemedia.co
EXTERNAL_MEDIA_TOKEN_ENCRYPTION_KEY=<32 random bytes, base64 encoded>
EXTERNAL_MEDIA_RELAY_SECRET=<at least 32 random bytes>

GOOGLE_DRIVE_CLIENT_ID=<Google OAuth web client ID>
GOOGLE_DRIVE_CLIENT_SECRET=<Google OAuth client secret>
GOOGLE_DRIVE_API_KEY=<Browser API key restricted to the WaveOS domain>
GOOGLE_DRIVE_APP_ID=<Google Cloud project number>

DROPBOX_APP_KEY=<Dropbox app key>
DROPBOX_APP_SECRET=<Dropbox app secret>

FRAMEIO_CLIENT_ID=<Adobe OAuth Web App client ID>
FRAMEIO_CLIENT_SECRET=<Adobe OAuth Web App client secret>
FRAMEIO_REDIRECT_URI=https://waveos.dreamwavemedia.co/api/frameio/callback
```

`OUTLOOK_TOKEN_ENCRYPTION_KEY` is accepted as a temporary fallback for token
encryption, but a separate external-media key is preferred.

## Google Cloud

1. Create or choose one Google Cloud project for WaveOS.
2. Enable Google Drive API and Google Picker API.
3. Configure the OAuth consent screen for Dream Wave Media.
4. Add the non-sensitive `drive.file` scope.
5. Create a Web application OAuth client.
6. Add this authorized redirect URI:

```text
https://waveos.dreamwavemedia.co/api/external-media/google_drive/callback
```

7. Create a browser API key restricted to `https://waveos.dreamwavemedia.co`.
8. Copy the Google Cloud project number for `GOOGLE_DRIVE_APP_ID`.
9. Add the client ID, secret, API key, and app ID to the protected deployment variables.

This setup is done once. Every client signs into their own Google account from
WaveOS and gets a separate workspace-scoped connection.

## Dropbox App Console

1. Create one scoped-access Dropbox app for WaveOS.
2. Choose Full Dropbox so clients can select existing media anywhere in their account.
3. Enable `account_info.read`, `files.metadata.read`, and `files.content.read`.
4. Add this OAuth redirect URI:

```text
https://waveos.dreamwavemedia.co/api/external-media/dropbox/callback
```

5. Add the app key and secret to the protected deployment variables.

## Deploy

Apply `supabase/migrations/20260811220000_external_media_connections.sql`, add
the protected variables, and deploy the GitHub branch. Then test this sequence:

1. Open Settings in a client workspace and connect one provider.
2. Create a post and open Pick media.
3. Choose Google Drive or Dropbox, select a file, and add it to the post.
4. Save the draft and confirm the asset remains selected.
5. Publish a test post.
6. Schedule a second post to confirm WaveOS creates a fresh provider URL at the due time.

## Current guardrails

- Only image and video files are shown.
- A maximum of 20 external files can be imported per request.
- Provider tokens never enter the browser or the media metadata table.
- Disconnecting a provider does not delete its file references, but publishing
  those references will require reconnection.
