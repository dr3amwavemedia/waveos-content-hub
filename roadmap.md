# P0 — Restore iPhone Home Screen Google Drive
- [ ] Treat Google Drive in the installed iPhone Home Screen app as a release-blocking regression: it worked before the recent changes and the connection now fails in that context.
- [ ] Identify the first breaking change without reconnecting accounts, changing scopes, replacing credentials or disturbing existing Drive authorizations.
- [ ] Replace the embedded-Picker dependency for iOS standalone mode with Google's supported top-level mobile Picker/OAuth redirect flow (`trigger_onepick=true`) while preserving the existing web Picker for regular browsers.
- [ ] Preserve the same saved Create Post draft across the browser round trip; import only explicitly returned file IDs and never create a duplicate post.
- [ ] Acceptance test on the affected physical iPhone: open from the Home Screen app, choose a new Drive file, return to the same WaveOS draft, confirm the file is attached, and save without publishing.

# P1 — Make My Agent the role-aware WaveOS operating assistant
- [ ] Give every active DWM Admin, DWM Staff member, DWM client and WaveOS user access to My Agent; available actions must still follow the active workspace, staff type, client role and purchased WaveOS tools.
- [ ] Replace the current navigation-and-advice-only behavior with a typed capability registry that reuses existing server actions and RLS rather than bypassing app permissions.
- [ ] Admin capabilities: create and update clients, invoices, deliveries and contracts; accept a pasted delivery link; attach records to the correct client profile; prepare SignWell drafts and open the authorized SignWell workflow.
- [ ] Staff capabilities: expose the same assistant but only the actions already permitted for Sales, Social Manager/Media Manager or Crew; never broaden a staff member's route or data access through My Agent.
- [ ] Client and WaveOS-user capabilities: operate only the tools, records and workspaces already available to that user; never expose another client's data or staff-only controls.
- [ ] Keep consequential actions review-first: creating drafts may be direct, but sending invoices, publishing content, charging payments, sharing deliveries and sending contracts for signature require a clear preview and explicit confirmation.
- [ ] Add an action receipt and activity-log entry for every mutation, including actor, acting role, workspace, target record and outcome; failures must leave existing records unchanged.
- [ ] Verify the role/action matrix with Admin, Sales, Social Manager, Crew, DWM client and public WaveOS accounts on desktop and mobile.

# P2 — Make My Agent the all-in-one client operating workspace
- [ ] Let authorized users create, view and manage a client's campaigns from inside My Agent without losing conversation or client context.
- [ ] Surface connected folder status, start or repair authorized folder syncs and show actionable sync errors without replacing credentials or broadening file access.
- [ ] Show live, source-labeled client and campaign stats with freshness timestamps; never describe cached, missing or estimated data as live.
- [ ] Embed Creative Studio actions in the conversation so users can move directly from an idea, asset, campaign or insight into a reviewable creative draft.
- [ ] Bring Competitive Intelligence into My Agent with cited evidence, saved client context and direct handoffs into campaign ideas, content drafts and posting workflows.
- [ ] Put clear “Create content” and “Prepare post” actions next to campaign, analytics and competitive insights so an authorized user can begin immediately without navigating away.
- [ ] Preserve the existing publish boundary: drafting and preparation may happen immediately, but posting or publishing requires a final preview, destination selection and explicit confirmation.
- [ ] Verify complete client-context isolation and the campaign → folder/media → insight → creative → approval → post workflow on phone and desktop.

