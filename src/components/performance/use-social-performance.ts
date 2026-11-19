import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getSocialPerformance } from "@/lib/social-performance.functions";
import type { SocialAnalyticsRangeDays, SocialContentType } from "@/lib/social-metrics-contract";

export type PerformanceQuery = {
  workspaceId: string | null | undefined;
  days: SocialAnalyticsRangeDays;
  platform?: string | null;
  accountId?: string | null;
  contentType?: SocialContentType | "stories_reels" | null;
  campaignPlanId?: string | null;
  enabled?: boolean;
};

/** Shared hook over the one stored-observation selector. */
export function useSocialPerformance(q: PerformanceQuery) {
  const fn = useServerFn(getSocialPerformance);
  return useQuery({
    queryKey: ["social-performance", q.workspaceId, q.days, q.platform ?? null, q.accountId ?? null, q.contentType ?? null, q.campaignPlanId ?? null],
    enabled: Boolean(q.workspaceId) && q.enabled !== false,
    staleTime: 60_000,
    queryFn: () =>
      fn({
        data: {
          workspaceId: q.workspaceId!,
          days: q.days,
          platform: q.platform ?? null,
          accountId: q.accountId ?? null,
          contentType: q.contentType ?? null,
          campaignPlanId: q.campaignPlanId ?? null,
        },
      }),
  });
}
