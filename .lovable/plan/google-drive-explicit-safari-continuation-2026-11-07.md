# Google Drive: explicit Safari continuation

## Evidence and boundaries

The owner's same-iPhone, same-preview A/B test shows Google's account/cookie error inside Lovable's embedded browser, but actual Drive folders in regular Safari. The investigation has been updated to correct the earlier Safari attribution. This strongly isolates that reproduction to the browser context; the precise storage/origin mechanism remains unproven. Folder visibility is not yet a verified file-selection callback or import. Home Screen PWA behavior remains a separate device check.

## Proposed changes

1. Keep **Browse Google Drive** and the original Picker unchanged as the default in regular Safari and desktop.
2. Make an explicit **Continue in Safari** option available without requiring embedded-browser detection. Existing iOS Home Screen detection can tailor wording; do not claim universal detection or infer failures from Google's private iframe contents.
3. Require an explicit **Save draft for Safari** action through existing draft saves. Verify that caption, destinations/options, selected media and planned date survive the saved-post return. If saving fails, keep the user here with a visible error and no continuation link.
4. After successful saving, offer the existing external-Safari launch attempt plus a copyable/selectable HTTPS saved-draft link. Explain that opening Safari manually and pasting the link is the fallback if the launch is blocked. Never claim a normal new tab guarantees external Safari.
5. In Safari, open the same saved Create Post draft and use its existing Picker callback/import flow. Preserve visible cancellation, empty-selection and error feedback. Remind the user to save after adding files before returning to WaveOS. Safari may require normal WaveOS sign-in; no automatic logout or credential transfer.

## Technical scope

- Expected implementation files: `src/routes/_authenticated/create.tsx`, `src/lib/drive-picker-return.ts` only if helper changes are needed, and focused Drive handoff/lifecycle tests.
- Keep the link on the current preview/production origin; carry only the saved draft ID, never tokens or unsaved content.
- No new Google redirect flow, broader scopes, secrets, connection changes, permissions, billing, staff/client changes, PWA caching or unrelated features.
- Do not publish or deploy.

## Validation

- Regression tests: omitted/unknown browser detection does not block the manual option; regular Safari retains original Picker; save failure cannot produce a continuation link; safe same-origin saved-draft URL; picked/cancel/error/empty callbacks remain distinct.
- Run the full unit suite and inspect automatic type/build results.
- Browser checks at phone and desktop widths using simulated callbacks and intercepted writes where needed; verify visible save errors and returned-draft field preservation without real imports or live-record writes.
- Real Google selection in Safari can only be verified with an authorized Google session. Report it as unverified unless actually exercised; request a physical-iPhone check of selected file → attached media → explicit save → reopening the same draft. The user has already verified real folder visibility.

## Current changes

Only the investigation and task list were updated before review. No application behavior, OAuth settings, connections or records were changed.