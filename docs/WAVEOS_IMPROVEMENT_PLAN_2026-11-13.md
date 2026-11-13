# WaveOS improvement plan

Prepared November 13, 2026. Planning deliverable only; no implementation, migration, merge or release is represented as completed by this document.

## Product outcome

My Agent becomes the accessible starting point for creating, planning, understanding performance and resolving problems. Existing tools remain directly usable. Web and mobile share data, permissions and capabilities, with layouts suited to each device. Client brands and conversations remain isolated.

## Evidence and limits

Current repository inspected: main at f46425c1e1d07c08c91aec81294d030420f47242. The deployed revision has not been proven identical. Earlier audit results guide prioritization but must be reproduced before a repair is marked complete. Existing roadmap checkboxes and open PRs are historical evidence, not proof of current deployment.

Confirmed in current code: My Agent retains eight messages in browser session storage and sends six prior messages for ordinary advice; its caption builder sends no prior conversation. Shared assistant Brand Voice omits website, industry, primary services and service area, although those fields exist. Guided My Agent state is component-local. Advisor context includes bounded analytics, content, campaigns, media intelligence, corrections and transcripts. General durable brand preference learning is not implemented.

Confirmed in this audit's browser checks: Deliveries navigation, gallery and image preview work at 390px without page overflow. Deliveries management is under Clients rather than the gallery. Physical iPhone Picker, gesture feel, cross-device persistence and end-to-end provider publishing remain unverified.

## Delivery sequence

| Release | Work | Completion evidence |
| --- | --- | --- |
| 1: Reliability and shared brand context | Reproduce stale sending states, caption readiness/platform contradictions, wrong invoice navigation and workflow state loss. Reconcile provider status without resending live posts. Load the complete relevant brand profile across AI tools; include relevant instructions in caption generation. | Correct status on confirmed provider outcomes; pending stays pending when unknown; no duplicate provider writes; valid destination choices; relevant brand facts and conversation constraints appear in generated drafts. |
| 2: Durable My Agent | Add user/workspace-authorized conversations, messages and workflow checkpoints; conversation list, reopen, rename and delete controls; phone/computer resume. Retrieve relevant older messages with a bounded summary plus recent context. | Reload and second-device resume preserve the same conversation and selected workflow state; unauthorized access fails; workspace switching cannot leak messages; failed saves preserve user input and show retry. |
| 3: Brand learning and unified actions | Add reviewable learned preferences, approved writing examples and versioned brand guidance. Explicit “Remember for this brand” controls; propose lessons from edits rather than silently treating edits or AI claims as facts. Share context across captions, campaigns, research and Studio copy. | Saved corrections affect later relevant drafts; user can inspect, edit and forget a lesson; explicit current instructions take precedence; one client's lessons never appear for another. |
| 4: Creative and intelligence workflows | Complete campaign recovery and reviewed captions; verify Studio background replacement/export; add genuine video rendering; improve sourced research and analytics follow-through. | Each tool meets its acceptance criteria below. Video is only described as exported after an actual output is generated and checked. |
| 5: Business operations and release readiness | Improve delivery management, wedding portal, CRM, production, documents, payments visibility, subscription administration and onboarding; finish role/device checks. | End-to-end workflows pass for intended roles; live billing and existing promo terms remain correct; support paths and deployment checks pass. |

Releases are small reviewable changes, not one broad merge. Work from the latest main and reconcile old PR intent with current behavior before porting changes. PR #221 (90-day promos), #223 (longer browser history), #215 (Studio background) and #227 (iPhone media modal) need review; do not merge them merely because their titles match a requirement.

## Existing-tool improvement map