# P3 — Rebuild Competitive Intelligence as a visual, evidence-backed scorecard
- [ ] Replace the plain, text-heavy dashboard with an executive visual scorecard that shows the user's brand beside selected competitors and makes strengths, weaknesses, gaps and next actions obvious at a glance.
- [ ] Add transparent 0–100 assessment scores for Brand Visibility, Brand Recognition Signals, Messaging Clarity, Differentiation, Content & Social Presence, Website & SEO, Reputation & Trust and Conversion Readiness; show the rubric, evidence coverage, confidence and research date for every score.
- [ ] Never present an AI estimate as measured market awareness, recognition, traffic, engagement or market share; use connected first-party data when available and label public-evidence assessments accurately.
- [ ] Allow research to begin with a business name, domain, Google listing or public social profile, then discover additional verified public web and social sources without treating the first link as the only source.
- [ ] Let users add multiple official or supporting URLs to each company portfolio, classify each source, deduplicate it and clearly show what was accessed, blocked, stale or not found.
- [ ] Add visual brand-vs-competitor comparisons, category leaders, score gaps, strengths, weaknesses, opportunities and prioritized recommendations that link back to supporting evidence.
- [ ] Deepen B2B analysis with positioning, audience, offer/service mix, messaging, channels, content strategy, website/SEO, reviews/reputation, funnel/conversion path, differentiators, overlap, whitespace and actionable 30/60/90-day recommendations.
- [ ] Add marketer-ready and showcase-ready report views with a concise executive summary, source appendix and export/share controls that never leak private workspace or client data.
- [ ] Connect every supported opportunity to My Agent actions for starting a campaign, creating content, opening Creative Studio or preparing a post; publication still requires explicit confirmation.
- [ ] Verify scoring determinism, citation integrity, source isolation, mobile/desktop visualization and B2B independence with sparse, conflicting, blocked and multi-source research cases.

# P4 — Add admin-issued complimentary WaveOS access codes
- [ ] Let an authorized DWM owner/admin create a true complimentary-access code that skips Stripe Checkout and grants a selected WaveOS plan; this is not a free trial, discount or extended trial.
- [ ] Support eligible new and existing WaveOS users while refusing to cancel, overwrite or silently convert an active Stripe subscription.
- [ ] Give each code a plan, label, redemption limit, start/end availability, optional eligible email/domain and either access-until-revoked or an explicit access end date.
- [ ] Store every redemption as a separate complimentary entitlement with the actor, code, user, workspace, plan, grant time, access duration and revocation state; do not reuse `internal_test_access` or trial records.
- [ ] Preserve the selected plan's normal account limits, platforms and feature permissions while payment collection remains disabled for the complimentary entitlement.
- [ ] Show the user and admin a clear “Complimentary access” billing state with plan and duration; never show trial countdowns, payment-failure warnings or misleading Stripe invoices.
- [ ] Protect code validation and redemption server-side with owner-only creation, non-enumerating errors, rate limits, atomic redemption limits, workspace/user validation and complete activity logs.
- [ ] Allow an owner/admin to pause future redemption and explicitly revoke or change an individual grant without altering unrelated users or historical audit records.
- [ ] Exclude complimentary grants from paid MRR/subscriber metrics while reporting them separately as active complimentary accounts.
- [ ] Test new signup, existing unpaid account, exhausted/expired/reused code, wrong email/domain, concurrent redemption, revocation and attempted use against an active paid subscription.

# P5 — Refresh every DWM client dashboard without changing client records
- [ ] Replace the old-style DWM client home presentation with the current WaveOS visual language for Project, Growth, Retainer/Social Management and Wedding client accounts on phone and desktop.
- [ ] Keep the dashboard client-first: personalized branded welcome, current project/status, the next required action, pending approvals, upcoming work, recent deliveries and clear shortcuts before secondary history.
- [ ] Preserve existing delivery records, destinations, provider links, previews, downloads and access rules; the redesign must not copy, migrate, rename or rewrite deliveries.
- [ ] Preserve existing contract records, SignWell/Bloom/other-provider status, signing, copy/download behavior, publication visibility and client-specific access.
- [ ] Preserve invoices, line items, payment schedules, Stripe checkout, autopay, payment ledger, receipt/status behavior and financial-role gating exactly as implemented.
- [ ] Preserve each workspace's logo, business-name display preference, colors, coordinated palette, wedding theme and configured client-facing copy.
- [ ] Reuse the existing queries, server actions and RLS-backed records behind redesigned presentation components; do not create a parallel client-data system.
- [ ] Keep tier-specific visibility and inactive/pending states intact while giving every DWM client tier the same quality level and responsive visual system.
- [ ] Add honest loading, empty, unavailable and error states; never replace missing client records or provider data with sample content.
- [ ] Regression-test each client tier and financial role on phone and desktop, including delivery open/download, contract sign/copy/download, invoice payment/autopay, branding reload, workspace switching and direct section links.

