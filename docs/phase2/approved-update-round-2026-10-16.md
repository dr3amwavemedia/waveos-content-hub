# WaveOS approved update round — October 16, 2026

This file is the implementation source of truth for product changes approved after the prior Creative Studio / Analytics / Competitive Intelligence Lovable prompt.

## Guardrails

- Preserve existing users, workspaces, permissions, client assignments, media, drafts, invoices, contracts, payments, social connections, scheduling, publishing, approvals, and Supabase records.
- Prefer progressive UI changes over destructive schema or workflow replacements.
- Mobile first. Keep desktop capable without turning mobile screens into long forms.
- Do not fabricate AI/public research results. Missing public facts are optional, omitted, or explicitly shown as not found.
- Do not require a business owner to re-enter information WaveOS already has or can responsibly derive.

## 1. Create Post — approved mobile design

Use the approved expanded Create Post design while keeping the main composer organized and touch-friendly.

### Main Create Post
- Content/media preview is the hero.
- Content actions: **Edit**, **Design**, **+ Add Media**.
- Keep Caption, Platforms, Schedule, and Advanced Options as organized sections/accordions.
- Permanent primary actions: **Save Draft** and **Create & Publish**.
- Preserve all existing save, approval, schedule, publish, account-selection, provider, and per-platform variant behavior.

### Edit Media
Edit is for fast post-level media changes. It should expose appropriate tools such as:
- Auto Enhance
- Crop
- Adjust
- Looks
- Trim (video)
- Stabilize (when supported)
- Remove Background (when supported)
- Replace
- Format
- Speed (video)
- Volume (video)
- Extract Frame (video)
- AI Upscale / Color Match only when a real implementation is available
- More

Never show a control that silently does nothing. Unsupported operations must be hidden or clearly unavailable.

### Design
- **Design opens Creative Studio** with the selected post media already loaded.
- Templates, Brand, Text, Shapes, Layers, and deeper design controls belong in Creative Studio rather than cluttering Create Post.
- Creative Studio **Done** returns to the same Create Post draft with the resulting design/media attached.

### AI Assistant
Keep AI caption help easy to reach:
- Generate Caption
- Rewrite / Improve
- Shorten
- Add Hashtags
- Brand Voice
Preserve existing Brand Voice and platform adaptation logic.

### Platform Settings
Selecting a platform opens its detailed settings rather than placing every option on the main composer.
Examples where supported by the publishing provider:
- platform-specific caption
- post/content type
- aspect ratio
- account/destination
- tags/people
- location
- audience
- feed/story/remix-type platform options
Do not invent provider capabilities.

## 2. Quick Contract + Invoice

Add a fast contract workflow in **Documents** and under the appropriate **Client**.

Purpose: hourly work, a-la-carte services, and small deliverable jobs should not require a large custom contract workflow.

### New Contract
Offer:
- **Quick Contract**
- **Custom / Full Contract**

Quick Contract can start from:
- Existing Invoice
- A-la-carte Services
- Blank

### Invoice as the scope of work
When an invoice is selected, reuse its existing data instead of asking for it again:
- client / business
- invoice number
- service line items
- descriptions / deliverables
- quantity or hours
- pricing
- discounts
- total
- deposit/payment terms
- due date

The invoice/service line items become the agreement's **Services & Deliverables / Scope of Work** and should be visibly readable in the agreement.

Use one source of truth so invoice items and contract scope do not drift.

### Signed snapshot protection
- Before signing, authorized edits can update the linked scope.
- Once signed/executed, freeze the agreement's scope/value snapshot.
- Later scope changes must not silently rewrite the executed agreement.
- Prompt for a revised agreement or change order where appropriate.
- Preserve existing audit/privacy/client isolation behavior.

### Standard small-job terms
WaveOS may use a reusable DWM small-job agreement template covering the standard operational topics configured by DWM (scope, payment, cancellation/rescheduling, revisions, turnaround, client delays, creative discretion, raw files when applicable, permissions/releases, access/weather/venue constraints, technical contingencies, usage/license, portfolio permission setting, late/non-payment, e-signature, etc.).

The product must not describe a template as guaranteed legal protection. DWM should have production legal language reviewed by qualified counsel.

### Client flow
Aim for:
**Review services + price → review agreement → sign → pay required deposit/payment**

Under the client, show the relationship between:
**Contract → Invoice → Payment → Deliverables**

Do not duplicate existing invoice/payment records.

## 3. Competitive Intelligence — remove the second manual-entry wall

The current post-analysis/report workflow still exposes a large **Competitor record** form asking users to enter information again.

This violates the approved one-input principle.

