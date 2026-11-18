# Campaign intelligence readiness and captions

## Product outcome

Campaign Manager should first tell the user whether WaveOS has enough current, connected information to build an intelligent campaign. It should then create a reviewable campaign that uses the strongest authorized brand, performance and media evidence available, with a genuinely specific caption for every post.

The experience must never hide a broken sync behind generic AI output or report a successful caption pass when posts remain blank, repetitive or disconnected from their selected clips.

## Campaign Readiness panel

Before **Analyze & Build Campaign**, WaveOS checks the active workspace and displays:

| Source | What must be verified |
| --- | --- |
| Workspace and access | Active workspace, current membership/staff authority, Campaign Manager and AI entitlement, write permission for drafts. |
| Brand Voice | Profile exists; relevant audience, summary, tone, phrases, exclusions, CTAs and caption preferences are available. |
| Social platforms | Requested platforms are connected, active and not marked for reconnection; publishing limits remain separate from draft generation. |
| Provider profile | The publishing-provider profile is mapped to the current workspace and its account mapping resolves. |
| Analytics | Last successful sync, requested date range, source coverage, compatible history and whether evidence is fresh enough for recommendations. |
| Media | Every selected asset still belongs to the workspace, is readable and has a stable source identity. |
| External folders | Selected Drive, Dropbox or Frame.io source is connected and its listing/sync completed or is explicitly partial. |
| Media understanding | Filename/title, tags, prior corrections, stored intelligence, preview/frame coverage and transcript state for each item. |
| AI service | The configured generation service is available and the user has the required feature access; no secret or provider-internal detail is exposed. |

Each row has one state:

- **Ready** — verified and current enough for its stated use.
- **Limited** — generation can continue, but WaveOS identifies the missing/stale evidence and explains the fallback.
- **Action needed** — the current user can repair or complete it.
- **Admin required** — an owner/admin must repair provider configuration, profile mapping, entitlement, credentials, service billing or another restricted dependency.

“Synced” always includes the source and last-success timestamp. Missing, stale, unavailable and failed are never displayed as zero or healthy.

## Repair and escalation experience

For user-fixable issues, show the direct action beside the status—for example **Refresh analytics**, **Reconnect account**, **Retry folder sync**, **Finish Brand Voice** or **Transcribe selected clips**.

Also provide **Fix with My Agent**. The handoff carries:

- workspace and campaign draft ID;
- failed readiness check and safe error code;
- affected source/platform without tokens or secrets;
- last successful/attempted time;
- actions the current user is authorized to perform.

My Agent may explain the issue, refresh a permitted read model, retry an existing sync or navigate the user to the required connection screen. It may not bypass OAuth, plan entitlements, workspace permissions or admin-only provider controls.

For restricted failures, show **Contact Admin** and create a safe diagnostic receipt the user can share. It should state what the admin needs to inspect without exposing credentials, raw provider responses or another client's identifiers.

## Smart campaign evidence hierarchy

Campaign recommendations should use, in order:

1. user corrections and explicit campaign instructions;
2. selected media transcripts and verified pixels/frames;
3. media filename/title, tags, duration, dimensions and saved media intelligence;
4. saved Brand Voice and target audience;
5. fresh, compatible first-party performance history;
6. campaign goal, platforms, formats, date range, cadence and approval requirements.

WaveOS labels whether each post was based on transcript/visual evidence, metadata inference or a general campaign fallback. It must not invent what a clip shows or says, invent performance, or treat stale/incompatible analytics as current evidence.

Smart output includes:

- campaign angle and audience insight;
- evidence-backed content pillars and hooks;
- asset ranking and sequence;
- platform and feed/story placement;
- timing recommendations only when supported by compatible history;
- a distinct per-post concept, hook, caption and optional hashtags;
- explanation of which evidence informed each recommendation;
- gaps and user decisions still required before approval or publishing.

## Caption generation contract

Every selected campaign post must receive its own caption request context:

- stable media ID;
- filename/title, even when a campaign brief exists;
- tags and media type;
- campaign name, goal, pillar and post sequence;
- planned platform and feed/story format;
- saved visual understanding and user corrections;
- transcript evidence when available;
- saved Brand Voice and platform constraints;
- a compact summary of other campaign captions so the new result avoids repetition.

The actual prompt sent to the generation provider must contain this context. Loading it from the database without inserting it into the model request does not count.

After generation, WaveOS validates:

- no selected post is missing a result;
- captions are non-empty and within platform constraints;
- captions do not invent unsupported facts, offers, results or spoken quotes;
- each caption is meaningfully distinct from the other campaign captions;
- the content item and intended platform variant contain the correct saved result;
- user-edited captions were not overwritten without confirmation.

Provide:

- **Generate missing captions**;
- **Regenerate selected captions**;
- **Regenerate all captions**, with a replacement preview and confirmation;
- per-post **Rewrite** using that post's media context;
- retry for failed items only.

The completion message reports generated, unchanged, failed and still-missing counts. A partial pass is never labeled fully successful.

## Confirmed current defects on November 9, 2026

1. The bulk `generateMissingCampaignCaptions` call does not pass `mediaAssetIds` to Wave Assist.
2. The individual caption action passes media IDs, and Wave Assist loads the selected filename/tags/transcript context, but the `caption_suite` model request does not include that loaded context in its user prompt.
3. Caption generation chooses the generic `campaignBrief` or content pillar before the content-item title, so an accurately named clip can be excluded from the prompt.
4. **Generate missing captions** only processes blank captions; there is no campaign-level regenerate-selected/all workflow for intentionally producing new, distinct captions.
5. No campaign-level similarity check verifies that captions differ meaningfully across posts.
6. Campaign analysis may return fewer media recommendations than selected assets; the remaining posts are created without captions and treated as a known warning rather than a per-item generation failure.
7. Connection, analytics, media and AI health information exists in separate server functions and admin surfaces, but Campaign Manager has no unified user-facing readiness check or repair routing.

These defects explain why correctly titled clips can fail to influence new captions. The repair must be validated at the provider request, persisted-record and rendered-UI levels before it is described as working.

## Acceptance tests

- A campaign with five differently titled clips produces five populated, meaningfully distinct captions tied to those titles and media evidence.
- A clip with a corrected transcript uses the corrected words; a clip without a transcript never receives invented quotes.
- Bulk generation passes each item's media ID and media context into the actual provider request.
- Similar clips receive distinct angles without invented differences.
- Existing user-edited captions survive Generate missing and require confirmation before Regenerate all replaces them.
- A partial provider failure saves successful captions, marks exact failed posts and resumes only those posts on retry.
- Stale analytics appears as Limited with its timestamp and is not presented as current optimization evidence.
- A reconnectable user issue opens the correct action and My Agent context; an owner-only failure produces Contact Admin and a safe receipt.
- Another workspace's connections, analytics, media, campaign details and errors never appear.
- Saving and reviewing work on phone and desktop; no test schedules or publishes content.
