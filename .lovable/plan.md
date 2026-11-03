# Trending Now: diagnosis findings and proposed fix

## Findings (read-only, no search sent)

1. **PARALLEL_API_KEY configured:** true. It is a connector-managed connection key, present in both the project secrets and this preview server.
2. **Last server-visible status:** no Trending Now log entries in the last hour, in preview or published. The code doesn't record status categories anyway. When a provider call fails, it logs only `"Trend research failed", <status>` and returns an empty list.
3. **Request shape is outside Parallel V1 guidance, on every path:**
   - With "All videos" selected, the first pass sends 12 queries, including 4 `site:` queries. Parallel's guidance forbids `site:`. This pass uses max_results 28.
   - The broaden pass always runs and sends 24 queries with max_results 24.
   - The fallback pass sends 8 queries (4 `site:`) with max_results 36.
   - The YouTube pass sends 3 queries (1 `site:`) with max_results 24.
   - With a single platform selected, the first pass is still 6 queries and the broaden pass is 6.
   - So max_results is above 20 on every call, and the 2–3 query guidance is exceeded on every pass except the YouTube one.
4. **Likely root cause (unconfirmed; it would take a live call to confirm):** the code calls `https://api.parallel.ai/v1/search` directly, using the connector key as `x-api-key`. A connector-managed key only works through the Lovable connector gateway, so these calls very likely get an auth error.
5. **Empty state shown:** the code only knows two messages. A missing key gives "connection is unavailable", and every other empty result gives "No usable original videos matched yet". With the key present, a provider failure ends up looking like **no_matches**, even though the real category is probably **provider_unavailable**. There is no separate `provider_unavailable` state today.

## Proposed fix (only if approved)

- Send requests through the connector gateway with the documented headers, instead of calling the provider directly.
- Limit each search to 2–3 short queries without `site:`. Use `source_policy.include_domains` for the four video sites instead, and keep max_results at 20 or below.
- Run the broaden pass only when the first pass returns too few results.
- Return a safe `status` of `connection_unavailable`, `provider_unavailable` or `no_matches`. Log the provider's HTTP status category without the response body, and show a matching message on the Trending Now page.
- Add focused tests for the request shape (query count, no `site:`, max_results ≤ 20) and for status mapping. Then run the type check, unit tests and build. No live search unless you approve one.

## Technical details

- File: `src/lib/trending-now.functions.ts`. The `runSearch` function (lines 20–28) holds the direct fetch and the silent `[]` on failure. Query builders are at lines 50–59, 64–71, 79–83 and 93.
- Gateway: `https://connector-gateway.lovable.dev/parallel/v1/search` with `Authorization: Bearer LOVABLE_API_KEY` and `X-Connection-Api-Key: PARALLEL_API_KEY`.