# P6 — Show complete Frame.io delivery folders
- [ ] Fix the reported Organic Skin Care delivery so the assigned Frame.io folder shows its complete authorized contents rather than only a subset.
- [ ] Follow every Frame.io V4 cursor page and verify returned counts before describing a folder or share as complete; preserve an explicit partial/error state if retrieval stops.
- [ ] Expand folders assigned through the authorized share recursively, including nested folders and supported version-stack contents, without traversing parent folders, sibling folders or unrelated Frame.io projects.
- [ ] Stop silently discarding delivery files outside the current JPEG, PNG, MP4 and QuickTime filter; show every authorized file with the best supported preview and a safe Frame.io/open-download fallback.
- [ ] Keep the client-home media strip as an intentional preview only, clearly label its item count and provide a direct “View complete delivery” action; the Deliveries page must show the full collection.
- [ ] Add folder path, type filters, search, total/loaded counts, progressive loading and recoverable next-page errors for large deliveries on phone and desktop.
- [ ] Cache and refresh large read-only listings without copying Frame.io originals or persisting expired signed thumbnail/download URLs.
- [ ] Preserve the existing workspace-to-share assignment, client permissions, delivery record and Frame.io source link; do not broaden access while repairing enumeration.
- [ ] Validate the displayed file/folder totals against the assigned Frame.io share, including more than 100 items, multiple pages, nested folders, mixed file types, duplicate names and provider rate-limit/reconnect failures.

# P7 — Add campaign readiness checks and truly media-specific AI campaigns
- [ ] Add a Campaign Readiness panel that verifies Brand Voice, social connections, publishing-provider profile, analytics freshness/coverage, selected media availability, external-folder sync, transcripts/visual analysis, AI availability, plan entitlement and save permissions before generation.
- [ ] Show each source as Ready, Limited, Action needed or Admin required with its last successful sync, evidence coverage and a plain-language explanation; never claim “everything is synced” without a verified source and timestamp.
- [ ] Give user-fixable issues a direct action and a “Fix with My Agent” handoff that preserves workspace/campaign context; route owner-only provider, entitlement, credential, mapping or service failures to Contact Admin with a safe diagnostic receipt.
- [ ] Let My Agent perform only the repair actions the current user is authorized to run, such as refreshing analytics or restarting an existing folder sync; OAuth reconnection and consequential changes still require the proper user/admin interaction.
- [ ] Build campaign recommendations from the selected goal, platforms, Brand Voice, fresh compatible analytics, prior content signals, media filenames/titles/tags, saved corrections, image/video evidence and transcripts; label missing or stale inputs and use explicit fallbacks.
- [ ] Repair caption generation so every post receives its own media context. Include the asset title/filename even when a campaign brief exists, and include authorized tags, learned/corrected understanding, transcript evidence and platform/format context.
- [ ] Pass media context into the actual caption-suite prompt; the current code loads selected media but omits it from the prompt, and the current bulk-caption path does not send media IDs at all.
- [ ] Provide Generate missing, Regenerate selected and Regenerate all actions; preview replacements and never overwrite a user-edited caption without explicit confirmation.
- [ ] Validate that generated captions are non-empty, meaningfully distinct across campaign posts and saved to both the content item and correct platform variant; flag repetitive output for regeneration instead of reporting success.
- [ ] Require one caption result or an explicit per-item failure for every selected post, with retry that resumes only failed items and a durable generation receipt; no silent partial campaign completion.
- [ ] Verify with correctly named clips, duplicate/similar filenames, transcripts, metadata-only media, stale/no analytics, disconnected accounts, partial provider failures and multiple platforms on phone and desktop without publishing.

