<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

Mobile guided workflows wrap existing fields and actions with shared step controls; desktop keeps all fields visible, so presentation changes do not fork business logic.
Creative Studio uses the same canvas and undo history on every device; mobile tool panels disclose existing tools without changing persistence or publish actions.
Creative Studio selection and alignment overlays render separately from artwork so exports cannot contain editing decorations.
Editor viewport transforms stay outside saved documents so workspace zoom never modifies artwork geometry.
Public competitor research runs through authenticated workspace-entitled server functions and the managed research connector; results retain citations and never infer private platform metrics.
Competitor report URL fields share pre-validation sanitation and consulted-source matching; malformed citations cannot invalidate supported findings, and customer errors never expose provider or validation payloads.
Research results are scoped to the active workspace in session storage and included only in explicit existing workflow-draft saves, so navigation does not authorize live-record writes.
Analytics historical comparisons require matching provider, calculation, coverage and non-overlapping equal-length periods; unsupported observations remain unavailable.
Content lead attribution counts provider-reported post clicks plus DM/message starts as lead actions, deduplicates repeated provider post records, and never presents actions as unique people or confirmed sales.
Wave Assist uses one current premium text model across contextual advice, captions, campaigns, and SEO; conversation history stays session-scoped, workspace context is bounded, and every response remains review-only with no automatic record changes or publishing.

Creative Studio templates produce native document layers and share one artwork renderer with editor, thumbnails and export, so previews never diverge from editable artwork.
Creative Studio replaceable media slots use image-layer metadata and document commits, preserving geometry, crop and undo history when media sources change.
Trending Now uses authenticated workspace-entitled research with dated source validation, session-scoped observations and explicit existing Create Post brief handoff, avoiding unapproved database writes and automatic publishing.
Trending Now separates original short-video URLs from supporting articles and uses allowlisted preview URLs, so evidence is not misrepresented as playable content.
Create Post and Creative Studio exchange workspace-keyed session snapshots through explicit return tokens, so unsaved originating fields survive without implicit live-record writes.
Brand application commits one document revision and preserves geometry; the shared artwork renderer contains logos proportionally, so preview and export cannot stretch them.
Analytics parses one provider post/ad rollup per record and counts follower inventory only once; explicit refresh uses documented account-scoped external-post sync and preserves safe diagnostic state independently of metric reads.
Missing feature storage is recovered through standalone additive Drizzle migrations and new-table-only authorization helpers; do not replay historical security migrations or replace existing entitlements, because deployed client access and billing must remain unchanged.
SaaS Dashboard reads only OS workspace reporting through an authenticated server function with a top-level owner check before privileged reads; unavailable historical metrics stay unavailable rather than using catalog prices or current statuses as revenue history.
Published-post removal goes through one manager-authorized server function that marks the attempt unpublished and keeps the row; publishing fingerprints only stable fields and checks duplicates before the item claim, so history survives and no provider write happens before explicit duplicate confirmation.
The Social Media published-post library reads live provider data per connected account (sync-external, Zernio post records, account-scoped analytics), merges by platform + account + platform post id, and removes only after re-reading the Zernio post to confirm the exact account copy; removals are recorded in activity_logs, not a new table.
Published cards come only from provider targets explicitly live (shared `providerTargetState`), any provider's cancelled/non-live record for the same target vetoes them, and WaveOS publish_attempts only enrich cards; local attempt status can lag the provider, so it never creates, keeps or hides a card.
Every Zernio create-post request passes a pure single-target invariant (one platforms[] entry matching the variant and its selected connection, no other network's settings) before sending, stores the target summary in request_snapshot.waveosTarget, and treats any unrequested target in the response as an attention failure that is never auto-resent or auto-deleted.
Video Maker edits are non-destructive recipes saved in media_assets.source_metadata.video_maker_edit and previewed in the browser only; until rendering exists, Create Post publishes the original file, so the UI must never present an export.
Campaign Manager's five-step builder (Goal → Media → Analyze → Plan → Launch) wraps the existing plan/save logic; saved drafts follow the edited sequence, carry only user-reviewed captions, and confirmed media understanding is stored through saveCampaignMediaCorrections, so there is one linked-draft save path.
Server-first transcription uses native timed speech events; desktop and mobile share transcript persistence and edit recipes while maintaining separate presentation layouts.
Campaign workflow drafts retain complete recoverable builder state in the existing user/workspace-scoped payload so changing devices does not lose media, reviewed analysis or planned dates.
Create Post Drive interruptions use best-effort workspace/post-keyed session checkpoints; Safari continuation explicitly saves through existing draft mutations and carries only the saved-post URL, never credentials or unsaved content. Google Picker closes only on explicit callbacks, Exit or unmount, because browser storage and Google's private dialog DOM cannot establish authentication failure.
