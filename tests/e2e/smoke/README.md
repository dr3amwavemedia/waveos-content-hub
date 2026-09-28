# WaveOS smoke suite

A read-only pass over the critical surfaces, run after dependency updates or
before a release. It never charges a card, uploads to storage, sends email,
submits an approval, or publishes a post.

## Run

```bash
bun run dev            # dev server on :8080 (or set E2E_BASE_URL)
bun run test:smoke
```

Tests that need a signed-in account read the sandbox-injected
`LOVABLE_BROWSER_SUPABASE_*` env vars and skip cleanly when absent.

## Coverage

| Spec                              | What it verifies                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `auth.smoke.spec.ts`              | `/home` is gated for signed-out visitors, Google sign-in renders, signed-in users land on `/home` with navigation. |
| `workspace-isolation.smoke.spec.ts` | Every tenant-table read carries a workspace/id filter; workspace lookups are never unfiltered. |
| `payments.smoke.spec.ts`          | Payments dashboard and Bloom importer render; a bare payment-return URL never claims success.  |
| `media.smoke.spec.ts`             | Content library renders, upload control is wired to a file input, deliveries render.           |
| `approvals.smoke.spec.ts`         | Approvals queue renders; approve is never offered without a request-changes path.              |
| `publishing.smoke.spec.ts`        | Posts, calendar, and social connections render without starting a provider hand-off.           |
| `analytics.smoke.spec.ts`         | Analytics renders numbers or an honest empty state, never a stuck spinner; price list and projects render. |

Every spec also asserts the route answered below HTTP 500, rendered no error
boundary, and produced real content rather than an empty shell.