# P8 — Turn Campaign Manager and My Agent into guided content decision tools
- [ ] Give users a clear recommendation about which content to use, why it fits the goal/audience/platform, what evidence supports it and what to do next instead of presenting an undirected AI button.
- [ ] Start with a focused “Best next move” and a short ranked set of recommended assets or concepts; place methodology, alternate options and detailed evidence behind progressive disclosure.
- [ ] Ask only the smallest useful follow-up question when a missing goal, audience, offer, platform or constraint would materially change the recommendation; preserve prior answers and workspace context.
- [ ] For every recommended asset, show the proposed role, hook, format/platform, confidence, evidence level and one concise reason; distinguish visual/transcript evidence from filename/metadata inference.
- [ ] Provide simple feedback controls—Use this, Show another, Not relevant, Wrong interpretation and Edit understanding—and apply the feedback immediately to the current campaign.
- [ ] Save explicit user corrections as private workspace intelligence and reuse them in both Campaign Manager and My Agent; never learn across clients or treat an unconfirmed AI inference as user truth.
- [ ] Keep Campaign Manager and My Agent consistent by using the same recommendation inputs, evidence labels, corrections and saved campaign state rather than producing conflicting advice.
- [ ] Avoid information overload with one primary action per state, concise summaries, sensible defaults and expandable details; preserve full expert controls without making them the starting screen.
- [ ] Explain tradeoffs when several choices are strong and clearly state when there is not enough evidence to rank content instead of manufacturing certainty.
- [ ] Connect an accepted recommendation directly to a reviewable campaign/post draft while preserving approval and explicit publication confirmation.
- [ ] Test novice and marketer workflows on phone and desktop for comprehension, decision time, correction persistence, cross-tool consistency and safe client/workspace isolation.

# P9 — Build folder-level video transcription intelligence
- [ ] Add an authorized “Understand this folder” workflow that inventories every eligible video/audio item in the selected WaveOS, Drive, Dropbox or Frame.io folder and shows existing, pending, completed, no-speech, failed and unsupported transcript coverage before starting.
- [ ] Let the user explicitly transcribe missing eligible items in a durable background queue with idempotency, bounded concurrency, rate-limit handling, retry limits, resumable progress and per-item outcomes; do not require the browser to remain open.
- [ ] Preserve current real speech-to-text evidence, timed segments, key moments, source language, model/source metadata and user corrections; user-corrected transcripts remain authoritative over machine text.
- [ ] Derive separate, evidence-linked media intelligence such as topics, hooks, offers, calls to action, named products/services, useful moments and content-purpose summaries without changing the underlying transcript or inventing unseen/unsaid details.
- [ ] Build a workspace-isolated folder intelligence index that lets My Agent and Campaign Manager retrieve only the most relevant authorized transcript excerpts and media evidence instead of sending an entire unbounded folder to the model.
- [ ] Show folder coverage, freshness and limitations in Campaign Readiness and My Agent; a folder is not “understood” when items are unlisted, untranscribed, stale, blocked, unsupported or failed.
- [ ] Detect changed/replaced source media and mark its transcript/intelligence stale until it is reprocessed; never reuse a transcript against a different provider file version.
- [ ] Add search and filters for spoken words, topics, people/products, key moments, language, transcript state and content suitability with direct seek/open actions when timestamps are available.
- [ ] Offer an owner-configurable opt-in for automatically queueing newly added eligible folder media, with visible cost/usage controls and an immediate pause; default batch transcription remains an explicit user action.
- [ ] Keep source media private and transient during processing, enforce workspace membership and feature access server-side, retain no cross-client learning and provide transcript deletion/reprocessing controls consistent with the source record lifecycle.
- [ ] Verify nested and 100+ item folders, multiple languages, silence, long/large/unsupported clips, external provider expiry, duplicate/replaced files, user corrections, partial batch failure and cross-workspace denial on phone and desktop.

