import type { AnalyticsAvailability } from "@/lib/analytics-transparency";
import { availabilityText } from "@/lib/social-performance";
import type { SocialMetricRollup } from "@/lib/social-metrics-rollup";
import { cn } from "@/lib/utils";

export const METRIC_LABELS: Record<string, string> = {
  views: "Views",
  reach: "Reach",
  impressions: "Impressions",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  clicks: "Link clicks",
  messages: "DM / message starts",
  storyViews: "Story views",
};

export function formatFreshness(iso: string | null) {
  if (!iso) return "never synced";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** A value, or the exact reason it is missing. Missing is never rendered as 0. */
export function MetricValue({ value, availability, className }: { value: number | null; availability: AnalyticsAvailability; className?: string }) {
  if (value === null)
    return <span className={cn("text-sm font-medium text-muted-foreground", className)}>{availabilityText(availability)}</span>;
  return <span className={cn("text-xl font-semibold tabular-nums text-foreground", className)}>{value.toLocaleString()}</span>;
}

export function RollupTile({ label, rollup }: { label: string; rollup: SocialMetricRollup }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <MetricValue value={rollup.value} availability={rollup.availability} className="mt-1 block" />
      {rollup.value !== null && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {rollup.coverage === "complete" ? "Complete" : "Partial"} · {rollup.contributingCopies}/{rollup.expectedCopies} copies
        </p>
      )}
    </div>
  );
}
