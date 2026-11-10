export type CampaignIntent = "create_new" | "review_existing" | null;

/**
 * Campaign requests must distinguish a new record from work on an existing one.
 * Revision language wins even when the user says "make it better".
 */
export function campaignIntent(input: string): CampaignIntent {
  const normalized = input.toLowerCase().replace(/\s+/g, " ").trim();
  if (!/\bcampaigns?\b/.test(normalized)) return null;

  const existingReference =
    /\b(?:previous|last|latest|current|existing|saved|active|old|earlier|that|this|my)\s+campaign\b/.test(
      normalized,
    ) || /\bcampaign\s+(?:i|we)\s+(?:made|created|saved|started|worked on)\b/.test(normalized);
  const revisionRequest =
    /\b(?:check|review|audit|inspect|fix|repair|improve|update|edit|change|revise|continue|resume|finish|optimi[sz]e|diagnose|what(?:'s| is) wrong)\b/.test(
      normalized,
    );

  if (existingReference || revisionRequest) return "review_existing";

  const explicitNew =
    /\b(?:create|build|start|make|plan|draft)\s+(?:(?:me|us)\s+)?(?:(?:a|an|another|new)\s+)?(?:social\s+media\s+)?campaign\b/.test(
      normalized,
    ) || /\b(?:new|another)\s+campaign\b/.test(normalized);
  return explicitNew ? "create_new" : null;
}