# P10 — Deep-audit trials, subscriptions and mobile/web release health
- [ ] Reconcile every production WaveOS subscription row against its OS workspace, entitlement result and read-only Stripe customer/subscription/invoice state; report mismatches without changing live billing.
- [ ] Verify valid trialing, checkout-pending, active, past-due, canceled, expired, internal-test and future complimentary states, including required Stripe IDs, dates, plan limits, locks and feature access.
- [ ] Audit recent subscription webhook receipt, signature verification, deduplication, processing outcomes, stale/unprocessed events and provider-to-WaveOS update lag with secrets and customer data redacted.
- [ ] In an isolated backend with Stripe test mode, exercise signup, promo trial, paid checkout, return confirmation, first/second payment failure, service lock, payment recovery, cancellation, reactivation and billing-portal access end to end.
- [ ] Confirm public WaveOS users receive exactly their plan features and limits, while DWM clients remain isolated from OS subscription gating and billing records.
- [ ] Run typecheck, unit tests, production build and authenticated browser smoke tests; distinguish static source assertions from real runtime/provider evidence in the report.
- [ ] Test critical journeys on iPhone Safari, installed iPhone Home Screen/PWA, Android Chrome and desktop Chrome/Safari/Edge at representative widths, including reload, session persistence, redirect return and recoverable failures.
- [ ] Cover signup/onboarding, authentication, checkout/settings, social connection, create post, media/folders, analytics, campaign workflows, My Agent and DWM client delivery/contract/invoice access without publishing or making live charges.
- [ ] Record performance, accessibility, console/network errors, broken links, overflow, safe-area/keyboard behavior and unavailable/empty/loading states with reproducible evidence.
- [ ] Do not certify release health while the known iPhone Home Screen Google Drive regression or another P0 journey remains unresolved; issue a clear pass/conditional-pass/fail decision with blockers and owners.

# P11 — Produce an easy-to-read WaveOS and DWM client experience audit
- [ ] Audit complete journeys for public WaveOS Ripple, Current and Tidal users plus DWM Project, Growth, Retainer/Social Management and Wedding clients, including financial and non-financial client roles.
- [ ] Review navigation, information hierarchy, terminology, onboarding, dashboards, task completion, feedback, recovery, permissions, mobile ergonomics, accessibility and consistency across connected tools.
- [ ] Evaluate the core journeys: signup/payment, workspace setup, social connection, media/folder import, Create Post, Campaign Manager, analytics, Competitive Intelligence, Creative Studio, My Agent, settings/support, approvals, deliveries, contracts and invoices.
- [ ] Test real loading, empty, stale, disconnected, permission-denied, provider-failure and partial-success states; do not score only polished happy-path screenshots.
- [ ] Measure whether users can understand where they are, what is ready, what needs attention, what action is safest next and whether that action completed successfully.
- [ ] Deliver a concise executive scorecard, separate WaveOS-user and DWM-client journey maps, top findings, severity/role/device tags, supporting evidence, recommended fix and acceptance criteria.
- [ ] Organize findings into P0 blockers, P1 major friction, P2 improvements and P3 polish, plus quick wins versus structural work; tie duplicates back to one root issue.
- [ ] Use plain language and visual evidence while protecting client names, media, invoices, contracts, identifiers and provider details in any shareable report.
- [ ] Include what already works well, what remains unverified and where evidence conflicts; never convert missing test coverage into a passing score.
- [ ] End with a prioritized experience roadmap, estimated dependency order and regression matrix for phone and desktop, aligned with priorities P0–P10 rather than creating a disconnected redesign list.

# P12 — Deep-scan My Agent after the operating-assistant build
- [ ] Audit every exposed My Agent tool by user role, workspace type, entitlement and staff subtype; verify the UI never offers an action the server will reject.
- [ ] Inventory supported read and write capabilities, missing workflows, confirmation requirements, audit receipts, error recovery and handoff points to existing screens.
- [ ] Test client creation, invoice preparation, delivery-link intake, contract preparation/SignWell handoff, campaign/content work, analytics, Creative Studio and competitive research without bypassing existing permissions.
- [ ] Measure answer quality, action completion, evidence grounding, latency, token/credit usage, duplicate actions and cross-workspace isolation on phone and desktop.
- [ ] Produce a plain-language capability matrix and prioritized improvement list, separating real actions from guidance-only features and future work.

# P13 — Final regression run and major-change report
- [ ] Run typecheck, the full unit suite, production build and representative authenticated phone/desktop smoke journeys after all priority work is integrated.
- [ ] Reconcile schema migrations, generated database types, GitHub branch state, Supabase environment identity and Lovable sync state without deploying or changing live data unexpectedly.
- [ ] Report every major change by user outcome, affected roles/devices, verification evidence, migration/configuration dependency and rollback consideration.
- [ ] List remaining limitations, unverified provider/device flows, known risks and recommended next improvements in priority order; never label untested work complete.
- [ ] Provide an easy-to-read release decision—pass, conditional pass or fail—with explicit blockers and owner actions.

