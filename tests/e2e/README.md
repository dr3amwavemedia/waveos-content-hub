# WaveOS end-to-end tests

Playwright suite covering the sign-in and landing flow.

## Run

```bash
# 1. Start the dev server (or point at a deployed URL)
bun run dev
# 2. In another shell:
bunx playwright install chromium   # first time only
bunx playwright test
```

Point at another environment with `E2E_BASE_URL`:

```bash
E2E_BASE_URL=https://waveos-content-hub.lovable.app bunx playwright test
```

## What it covers

| Spec                       | What it verifies                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `google-signin.spec.ts`    | `/auth` renders the Google button, click starts the managed OAuth hand-off, `?next=` is stashed. |
| `auth-redirect.spec.ts`    | Signed-in users on `/` and `/auth` are redirected to `/home`; unauthenticated `/home` → `/auth`. |
| `tier-landing.spec.ts`     | `/home` renders the Layer 1 client view for `project_client`, growth dashboard for staff.        |

## Authenticated tests

Real Google OAuth can't be completed in CI. Tests that need a signed-in
session read the same env vars the Lovable sandbox injects:

- `LOVABLE_BROWSER_SUPABASE_STORAGE_KEY`
- `LOVABLE_BROWSER_SUPABASE_SESSION_JSON`
- `LOVABLE_BROWSER_SUPABASE_COOKIES_JSON` (optional)

When they aren't set the auth-redirect and tier-landing specs skip
cleanly. Pin the expected tier with `E2E_EXPECTED_TIER=project_client`
(or `staff` / `growth`) to make the landing assertion explicit.

Never log, screenshot, or exfiltrate those env values.
