import type { SocialAnalyticsRangeDays } from "./social-metrics-contract.ts";

export type PostPerformanceRequest = {
  days: SocialAnalyticsRangeDays | null;
  platform: string | null;
  contentType: "stories_reels" | "story" | "reel" | null;
  focus: "best" | "weakest" | "clicks" | "messages" | "leads" | "campaign" | null;
  improvedDraft: boolean;
};

const PLATFORMS: [RegExp, string][] = [
  [/\binstagram|\big\b/, "instagram"],
  [/\bfacebook|\bfb\b/, "facebook"],
  [/\btiktok/, "tiktok"],
  [/\byoutube/, "youtube"],
  [/\blinkedin/, "linkedin"],
  [/\bthreads\b/, "threads"],
  [/\btwitter|\bx\b/, "twitter"],
];

/** Reads range/platform/focus from a performance follow-up; null means "keep current". */
export function parsePostPerformanceRequest(input: string): PostPerformanceRequest {
  const t = input.toLowerCase();
  const days: SocialAnalyticsRangeDays | null = /\b(7|seven)[- ]days?\b|\bweek\b/.test(t)
    ? 7
    : /\b(90|ninety)[- ]days?\b|\bquarter\b|\b3 months\b|\bthree months\b/.test(t)
      ? 90
      : /\b180[- ]days?\b|\b6 months\b|\bsix months\b|\bhalf[- ]year\b/.test(t)
        ? 180
        : /\b365[- ]days?\b|\b12 months\b|\byear\b/.test(t)
          ? 365
          : /\b30[- ]days?\b|\bmonth\b/.test(t)
            ? 30
            : null;
  const platform = PLATFORMS.find(([re]) => re.test(t))?.[1] ?? null;
  const contentType = /stor(y|ies)/.test(t) && /reels?/.test(t) ? "stories_reels" : /stor(y|ies)/.test(t) ? "story" : /reels?/.test(t) ? "reel" : null;
  const focus = /\b(best|top|strongest|highest)\b/.test(t)
    ? "best"
    : /\b(worst|weakest|lowest|underperform|poorest)\b/.test(t)
      ? "weakest"
      : /\bclicks?\b/.test(t)
        ? "clicks"
        : /\b(dms?|messages?|message starts)\b/.test(t)
          ? "messages"
          : /\bleads?\b/.test(t)
            ? "leads"
            : /\bcampaign\b/.test(t)
              ? "campaign"
              : null;
  const improvedDraft = /\b(improved|better|new)\s+(draft|version|post)\b|\bcreate (an? )?improved\b/.test(t);
  return { days, platform, contentType, focus, improvedDraft };
}

export function isPostPerformanceQuestion(input: string) {
  const t = input.toLowerCase();
  return /\b(best|worst|weakest|top|lowest)\s+(posts?|reels?|stories|content)\b|\b(clicks?|dms?|message starts|leads?)\b.*\b(post|posts|get|got|did|from|this|last)\b|\bhow did (my )?(posts?|reels?|stories)\b/.test(t);
}
