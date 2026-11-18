# My Agent operating-assistant requirements

## Product intent

My Agent is the single conversational operating assistant across WaveOS. Every active user can open it. It can explain, find, prepare and execute workflows already available to that user inside the active workspace. It never grants a permission, entitlement, workspace membership or record access that the user does not already have.

## Role behavior

| User | My Agent access | Allowed operating scope |
| --- | --- | --- |
| DWM Admin | Always | All existing admin-authorized WaveOS workflows and client workspaces. |
| Sales staff | Always | Sales/CRM/client workflows already allowed to Sales; no social publishing or owner-only administration unless separately permitted. |
| Social Manager / Media Manager | Always | Assigned client social, content, media, campaign, review and analytics workflows; no owner-only billing or staff administration. |
| Crew | Always | Assigned production, calendar, content and delivery workflows already available to Crew. |
| DWM client | Always | Only the client's memberships, records and client-facing tools. |
| WaveOS user | Always | Only the active OS workspace and tools included in that user's account/plan. |

## Required workflows

- Create or update a client and attach related records to that client profile.
- Create, edit and prepare an invoice using existing numbering, line-item, payment-schedule and authorization rules.
- Accept a pasted supported link, validate it and add it as a delivery for the selected client without exposing unrelated client records.
- Create or edit a contract, populate saved client details, save it to the client profile and prepare the existing SignWell draft/edit flow.
- Find and work with media, posts, campaigns, analytics, approvals, schedules and the other tools the active user can already access.
- Preserve conversation context when the user refines an existing record; do not restart a builder merely because a message contains words such as “make,” “caption,” “invoice,” or “contract.”

## All-in-one client experience

My Agent is the primary operating surface for client work, not a separate advice screen or a collection of links. Once a client is selected, that client context follows the conversation across campaigns, connected folders, media, analytics, Creative Studio, Competitive Intelligence, approvals and content preparation.

- Create, inspect, update and organize client campaigns without leaving the conversation.
- Display connected folder state, recent sync activity and recoverable errors; allow authorized users to start or repair a supported sync using the existing connection and file permissions.
- Display source-labeled live statistics with an “updated at” time and a visible stale/unavailable state when the underlying source is not current.
- Use Creative Studio in context to turn a brief, campaign item, media asset or insight into an editable creative draft.
- Run Competitive Intelligence in context, retain citations and the selected client/competitor, and turn supported findings into campaign ideas or content drafts.
- Offer immediate next actions such as **Create content** and **Prepare post** beside relevant findings. These actions begin a populated draft; they do not silently publish.
- Keep the selected client, campaign, channel, source assets and approval status visible before any mutation so users know exactly where work will be saved.

### Core operating flow

`Select client → open/create campaign → sync or choose media → inspect live stats and competitive evidence → create in Creative Studio → review/approve → prepare post → explicitly confirm publication`

## Execution contract

1. Resolve the active user, acting staff identity, active workspace and target client before suggesting an action.
2. Resolve a typed capability from a server-owned registry. The model may choose among offered capabilities but cannot invent an endpoint or table write.
3. Validate inputs and authorization again on the server using the same functions/RLS as the normal UI.
4. Show a human-readable preview for consequential actions.
5. Require explicit confirmation before sending, publishing, charging, sharing externally or initiating a signature request.
6. Return a durable receipt with links to the affected WaveOS records and record the mutation in the activity log.
7. On partial failure, report exactly what was and was not changed; do not silently retry a consequential external action.

## Current-state gap confirmed November 9, 2026

- `/my-agent` is absent from the current Sales and Media Manager route allowlists.
- The route is gated by `can_use_ai_tools`, so access is not currently universal.
- Current direct mutations are limited mainly to campaign plans and social post drafts.
- Current tools cover performance, Creative Studio, trends, competitive research, SEO, media and publishing navigation.
- The advisor prompt explicitly keeps suggestions review-only and says never to claim an action completed.
- No My Agent capability currently creates clients, invoices, deliveries, contracts or SignWell drafts.

These gaps mean the requested operating-assistant behavior must be implemented and tested; it is not accurate to present it as working today.

## Shared long-running status

Long-running AI work uses one circular surfer-wave indicator across My Agent, Campaign Manager, Creative Studio and Competitive Intelligence. It exposes an accessible status message, respects reduced-motion preferences and never implies completion before the underlying action returns.
