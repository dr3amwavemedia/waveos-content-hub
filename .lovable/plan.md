# Trending Now previews: research findings and proposed approach

## Findings (live checks only, nothing changed)

**Research search results**
- Each result returns only `url`, `title`, `publish_date` and `excerpts`. There is no thumbnail, image, author, duration or video ID. The response also has `search_id`, `warnings`, `usage`, `metadata` and `session_id`.
- In both "Filmmaker" runs, `publish_date` was null on every social result.
- Results are mixed: TikTok `/@user/video/ID` and Instagram `/reel/ID/` links, but also tag, discover and "popular" pages, channels, playlists and `watch?v=` links.
- No YouTube `/shorts/` link came back for "Filmmaker", so YouTube may often show nothing for this kind of search.
- Author names appear only inside excerpt text ("TikTok video from X (@x)"), which is unreliable to parse.

**TikTok oEmbed, called server-side**
- Four real returned videos all came back HTTP 200 with `title`, `author_name`, `author_unique_id`, `author_url`, `thumbnail_url`, thumbnail width and height, and `embed_product_id`.
- Two fake or non-existent video IDs came back HTTP 400 ("Something went wrong"), so dead links were rejected cleanly.
- The thumbnail links are signed and expire after about 47 hours, so they must not be stored long-term.
- Only six links were tested, so this is a strong sign, not proof that every removed or private video is rejected.

**YouTube thumbnails**
- `i.ytimg.com/vi/{ID}/hqdefault.jpg` works without a key and returns 404 for an invalid ID, so it also works as a check that a video exists.
- `maxresdefault` exists only for some videos.
- `oardefault` (the vertical Shorts image) gave 404 for a regular video. It could not be tested on a real Shorts ID because none came back in the search.

## Proposed approach (needs approval before any code changes)
1. Add a server-side step that checks each TikTok video through oEmbed, with a short timeout and a few checks running at once.
   - Keep a video only on HTTP 200; drop it on 400 or 404.
   - Attach `thumbnail`, `creator` and the oEmbed title.
   - Cache results only for this session.
2. For YouTube Shorts, set the thumbnail to `https://i.ytimg.com/vi/{ID}/hqdefault.jpg` and hide the card if the image fails to load.
3. Instagram has no public oEmbed without a Meta app token, so Reels keep the plain card with the "Watch on Instagram" link.
4. Allow only image addresses from `*.tiktokcdn*.com` and `i.ytimg.com`.
5. Unit tests: a 200 is kept with its thumbnail; a 400 is dropped; the YouTube thumbnail address is built correctly.

No database, deploy or publish changes.