# Admin social review repair
- [ ] Add admin-only same-record review editing, explicit save and decisions; preserve staff restrictions and publishing boundaries.
- [ ] Test caption/media/order/schedule persistence and latest publishing payload; verify desktop/mobile without live publishing.

# Approved mobile refinement

- [ ] Repair iPhone media/Google Picker viewport, safe-area and layering defects; preserve desktop, explicit callbacks and saved-draft Safari handoff; verify mobile/desktop and tests without publishing.

- [x] Implement approved manual Safari continuation without embedded-browser detection; explicit save gates the safe link, independent save-error feedback preserves original Picker. Authenticated phone/desktop checks block writes; device launch and actual Google selection remain unverified. No publication or OAuth changes.

- [x] Investigate second-iPhone Safari Picker failure; verify token/account match and eight authorized files, add explicit existing-scope browser fallback, 402 unit tests pass and preview build OK. Picker root cause remains blocked on real-iPhone traces and Google Cloud restriction access; no publication or scope/secret changes.

- [x] Compare Nov 6 Google Picker against 2fc4335b30, PR #224/#225 and 867468de; restore explicit-only dismissal and best-effort checkpoints. All 389 tests pass; preview build OK. Real token issuance returned 200; baseline and current initializers both showed Google sign-in prompts under identical session/origin conditions. Nothing published.
- [ ] Establish reported account-wide Google Picker failure cause: blocked on affected-browser Google session/cookie and deployed key-restriction evidence; successful file selection and physical-iPhone Safari continuation remain unverified. OAuth issuance/configuration source is unchanged; no blanket cookie/PWA diagnosis is established.

- [x] Narrow Drive Picker repair: session checkpoint restores interrupted draft; visible cancel/error/empty states and explicit saved-draft Safari handoff; 42 focused tests and authenticated simulated callbacks passed, preview build OK. Physical iOS Safari launch and real Google selection remain device-verification limitations; no publishing.

- [ ] Urgent repair: regenerate only package-lock.json, verify npm ci compatibility, preserve all other work; no deployment.

# Shared campaign and video intelligence completion
- [ ] Use server-first real speech-to-text with provider timestamps, persisted outcomes and safe retries.
- [ ] Expose transcripts and equivalent video caption/look controls on desktop without mobile styling.
- [ ] Persist complete campaign builder drafts across devices using existing authorized draft storage.
- [ ] Verify authenticated desktop/mobile, real transcription, type checks, unit tests and preview build; do not deploy.

# SaaS Dashboard
- [x] Add owner-authorized read-only OS SaaS metrics and navigation without billing/data changes; exact files and sources documented in docs/saas-dashboard.md.
- [x] Verify real owner data/all tabs, role-denial unit tests, mobile/desktop layout, 205 passing tests and preview build OK; no billing/data writes.

# October 17 subscription preservation and missing foundations
- [x] Keep live subscriptions enabled and verify subscription-only gating without changing Stripe behavior; six focused tests pass.
- [x] Add eleven required missing feature tables and new-table policies; existing billing, client records and memberships unchanged.
- [x] Verify signed-in feature-table reads return 200, all tables have RLS/no anonymous grants, 202 unit tests pass and preview build OK; save/reload writes not exercised.

# October 16 redesign handoff
- [x] Simplify media-first Create Post and clear mobile header/navigation; signed-in photo preview and local-draft return checked.
- [x] Add video-first discovery, natural-language search, compact filters, supporting evidence and explicit original-concept handoff without database changes.
- [x] Add non-destructive Apply Brand choices and proportional logo rendering with one-step undo; signed-in mobile choice/undo checked.
- [x] Verify signed-in mobile/desktop layouts and 192 passing unit tests without live saves or publishing; preview build OK.
- [ ] Verify live video playback and evidence-to-post flow: research returned no dated original videos for the tested cinematic real-estate query; no samples substituted.
- [ ] Verify exported artwork returning to the originating post: export attachment uses existing media upload and requires an approved live-record write; no upload performed during verification.
- [ ] Deeper AI synthesis: current implementation provides sourced search plus original reviewable concept outlines; model-generated brand-specific hook/caption synthesis remains unfinished.

