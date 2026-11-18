# Folder-level video transcription intelligence

## Product outcome

WaveOS should understand what is actually said across the videos in an authorized user folder. Completed transcripts and their user corrections should become reusable evidence for My Agent, Campaign Manager, captions, content search and creative planning—not a one-time tool limited to a clip that happens to be open.

The system must distinguish:

- the source media;
- the real speech-to-text transcript;
- user-authored transcript corrections;
- AI-derived topics, summaries and recommendations.

Derived intelligence can help organize and recommend content, but it can never replace or silently modify transcript evidence.

## Folder workflow

### 1. Inspect before processing

When an authorized user chooses **Understand this folder**, WaveOS first enumerates the complete authorized folder and reports:

- total files and nested folders discovered;
- eligible video/audio items;
- already completed and current transcripts;
- items with no detected speech;
- queued or processing items;
- failed, stale, inaccessible and unsupported items;
- estimated audio duration and any applicable usage/cost warning;
- whether the folder listing itself is complete or partial.

The user can select all missing items or a smaller subset before starting. A partial Drive, Dropbox or Frame.io listing is never treated as complete transcript coverage.

### 2. Durable batch transcription

Folder transcription runs as durable server-managed jobs rather than a long browser loop.

- Create one idempotent item job per workspace/media/version.
- Use bounded concurrency and provider-aware rate limiting.
- Skip current completed transcripts unless the user explicitly requests reprocessing.
- Resume queued/failed eligible items without retranscribing successful items.
- Record real progress and per-item state; do not display simulated percentages.
- Allow pause for the batch and safe retry within documented attempt limits.
- Continue after the user closes the browser and show the latest state when they return.
- Provide a final receipt with completed, no-speech, unsupported, failed and still-pending counts.

## Evidence model

For each item, retain:

- workspace, media and source/version identity;
- transcript status and safe failure code;
- audio source and duration;
- provider/model and completion time;
- detected source language;
- transcript text and real timed segments when provided;
- transcript-derived key moments linked to real segment timestamps;
- optional user-corrected text/segments, editor and edit time;
- source fingerprint or provider version used for freshness checks.

User correction always wins when AI reads or quotes a transcript. Quotes must be present in the effective transcript. “No speech,” unsupported and failed are evidence states—not empty successful transcripts.

## Derived folder intelligence

After transcript completion, WaveOS may derive a separate evidence-linked record containing:

- main topics and subtopics;
- possible hooks and strong opening moments;
- offers, calls to action and explicit claims;
- products, services, people or locations actually mentioned;
- questions, objections, educational points and emotional beats;
- suggested content purpose and campaign fit;
- short searchable summary;
- transcript segment IDs/timestamps supporting each derived item;
- confidence and limitations.

Visual understanding remains separate. Transcript intelligence describes what was said; it must not claim what the video shows unless verified frame/image evidence is also available.

## Retrieval for WaveOS AI

Do not send every full transcript from a large folder into each model request. Build a workspace-scoped retrieval layer that:

1. filters to media the current user can access;
2. searches effective transcript text and derived topics for the user's goal;
3. returns a bounded set of relevant excerpts with media IDs, filenames, timestamps and evidence type;
4. prioritizes user corrections and current source versions;
5. labels missing, stale and partial folder coverage;
6. records which excerpts supported the recommendation.

My Agent and Campaign Manager should be able to answer questions such as:

- “Which clips mention the skincare consultation?”
- “Find our strongest educational hooks in this folder.”
- “Which videos contain a clear call to book?”
- “Build a five-post campaign from clips that discuss different services.”

Results should open the exact media item and seek to the relevant moment when a real timestamp is available.

## User experience

- Folder-level coverage card with counts and last update.
- Progress grouped into Processing, Ready, Needs attention and Unsupported.
- Search spoken content across the folder.
- Filters for topics, language, transcript status, source, date and content suitability.
- Inspect, correct, restore original, retry, reprocess or delete a transcript according to permission.
- **Use in campaign** and **Ask My Agent** actions that carry selected evidence and folder context.
- Concise default view with item-level technical detail available on demand.

## Privacy, permissions and lifecycle

- Require active workspace access and AI/transcription entitlement on every server action.
- Never expose OAuth tokens, signed provider URLs or another workspace's transcripts/intelligence to the browser or model.
- Fetch provider media only for the authorized item and only for the time needed to process it; do not create an undisclosed duplicate media library.
- Keep transcript and derived intelligence isolated to the source workspace; never train or recommend across clients.
- Mark results stale when the provider file identity/version changes.
- Deleting or permanently detaching source media follows a documented transcript/intelligence retention or deletion policy.
- Batch auto-transcription of new media is opt-in, owner configurable, visible and pausable because it consumes AI resources and may process sensitive client audio.

## Current-state gap confirmed November 9, 2026

- WaveOS already has real speech-to-text, persisted transcript states, timed segments where available, no-speech handling, retry limits, key moments and user corrections.
- Current controls primarily transcribe individual or selected campaign/video-editor media while the browser is actively coordinating the request.
- Campaign AI can read completed transcripts for explicitly selected media, and user corrections take priority.
- There is no folder-level inventory, durable batch queue, complete coverage/freshness view, transcript search, derived folder index or bounded retrieval service shared by My Agent and Campaign Manager.
- Direct server transcription is currently constrained by supported formats and a 24 MB original-file limit; device extraction supports additional cases but is not a durable background strategy for an entire folder.

## Acceptance criteria

- A folder scan reports the complete eligible count and never mistakes a partial provider listing for full coverage.
- Starting a batch is idempotent and continues after the browser closes.
- Completed items are not retranscribed on retry; failures resume individually.
- User corrections immediately replace machine text in AI retrieval without deleting the original transcript.
- Replacing a provider file invalidates the old transcript association.
- Search finds spoken phrases beyond filenames and opens the correct timestamped clip.
- Campaign Manager produces distinct recommendations using relevant folder transcript evidence and cites the supporting clips/moments.
- My Agent accurately states coverage limitations and never quotes a clip without transcript evidence.
- Another workspace cannot list, search, retrieve or infer transcript content, counts or job states.
- Silence, unsupported formats, long/large media, multiple languages, provider expiry and rate limits all produce honest recoverable states.
