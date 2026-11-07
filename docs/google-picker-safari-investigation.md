# Google Picker Safari investigation — November 7, 2026

## Proven evidence

- Earlier reporting described the second iPhone failure as Safari. The owner's latest same-device A/B test clarifies the failing context: **Lovable's in-app embedded browser**, where cookie acceptance still left Google's account-access error. On the **same iPhone, same WaveOS preview URL**, opening regular Safari successfully displayed the full Picker with actual Drive folders, including Google Drive, Shared with me and Shared drives. This is owner-observed real-device evidence, not an automated reproduction.
- That comparison strongly isolates the reported failure to the embedded browser/session context rather than a universally invalid scope, key or preview origin. It proves regular Safari could load authenticated folder content in that test; it does not yet prove successful selection/import or identify the exact iframe storage mechanism. Lifecycle and refresh fixes are not a resolution of this embedded-browser failure.
- At starting revision `02240f2a7ea0de66d555ce63e0ff4103b529c4f6`, the authenticated test workspace's Picker token request succeeded. Drive `about` accepted the same token and its user matched the saved connection email. No identity or credential values were logged.
- The existing authenticated Drive list action returned eight media files. The embedded Picker in a browser without a Google session still showed a Google sign-in prompt. API authorization and embedded Google session access are therefore different observed paths.
- Comparing locally available `2fc4335b30`, PR #224/#225 and `867468de` found no changes to OAuth/API configuration sources. PR #224 automatically substituted a limited Drive listing; PR #225 restored Picker. This does not exclude an external configuration or Google/browser change.
- Direct preview: `https://id-preview--5e51f033-dba6-4b7a-acb2-008cdd739997.lovable.app`; primary production: `https://waveos.dreamwavemedia.co`; published alias: `https://waveos.lovable.app`. Preview returned a host access 401 to this test browser; both production hosts returned 200. Each supplied `strict-origin-when-cross-origin`; no response CSP was supplied. The preview host access response is not a Google API-key rejection.

## Not proven

The underlying embedded-browser mechanism is not established. Restricted iframe storage/session access and differences in the topmost embedding origin remain hypotheses. The same-preview Safari success argues against a blanket preview-key or OAuth-scope failure, but does not audit key restrictions for every topmost origin or establish the cause for every account. A Home Screen PWA failure is separate from this confirmed Lovable in-app A/B test; do not treat both contexts as proven identical.

No authorized Google Cloud credentials-management connection is available here. Secret presence and format checks cannot read the actual key's restrictions. Read-only configuration verification must inspect:

- Picker API and Drive API enablement; project consistency of the OAuth client, key and numeric Picker App ID.
- Website restrictions for the exact hosts used: `https://waveos.dreamwavemedia.co/*`, `https://waveos.lovable.app/*`, and `https://id-preview--5e51f033-dba6-4b7a-acb2-008cdd739997.lovable.app/*` if direct preview should be supported. Do not assume existing setup documentation matches deployed restrictions or remove restrictions.
- OAuth authorized redirect URIs ending in `/api/external-media/google_drive/callback` on supported hosts, and any applicable authorized JavaScript origins. Opening Picker with an existing token does not exercise a new OAuth redirect, so a missing callback alone does not explain this symptom.
- The topmost origin for an embedded Lovable preview: Google's `setOrigin` documentation refers to the topmost page. Direct Safari navigation is top-level. The corrected A/B evidence makes embedding-origin differences worth checking, without proving an origin mismatch.

## Minimal implemented workaround

Original Picker remains the default. After explicitly exiting it, users can choose **Browse previously authorized files**. This uses existing workspace-authorized Drive list/import actions, without Picker iframe cookies, developer key, new scopes, reconnecting or changing connections. It cannot grant additional file access or enumerate all Drive files. It honestly identifies the first-100-entry listing limitation. Failed or empty imports remain visibly unsuccessful.

No server routes, OAuth scopes, secrets, database schema, billing, or other application features were modified. Browser verification intercepted import requests before server processing, so no media records or drafts were saved.

## Top-level alternative

### Proposed minimal saved-draft handoff (pending review)

Extend the existing explicit saved-draft Safari controls beyond detected iOS standalone mode. Offer a manual “Continue in Safari” option for account/cookie trouble without requiring reliable identification of Lovable's embedded browser. Preserve regular Safari's original Picker as the default; never automatically close Picker, navigate, reconnect or log out. Known iOS standalone mode can receive contextual wording, but user-agent or iframe heuristics cannot establish universal embedded-browser detection.

Only after an explicit user save succeeds through existing draft actions, expose the exact current-origin HTTPS saved-post link. Include no access tokens, unsaved content or session credentials. Offer an explicit Safari launch attempt using the existing `x-safari-https` link, with a copy/selectable HTTPS link as the dependable manual fallback; do not claim that every iOS host supports that scheme or that a normal new tab escapes an embedded browser. Safari may require WaveOS sign-in and workspace access. The existing Picker runs on that saved Create Post page; selected files must be imported through existing authorized actions, then explicitly saved before returning to the original app. Failed saves must not enable continuation or imply that content is preserved.

Review draft-save coverage of destination options and selected media before implementation: the existing saved-post update path must not lose originating fields. Test successful/failed save handoff, safe URLs, manual availability without detection, regular Safari retaining default Picker, and picked/cancel/error/empty callbacks. Simulated callbacks do not establish successful real-device Google selection. No new OAuth redirect flow, scopes, secrets, manifest or service worker is proposed.

Google documents an OAuth-and-Picker redirect using `trigger_onepick=true`, `picked_file_ids`, and only `drive.file`: https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker . This could authorize new files outside the app-hosted iframe. It is not a drop-in link: the existing connection flow combines identity scopes and replaces workspace credentials. A safe dedicated flow would need state/PKCE, registered redirect verification, account binding, cancellation handling, and server-side file verification without replacing the existing connection. It was not implemented speculatively.

Other sources: https://developers.google.com/workspace/drive/api/guides/api-specific-auth ; https://developers.google.com/workspace/drive/picker/reference/picker.pickerbuilder.setorigin ; https://webkit.org/blog/11545/updates-to-the-storage-access-api/ . Public Safari issue reports corroborate symptoms, not a proven Google root-cause determination.

## Validation

- Full unit suite: **402 passed, zero failures**, including three new executable selection rules (only explicitly selected provider-listed files, empty selection/authorization imports nothing, duplicate records once).
- Preview production-build signal: **build OK**, November 7 at 00:25:20 UTC. No manually invoked build/typecheck; harness checks are automatic.
- Authenticated phone-width and desktop checks: eight real authorized cards, explicit selection, intercepted one-file import, visible empty-import error, and return to original Picker. No real Google selection or live import was performed.
- Physical-iPhone successful Google selection, Google Cloud restrictions, and a secure top-level device flow remain unverified. Nothing published or deployed.

## Changed files

- `src/routes/_authenticated/create.tsx`
- `src/components/media/drive-authorized-browser.tsx`
- `src/lib/drive-authorized-selection.ts`
- `tests/unit/drive-authorized-selection.test.mjs`
- `AGENTS.md`
- `roadmap.md`
- `docs/google-picker-safari-investigation.md`