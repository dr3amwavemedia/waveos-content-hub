# Guided content decision support

## Product intent

Campaign Manager and My Agent should help a user decide what content is most likely to serve the user's stated goal. They are feedback-driven creative strategy tools—not isolated generation buttons, unexplained rankings or screens filled with every possible input and output at once.

The experience should feel like a strong strategist saying: **“Based on what WaveOS can verify, start with this content for this reason. Here is the next useful step.”**

## Core interaction

### 1. Understand the decision

Use saved workspace context first. Ask a follow-up only when the answer would materially change the recommendation. Typical decision inputs are:

- campaign goal;
- target audience or client segment;
- offer, service, event or message;
- target platform and feed/story/reel format;
- timing or campaign constraint;
- available media and approval requirements.

Ask one focused question at a time and preserve the answer. Do not make users repeat details already stored in Brand Voice, the campaign draft, selected client or recent conversation.

### 2. Recommend, do not overwhelm

The first response should contain:

- **Best next move** — one recommended asset, concept or action;
- **Why this fits** — one or two concise reasons tied to the goal, audience and platform;
- **Evidence level** — visual/transcript evidence, saved user correction, performance evidence or metadata-only inference;
- **Next action** — use it, create the draft, compare alternatives or answer one missing question.

Then show no more than a small ranked group of alternatives. Detailed analytics, methodology, all source signals, full caption variants and expert controls remain available through **Why?**, **Compare**, or expandable details.

### 3. Make every recommendation actionable

Each recommended content card should show:

- asset preview and title;
- recommended campaign role or content pillar;
- suggested hook and format/platform;
- concise reason and meaningful confidence;
- evidence used and important missing evidence;
- **Use this**, **Show another**, **Why?**, **Wrong interpretation** and **Edit understanding** actions.

Accepting an item carries its context into the campaign sequence, caption generation and reviewable post draft. It never schedules or publishes automatically.

## Ranking approach

Rank only from authorized workspace information. Consider:

1. user-stated goal and constraints;
2. explicit user corrections;
3. verified media pixels/frames and transcripts;
4. filename/title, tags, format, duration and saved media understanding;
5. Brand Voice and audience fit;
6. compatible first-party performance evidence;
7. variety across the full campaign so the plan does not repeat one angle.

The ranking output should be explainable and should not imply guaranteed performance. When evidence is insufficient or several options are effectively tied, say so and explain the tradeoff rather than inventing a precise winner.

## Feedback loop

Feedback is part of the primary workflow, not a separate survey.

- **Use this** confirms the recommendation for the current plan.
- **Show another** keeps the goal but requests a different viable direction.
- **Not relevant** removes the suggestion from the current decision and optionally asks for a short reason.
- **Wrong interpretation** marks the AI's description as incorrect.
- **Edit understanding** lets the user supply the correct content type, subject, purpose or transcript clarification.

Explicit corrections update the current recommendation immediately and may be saved as private workspace media intelligence. WaveOS must record that the information came from the user and treat it as more authoritative than older AI inference. Feedback and corrections never cross workspace or client boundaries.

## Shared behavior between My Agent and Campaign Manager

- Both tools read the same campaign draft, selected assets, Brand Voice, readiness state, corrections and evidence labels.
- A recommendation accepted in My Agent appears in Campaign Manager without rebuilding the campaign from scratch.
- A correction made in Campaign Manager is available to My Agent in the same workspace.
- Both tools should explain the same underlying recommendation consistently; differences caused by a changed goal or new evidence should be stated.
- My Agent may guide the user conversationally while Campaign Manager provides the structured plan and expert controls.

## Information design

- One primary action per state.
- Short summary first; details on demand.
- No large methodology wall before the recommendation.
- No unexplained score, confidence badge or “AI selected” label.
- Use defaults based on verified context, but keep them editable.
- Show progress only for work actually occurring.
- Keep errors beside the affected source or item with a clear recovery action.
- Preserve expert options for marketers in expandable sections rather than removing them.

## Current-state gap confirmed November 9, 2026

- Campaign Manager exposes useful analysis, media understanding, transcripts, recommendations, planning controls and caption tools, but the experience can present many steps and detailed controls before giving the user one clear recommendation.
- The main AI actions are still centered around **Analyze & Build Campaign** and caption-generation buttons rather than a continuous decision-and-feedback loop.
- User corrections exist for media understanding, but the cross-tool experience and recommendation feedback controls are not yet unified with My Agent.
- My Agent can advise or navigate to tools, but it does not yet share a complete accepted-recommendation state with Campaign Manager.

## Acceptance criteria

- A first-time user can identify the recommended content, the reason and the next action without opening expert details.
- A marketer can inspect the evidence, compare alternatives and edit advanced controls without losing the guided recommendation.
- Wrong-interpretation feedback changes the current result and persists as user-authored workspace context.
- My Agent and Campaign Manager show the same accepted assets, campaign objective and corrections.
- Missing evidence produces a clear limitation or focused question, not a confident fabricated ranking.
- The interface remains concise and usable on phone and desktop.
- No feedback, media understanding, analytics or campaign state leaks between workspaces or clients.
- Accepted recommendations create drafts only; scheduling and publishing remain explicit review actions.
