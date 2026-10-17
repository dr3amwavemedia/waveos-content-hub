# Trending Now zero-results diagnosis and minimal fix

## Findings (live research service calls, same request shape as the app)
- "Filmmaker" + TikTok (7-day cutoff) returned HTTP 200 with many valid original videos, e.g. `tiktok.com/@hutch.on.film/video/7696386731351870742`, `@bri_breezi/video/...`, `@tashidelekp/video/...`.
- Every social result had `publish_date: null`. Only articles (e.g. nofilmschool.com, 2021) carried dates.
- The date cutoff (`after_date`) does not remove undated results at the source, so the videos come back.
- `trendVideoSource` accepts these URLs (TikTok `/@user/video/ID`, Instagram `/reel/ID/`). That check is not the problem.
- Root cause: `normalizeTrendResults` drops any result without `publish_date` (the "undated pages are not evidence" rule). Every video is removed before `videoTrendResults` runs, so the feed is empty. The broader retry hits the same filter.
- Other results are correctly excluded: tag/discover pages, `instagram.com/popular/...`, YouTube channels and `watch?v=` links.
- Some excerpts contain a date in plain text ("Video by Thomas Goh on July 27, 2026"). TikTok video IDs also contain the upload time (the top 32 bits are Unix seconds).

## Minimal fix (in `src/lib/trending-now.ts` only)
1. In `normalizeTrendResults`, set `publishedAt` in this order:
   - the `publish_date` from the research service, if present;
   - for TikTok `/video/ID` URLs, the date decoded from the ID (`BigInt(id) >> 32n`);
   - an Instagram excerpt that says "on <Month D, YYYY>".
2. Undated original-video URLs stay in results with `publishedAt: null`, labelled "Date not reported". They are never shown as current or used to rank. Undated articles are still dropped.
3. Keep the cutoff check for any date that was found or decoded.
4. Unit tests: decoding the TikTok ID date; undated original videos are kept but marked unverified; undated articles are still dropped; videos older than the cutoff are dropped.

No changes to the server request, the database, publishing or deployment.
