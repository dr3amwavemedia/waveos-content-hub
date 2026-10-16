# WaveOS — mobile editing and trustworthy intelligence

## Outcome
Complete the uploaded brief in Preview: natural touch editing, clear growth analytics, and one-link competitor research. Build on the current GitHub implementation rather than replacing working features.

## 1. Creative Studio
- Focused phone editor with back, undo, redo and Done; hide normal bottom navigation only while editing and restore it on exit.
- Contextual tools for images, text, shapes and logos, with compact sheets for secondary controls.
- Direct selection, drag, proportional corner resize, pinch resize and twist rotation; pinch with nothing selected changes only workspace zoom.
- Temporary snapping guides; double-tap crop/reposition mode with ratio previews and touch positioning.
- Keep selections and guides out of exported artwork; verify gesture targeting and one undo entry per completed interaction.
- Visual media picker, replacement picker, templates, layers, brand assets, saved designs and recent media.
- Touch-friendly adjustments, visual Looks previews, fit/fill/background controls, and reviewable Auto and Brand Look suggestions. Never label a preset or heuristic as AI analysis.

## 2. Analytics
- Growth-first layout with one main interactive graph, swipeable KPI cards, sourced top-content thumbnails and platform/content breakdowns.
- Display previous-period comparisons and trends only where real historical data exists; preserve missing-data and provider coverage states.
- Evidence-backed insights and next actions, with optional handoff into content creation.
- Competitive benchmarks and brand consistency appear only when comparable evidence or a defensible evaluation is available; otherwise show clear availability states, not invented scores.

## 3. Competitive Intelligence
- Preserve the one website/social-profile input and the optional existing manual comparison form.
- Ground research in publicly accessible sources; follow official linked profiles when accessible and mark missing or blocked information honestly.
- Present overview, messaging, social strategy, website/SEO signals, strengths, gaps, workspace comparison, opportunities and original content ideas with source evidence.
- Preserve edit, refresh and compare actions and saved reports; add a qualitative landscape for 2–5 competitors without fake numeric precision.
- Let users carry supported ideas into content creation without saving or publishing automatically.

## Safety boundaries
- No production publishing, migrations, emails, charges, signatures or live-record edits during implementation and verification.
- Preserve accounts, workspaces, permissions, connections, designs, drafts, reports and all financial workflows.
- Keep existing desktop functionality and recently approved navigation and Overview designs.
- Any required external research connection will use its normal connection approval; unavailable research stays explicitly unavailable.

## Technical approach
- Reuse the existing canvas model, undo history, queries, mutations and permission checks across devices.
- Keep mobile focus and panels presentation-only; separate gesture calculations and evidence calculations into small tested helpers.
- Reuse authenticated server functions for AI and research, retaining workspace isolation and server-only credentials.
- Reuse existing report storage where compatible; report a genuine schema blocker rather than applying an unapproved migration.
- Preserve dependency versions and keep package manifests and lockfiles aligned if a required package is added.

## Verification
- Check authenticated phone, small-tablet and desktop experiences using temporary editor state, without saving live records.
- Test gestures, crop, undo/redo, focused navigation restoration, unavailable analytics and research failures.
- Run relevant unit and existing quality tests; rely on the platform's automatic type/build checks and report failures explicitly.
- Check clean-install compatibility without disrupting the running preview.
- Report completed requirements and any blocked capabilities before calling the phase finished.
