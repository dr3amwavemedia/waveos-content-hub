import { useState } from "react";

import { RangeSelector } from "./social-performance-panel";
import { formatFreshness, MetricValue, RollupTile } from "./metric-value";
import { useSocialPerformance } from "./use-social-performance";
import type { SocialAnalyticsRangeDays } from "@/lib/social-metrics-contract";
import { livePlatformLabel } from "@/lib/live-posts";

/**
 * Campaign results from the shared stored selector. Only copies linked to this
 * campaign's WaveOS posts (content metadata campaignPlanId + publish history)
 * are included; each platform copy is counted once.
 */
export function CampaignPerformancePanel({ workspaceId, campaignPlanId, campaignName, compact = false }: { workspaceId: string | null; campaignPlanId: string | null; campaignName?: string | null; compact?: boolean }) {
  const [days, setDays] = useState<SocialAnalyticsRangeDays>(90);
  const perf = useSocialPerformance({ workspaceId, days, campaignPlanId, enabled: Boolean(campaignPlanId) });
  if (!campaignPlanId) return null;
  const p = perf.data?.current;
  return (
    <section aria-label="Campaign performance" className="rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Campaign performance{campaignName ? ` · ${campaignName}` : ""}</h2>
          <p className="text-xs text-muted-foreground">Posts, Stories and Reels published from this campaign. Each platform copy counts once.</p>
        </div>
        <RangeSelector value={days} onChange={setDays} />
      </div>
      {perf.isPending && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {p && !p.hasStoredData && (
        <p className="mt-3 text-sm text-muted-foreground">
          No published copies from this campaign have stored provider numbers in this period yet. Results appear after its posts publish and Published Posts syncs.
        </p>
      )}
      {p && p.hasStoredData && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            {p.period.start} – {p.period.end} · {p.copyCount} copies · last sync {formatFreshness(p.freshestCapture)}
          </p>
          <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2 md:grid-cols-4"}>
            <RollupTile label="Reach" rollup={p.metrics.reach!} />
            <RollupTile label="Views" rollup={p.metrics.views!} />
            <RollupTile label="Link clicks" rollup={p.leadActions.clicks} />
            <RollupTile label="DM / message starts" rollup={p.leadActions.messages} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Engagement</p>
              <MetricValue value={p.engagement.value} availability={p.engagement.availability} />
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Lead actions (interactions)</p>
              <MetricValue value={p.leadActions.combined} availability={p.leadActions.clicks.availability} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{p.leadActions.note} Confirmed leads in this period (workspace-wide): {p.confirmedLeads.count}.</p>
          {p.best.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Best-performing by {p.rankingMetric}</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {p.best.map((c) => (
                  <li key={c.copyKey} className="flex justify-between gap-2"><span>{livePlatformLabel(c.platform)} {c.contentType} · {c.publishedOn}</span><span>{c.metrics[p.rankingMetric!]?.value?.toLocaleString()}</span></li>
                ))}
              </ul>
            </div>
          )}
          {p.needsAttention.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Needs attention</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {p.needsAttention.map((c) => (
                  <li key={c.copyKey} className="flex justify-between gap-2"><span>{livePlatformLabel(c.platform)} {c.contentType} · {c.publishedOn}</span><span>{c.metrics[p.rankingMetric!]?.value?.toLocaleString()}</span></li>
                ))}
              </ul>
            </div>
          )}
          {p.recommendations.length ? (
            p.recommendations.map((r) => <p key={r} className="rounded-xl border border-border/70 p-3 text-sm">{r}</p>)
          ) : (
            <p className="text-sm text-muted-foreground">No recommendation yet: {p.evidenceGaps.join(" ")}</p>
          )}
        </div>
      )}
    </section>
  );
}