| Tool or area | Planned improvements | Acceptance criteria |
| --- | --- | --- |
| Home and navigation | Correct counts, role-specific shortcuts, usable mobile menu, contextual next actions and honest integration health. | Counts reconcile with their underlying records; invoice shortcut opens an actionable invoice destination; authorized destinations reachable at narrow widths. |
| My Agent | Persistent chats, resumable interactive steps, mid-flow changes, shared brand knowledge, contextual handoffs and clear action results. | Resume after reload/device switch; changing post count preserves other selections; saved draft opens correctly; completed actions are backed by saved record results. |
| Brand Voice and Brand Assist | Complete business facts, writing examples, editable remembered preferences, consistent context across tools and missing-profile guidance. | Same brand rules used by chat, captions and campaigns; no invented services/prices; client-specific preferences isolated. |
| Create Post | Reviewed captions, destination-specific validation, carousel ordering, reliable saved drafts, clear save/schedule/update states. | One carousel remains one post; saved order survives reload, review and final payload; unsupported placements blocked; meaningful placeholders cannot count as ready captions. |
| Social accounts and publishing | Connection-specific state, provider status reconciliation, actionable failures and duplicate protection. | Sending resolves from verified provider results; unknown outcomes are not automatically retried; requests target only the chosen account/platform. |
| Approvals | Verify existing same-record admin editing, media removal/order, caption/schedule updates and staff submission. | Update persists without duplicate drafts or unintended state changes; staff see authorized results; publishing uses latest reviewed fields. |
| Calendar | Accurate drafts/scheduled/sending/published states, timezone consistency and direct post editing. | Same scheduled instant and record shown across calendar, editor and provider; no silent reschedule or duplicate send. |
| Campaign Manager | Full builder recovery, folder-backed selection, distinct assets, user-correctable analysis, reviewed captions, editable sequence and explicit final approval. | Planned quantity, formats and dates match saved drafts; captions exist and are reviewed; reopen restores the full plan; recent-list limits do not hide accessible saved work. |
| Media Library and integrations | Drive/Dropbox/Frame.io source handling, permission recovery, expired URL guidance, upload quotas and clear storage choices. | Real authorized file selection/import succeeds; canceled/failed flows preserve work; source reconnect is user-driven; physical iPhone/PWA and Safari cases are checked separately. |
| Creative Studio | Background replacement/cropping, layer order, template fit, consistent artwork rendering and return to originating post. | Replace portrait/landscape background without covering text or stretching; undo restores state; exported artwork matches preview and excludes editor overlays. |
| Video Maker | Define a bounded first renderable feature set; render existing trim/caption/look recipes into a new file using a background worker; progress, cancellation, retry and quality checks. | Playback confirms the output contains edits, captions and audio correctly; original is preserved; output meets selected destination requirements. Capacity/provider choice requires an implementation spike and cost estimate. |
| Analytics | Freshness, supported comparisons, clear unavailable states, actionable explanations and better campaign/post linkage. | Totals reconcile with provider evidence; incompatible periods are not compared; recommendations distinguish observation from hypothesis. |
| Trending Now | Deduplicate results/counts, validate dates and original video sources, useful no-result states and brand-specific draft handoff. | Counts match distinct results; cited sources open; playable content is not confused with articles; chosen idea survives the handoff. |
| Competitive Intelligence and SEO | Reliable cited research, source normalization, plain-language findings and practical campaign briefs. | Findings trace to valid consulted sources; failures retain work and offer retry; no invented private metrics or guaranteed results. |
| Deliveries | Clear manager entry from mobile, add/update project links, revisions and client gallery boundaries. | Authorized manager can create and update a disposable delivery; client sees intended result; gallery media and delivered items have clear meanings. |
| Wedding portal | Preserve established style while improving mobile navigation, content access and migration continuity. | Existing client identity, files, contracts and paid/locked access remain correct; phone gallery and billing links work with a wedding test account. |
| CRM, Clients and Projects | Assignment visibility, workspace defaults, client lifecycle, invitations, search and connected project records. | Staff only access assigned/approved workspaces; invites lead to intended account; client updates propagate to related views without duplicates. |
| Production, shoot planning, Vision Board and Vision Studio | Preserve briefs, shot lists and project context across handoffs; improve mobile creation/editing and exports. | Saved project context reopens; assignments and deliverables remain linked; any shared output uses only explicitly selected access. |
| Documents, contracts, forms and Services & Pricing | Simplify authoring, variables, status and export; verify signature return and saved service pricing. | Test document values and client identity match; signature status verified; sent/signed documents do not change silently when a template changes. |
| Payments and invoices | Clear collected/outstanding/overdue views, direct navigation, simple amount/description entry, recorded manual-payment method and reliable status. | Amounts reconcile with source records; test-mode checkout/receipts work; manual status changes are audited; existing live subscriptions remain intact. |
| OS Data, SaaS Dashboard, promos and trials | Resolve editable promo/90-day implementation with current migration constraints; accurate subscription reporting and trial access labels. | Existing redemptions/active codes remain unchanged; new 31–90-day scenarios pass database and billing reconciliation checks; reporting distinguishes current state from revenue history. |
| Staff/Admin and access | Role-specific navigation, direct-route/server authorization and assigned-client isolation. | Test owner, staff and client roles including direct URL denial; shared chats have explicit authorized visibility rather than inheriting broad staff access. |
| Settings, onboarding, updates and notifications | Clear provider/account labels, guided setup, one-time walkthrough, accessible clear-all notifications and contextual help. | Save/reload works; setup can resume; updates appear once only when intentionally published; phone safe areas and keyboard behavior pass. |
| Feedback, Agent Care and email integrations | Diagnose integration state, explain confirmed causes, explicit reconnect paths and reviewable support cases; verify Outlook capability before enabling UI. | No false repair claims; safe diagnostics contain no tokens; external messages are sent only through authorized workflows; unsupported integrations are clearly identified. |

