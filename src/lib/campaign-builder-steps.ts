/**
 * Pure rules for the five-step Campaign Manager builder
 * (Goal → Media → Analyze → Plan → Launch). UI-only state; nothing here saves.
 */

export const CAMPAIGN_BUILDER_STEPS = ["Goal", "Media", "Analyze", "Plan", "Launch"] as const;

export interface CampaignBuilderState {
  name: string;
  platformCount: number;
  formatCount: number;
  selectedMediaCount: number;
  /** Number of AI recommendations returned by a real analysis run (0 when not analyzed). */
  recommendationCount: number;
  confirmedCount: number;
  planSlotCount: number;
  saved: boolean;
}

export function campaignGoalReady(state: CampaignBuilderState) {
  return Boolean(state.name.trim()) && state.platformCount > 0 && state.formatCount > 0;
}

/** Per-step completion, in CAMPAIGN_BUILDER_STEPS order. */
export function campaignStepCompletion(state: CampaignBuilderState): boolean[] {
  const analyzed = state.recommendationCount > 0;
  return [
    campaignGoalReady(state),
    state.selectedMediaCount > 0,
    analyzed && state.confirmedCount >= state.recommendationCount,
    state.planSlotCount > 0,
    state.saved,
  ];
}

/**
 * Why the campaign cannot be saved for review yet, or null when it can.
 * Analysis is optional, but once it has run every asset must be confirmed so
 * unreviewed AI understanding never reaches saved drafts.
 */
export function campaignLaunchBlocker(state: CampaignBuilderState): string | null {
  if (!state.name.trim()) return "Name the campaign in the Goal step.";
  if (state.platformCount === 0) return "Choose at least one platform in the Goal step.";
  if (state.formatCount === 0) return "Choose feed, story, or both in the Goal step.";
  if (state.selectedMediaCount === 0) return "Choose campaign content before saving.";
  if (state.recommendationCount > 0 && state.confirmedCount < state.recommendationCount) {
    return "Confirm or correct what WaveOS understood about every asset first.";
  }
  return null;
}

/**
 * Post order for the campaign: the edited recommendation sequence first, then
 * any selected media the analysis did not cover, without duplicates.
 */
export function orderCampaignMedia(selectedIds: string[], sequenceIds: string[] | null) {
  const selected = new Set(selectedIds);
  const ordered: string[] = [];
  for (const id of sequenceIds ?? []) {
    if (selected.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  for (const id of selectedIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

export function moveListItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}