### Required flow
**Paste website/social profile → Analyze Competitor → WaveOS researches available public information → analysis/report is populated → Save/Generate Report**

After analysis, do **not** require the user to re-enter:
- competitor name
- website
- public profile/observation links
- public metrics
- source/unit/date fields that WaveOS already collected
- other data already present in the analysis

### Report behavior
Automatically carry verified/retrieved analysis data into the report/document.

Potential sections when supported by evidence:
- Competitor Overview
- Brand & Messaging
- Services / visible offers
- Social Strategy
- Website & SEO
- Strengths
- Weaknesses / Gaps
- Comparison to the user's WaveOS Brand Profile
- Opportunities
- Original content ideas based on gaps/trends

Missing information should be omitted or labeled **Not found**. It must not become a blocking required field.

Keep **Add details manually** as an optional secondary action only.

Public research provenance/source transparency must remain available.

## 4. Creative Studio — editing controls must actually work

The existence of a button/control is not completion.

Brightness/exposure, contrast, saturation and every shipped adjustment must visibly change the selected asset on the canvas and persist correctly through the supported save/reload/export path.

Acceptance test for every editing control:
1. select an eligible object,
2. change the control,
3. canvas visibly changes,
4. save editable design/draft,
5. reload,
6. change persists,
7. exported result reflects the change.

Hide or disable controls that do not have a real implementation.

## 5. Creative Studio — Logo / Sticker / Brand Assets

Add a clear **Logo / Brand Assets** experience.

Workspace brand assets should be visual and easy to insert.

A logo is its own editable layer and should support, as appropriate:
- replace/upload
- drag/reposition
- resize/pinch
- rotate
- opacity
- duplicate
- layer ordering
- delete
- recolor only when the underlying asset format/implementation safely supports it

Do not bake a logo into a template background.

Brand Assets may also contain reusable approved graphics/icons/stickers. Keep them editable layers where technically possible.

## 6. WaveOS editable template library

The approved generated visual drafts are **design references**, not flattened final template behavior.

Templates must load as editable compositions/layers. Users need to be able to customize:
- text copy
- fonts
- font size/weight/alignment/spacing
- photos
- crop/reposition/zoom
- supported image adjustments
- icons
- icon color
- background/accent/shape/text colors
- logos
- layout/position/size/rotation
- layer order

### Apply My Brand
Provide a simple brand application action that uses the workspace Brand Profile to substitute the user's:
- primary/secondary logo
- brand colors
- available brand fonts

Preserve the template's intended composition as much as possible.

## 7. Approved template direction

Avoid a library dominated by generic button-heavy/tappable marketing graphics.

The desired aesthetic is more personal and business-owned:
- real photography is the hero
- organic/cinematic/editorial
- clean readable type
- tasteful handwritten/script accents where appropriate
- minimal overlays
- authentic behind-the-scenes / service / team / customer imagery
- graphics should feel like **this is my business**, not a generic ad-builder UI

Approved starter categories/styles include:
- testimonial / quote (keep this direction)
- organic brand story
- behind the scenes
- process/workflow
- blue-collar/trades
- beauty/wellness/female-led business
- service highlight
- booking/availability
- open-hours / come-in-today Story
- minimal text-over-photo Story

Include a range of font personalities:
- modern sans
- editorial serif
- handwritten/script accent
- bold condensed/display where suitable
- minimalist light sans

Templates should use replaceable font roles rather than hard-coding a single aesthetic.

## 8. Template sizes / responsive design formats

Creative Studio should support template variants for common social formats, including at minimum:
- **Story / Reel vertical 9:16**
- **Square 1:1**
- **Portrait feed 4:5**
- existing supported landscape formats where appropriate

A template may have curated layouts per aspect ratio. Do not merely stretch a finished bitmap.

When adapting between sizes, preserve editable layers and keep important text/logo content inside safe, readable areas.

## 9. Minimal Story templates

Add templates intended primarily for simple, attractive text placement over a business photo.

Examples of the use case (copy is editable/optional):
- Come on in today
- We're open 7–7
- Book today
- Appointments available
- Come by today

These should feel more designed than native/basic Instagram text while remaining fast to customize.

Text in starter templates is placeholder content and must always be editable/removable.

## Definition of done

This update round is complete only when:
- Create Post remains fully functional underneath the redesigned organization.
- Quick Contract can reuse invoice/a-la-carte data without duplicate entry.
- Competitive Intelligence no longer forces a second manual form after automated analysis.
- Creative Studio adjustments visibly work and persist.
- logos/brand assets are editable layers.
- starter templates are editable, brandable compositions rather than flat images.
- vertical and square template experiences are usable on mobile.
- no existing workspace/client/social/payment data is migrated destructively or lost.