- [x] Preserve existing synced navigation; no branch switching or main-sync claim.
- [x] Polish role-aware Home and Social Media mobile screens.
- [x] Make Social Analytics visual with sourced data only.
- [x] Add canvas-first Creative Studio mobile starting actions and editing tools.
- [x] Guide mobile campaign creation through existing fields.
- [x] Guide mobile invoice creation with searchable pricing items.
- [x] Verify mobile previews and desktop editor without saving, publishing or changing live data.

# PR #171 navigation and invoice pass

- [x] Confirm current main and inspect PR #171 without replacing newer work.
- [x] Apply the exact GitHub navigation and invoice presentation changes in Preview only.
- [x] Verify the admin menu and all five invoice steps at phone width without saving data; focused invoice tests passed.

# Next UI/UX and intelligence phase

- [x] Preserve and inspect current Creative Studio, Analytics and Competitive Intelligence foundations.
- [x] Complete focused mobile editing and contextual direct-touch manipulation; browser touch pinch, twist, undo and viewport zoom checked.
- [x] Complete visual media, template, layer and saved-design pickers.
- [x] Add evidence-backed growth analytics and compatible historical comparisons; missing history remains unavailable.
- [x] Complete one-input public competitor research, cited reports and qualitative landscape comparisons; signed-in research checked.
- [x] Connect supported research ideas to content drafts without automatic publishing; existing drafts require an explicit append action.
- [x] Verify phone, tablet and desktop workflows without changing production or live records; 168 unit tests passed.
- [ ] AI photo analysis and AI analytics: blocked by the required AI package's release-age safeguard; no substitute is presented as AI.
- [ ] Physical-device gesture feel: requires a real phone/tablet review; browser touch interactions passed.
# Approved template reference replacement

- [x] Replace legacy blue-bar templates with native layered reference-inspired designs and real previews.
- [x] Preserve editor/export/history; add format variants and available workspace brand application.
- [x] Verify signed-in mobile Templates, layer editing, undo and export without saving live records.
- [x] Run focused tests; 7 focused and 171 total passed with command-scoped live-subscription flag false; harness build OK. No migrations.
- [ ] Saved brand-font and secondary-logo application: current Brand Profile exposes neither; requires separately approved storage/field support. Existing accent/logo application and font-preservation behavior are implemented.

# Graphics and Feature Pack v3

# Competitive citation repair
- [x] Normalize public source URLs before report validation, preserve consulted-source matching and hide technical errors.
- [x] Test malformed/mixed citations; 185 unit tests passed. Signed-in mobile research rendered 12 source links without raw errors; a separate unsupported response showed the safe failure message. No database writes or publishing.

- [x] Add direct template background/media-slot replacement preserving composition and crop; mobile sample replacement passed; unavailable external images leave artwork unchanged.
- [x] Expand Brand Assist using available real workspace fields; unsupported saved fonts and secondary logos remain approval-blocked.
- [x] Recreate real-estate reference designs as native editable format-aware templates; mobile finished thumbnails verified.
- [x] Add sourced Trending Now discovery, evidence/licensing states and explicit Create Post handoff; signed-in source/brief check passed.
- [x] Diagnose provider mapping/analytics contract and explicit account-scoped refresh; real connected workspace metrics and refresh checked.
- [x] Run tests and preview checks; 180 unit tests passed; no migrations or publishing.
- [ ] Durable sync diagnostics, historical snapshots and saved trends: database approval required; requirements in docs/phase2/pack-v3-schema-approval.md.
- [ ] External workspace photo editing: current selected external content fails to load; source reconnection/access remedy required. Loadable sample replacement and failure preservation verified.

# One-time New Update
- [x] Show each published release once per user for WaveOS SaaS (os_data) workspaces; stored per user/release in the database, closing records dismissal.
- [ ] Publish the first release entry — waits on owner approval (no release rows exist yet).