## My Agent architecture decisions

- Separate private user conversations from workspace brand knowledge. Staff collaboration is explicit; membership alone must not expose all private conversations.
- Persist messages with stable IDs, idempotent writes and safe recovery from network errors. Save tool identity, step, selected media/folder, draft values and related record IDs alongside the conversation checkpoint.
- Keep full stored history distinct from the model's bounded prompt. Use recent messages, relevant retrieved messages and a provenance-linked summary; do not send an entire workspace archive on every turn.
- Keep brand knowledge structured: current profile, approved preferences, approved examples, source and timestamps. Never promote an assistant's own generated claim into a business fact automatically.
- Preference order: explicit current instruction, approved current brand profile and corrections, relevant examples, model suggestion. Surface conflicts when a business fact would change.
- “Active learning” initially means controlled memory and example retrieval, not model retraining. Performance-informed suggestions require adequate compatible evidence and remain hypotheses unless supported.
- Reuse existing authorized actions with validated arguments, explicit review when needed and truthful success/failure feedback. Persisting conversations must not grant permission to publish, change billing or broaden provider access.
- Set and test retention/deletion behavior, summary invalidation after forgetting, and limits for AI context, storage and background processing before release.

## First implementation batch

1. Reproduce the shared-brand and caption-context gaps; add only regression checks that verify user-visible behavior.
2. Centralize relevant Brand Voice loading for existing AI callers and carry current drafting instructions into My Agent caption generation.
3. Design additive conversation/message/checkpoint storage and user/workspace authorization. Verify against the actual schema; do not replay historical migrations.
4. Implement saved chat + checkpoint recovery in an isolated branch/preview and test same-user phone/desktop resume, workspace switching, forbidden access and interrupted requests.
5. Add the first explicit saved-preference flow after history works; verify a remembered writing instruction changes a later draft and can be forgotten.

Reliability fixes can ship independently when their dependencies and acceptance checks pass. Do not hold a narrow publishing-status repair for completion of the full creative roadmap.

## Verification and release

For each batch: inspect latest source and deployed behavior; implement a focused change; run relevant functional tests, typecheck and build; verify in authenticated preview; record exactly what passed and what remains unverified. For migrations, check grants, RLS and cross-workspace denial. Test mobile widths 320/390/430 plus desktop, with real iPhone testing for provider authentication and gestures. Test billing with test mode and publishing with disposable accounts/content when authorized. Never use a live client post as a casual retry test.

Release notes distinguish implemented, preview-verified and production-verified. A successful build is not end-to-end validation. After release, check the deployed revision, actual navigation, saved record recovery and relevant provider state before calling the change complete. Prepare release evidence before the final deployment decision.

## Timing

No completion date is promised by this plan. Shared-brand/context fixes are smaller than persistent history; durable learning depends on that history; production video rendering is a separate infrastructure effort. Estimate each batch after verifying current schema, deployment path and external-provider requirements.
