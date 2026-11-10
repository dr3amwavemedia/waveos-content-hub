export type CampaignReadinessState = "ready" | "limited" | "action_needed" | "admin_required";

export type CampaignReadinessCheck = {
  key: string;
  label: string;
  state: CampaignReadinessState;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
  lastSuccessAt?: string | null;
};

export function buildCampaignReadiness(input: {
  workspaceReady: boolean;
  brandProfileReady: boolean;
  connectedPlatforms: number;
  reconnectPlatforms: number;
  analyticsState: string | null;
  analyticsLastSuccessAt: string | null;
  selectedMediaCount: number;
  readableMediaCount: number;
  transcriptReadyCount: number;
  folderSelected: boolean;
  folderListingComplete: boolean;
}) {
  const analyticsFresh = input.analyticsLastSuccessAt
    ? Date.now() - new Date(input.analyticsLastSuccessAt).getTime() <= 14 * 86_400_000
    : false;
  const checks: CampaignReadinessCheck[] = [
    {
      key: "workspace",
      label: "Workspace and access",
      state: input.workspaceReady ? "ready" : "admin_required",
      detail: input.workspaceReady
        ? "The active workspace and Campaign Manager access are verified."
        : "Workspace access needs administrator review.",
      actionLabel: input.workspaceReady ? undefined : "Contact admin",
    },
    {
      key: "brand",
      label: "Brand Voice",
      state: input.brandProfileReady ? "ready" : "action_needed",
      detail: input.brandProfileReady
        ? "Saved brand context is available for campaign direction and captions."
        : "Finish Brand Voice so recommendations match the business.",
      actionLabel: input.brandProfileReady ? undefined : "Finish Brand Voice",
      actionHref: input.brandProfileReady ? undefined : "/brand-voice",
    },
    {
      key: "social",
      label: "Social platforms",
      state:
        input.reconnectPlatforms > 0
          ? "action_needed"
          : input.connectedPlatforms > 0
            ? "ready"
            : "limited",
      detail:
        input.reconnectPlatforms > 0
          ? `${input.reconnectPlatforms} connection${input.reconnectPlatforms === 1 ? "" : "s"} need attention.`
          : input.connectedPlatforms > 0
            ? `${input.connectedPlatforms} active connection${input.connectedPlatforms === 1 ? "" : "s"} verified.`
            : "Draft planning can continue, but no publishing connection is verified.",
      actionLabel:
        input.reconnectPlatforms > 0 || input.connectedPlatforms === 0
          ? "Review connections"
          : undefined,
      actionHref:
        input.reconnectPlatforms > 0 || input.connectedPlatforms === 0
          ? "/social-accounts"
          : undefined,
    },
    {
      key: "analytics",
      label: "Performance evidence",
      state:
        input.analyticsState === "ready" && analyticsFresh
          ? "ready"
          : input.analyticsState === "error"
            ? "action_needed"
            : "limited",
      detail:
        input.analyticsState === "ready" && analyticsFresh
          ? "Recent compatible analytics are available."
          : input.analyticsLastSuccessAt
            ? "Analytics are available but may be stale; WaveOS will label recommendations accordingly."
            : "No compatible analytics history is available; planning will use brand and media evidence.",
      actionLabel: input.analyticsState === "error" ? "Fix with My Agent" : "Open analytics",
      actionHref: input.analyticsState === "error" ? "/my-agent?fix=analytics" : "/analytics",
      lastSuccessAt: input.analyticsLastSuccessAt,
    },
    {
      key: "media",
      label: "Selected media",
      state:
        input.selectedMediaCount === 0
          ? "action_needed"
          : input.readableMediaCount === input.selectedMediaCount
            ? "ready"
            : "limited",
      detail:
        input.selectedMediaCount === 0
          ? "Choose at least one asset before analysis."
          : `${input.readableMediaCount}/${input.selectedMediaCount} selected assets are currently readable.`,
    },
    {
      key: "understanding",
      label: "Media understanding",
      state:
        input.transcriptReadyCount > 0
          ? "ready"
          : input.selectedMediaCount > 0
            ? "limited"
            : "action_needed",
      detail:
        input.transcriptReadyCount > 0
          ? `${input.transcriptReadyCount} selected clip${input.transcriptReadyCount === 1 ? " has" : "s have"} transcript evidence.`
          : "WaveOS will use filenames, tags, and verified visual evidence; no transcript evidence is ready.",
      actionLabel:
        input.selectedMediaCount > 0 && input.transcriptReadyCount === 0
          ? "Transcribe selected clips"
          : undefined,
    },
    {
      key: "folder",
      label: "Folder coverage",
      state: !input.folderSelected ? "limited" : input.folderListingComplete ? "ready" : "limited",
      detail: !input.folderSelected
        ? "No folder is selected; only explicitly selected assets will be used."
        : input.folderListingComplete
          ? "The selected WaveOS folder listing is complete."
          : "Folder coverage is partial or still loading and will not be described as complete.",
    },
    {
      key: "ai",
      label: "AI service",
      state: "ready",
      detail: "Campaign generation is available and remains review-first.",
    },
  ];
  return {
    checks,
    ready: checks.filter((check) => check.state === "ready").length,
    limited: checks.filter((check) => check.state === "limited").length,
    blocked: checks.some(
      (check) => check.state === "action_needed" || check.state === "admin_required",
    ),
  };
}
