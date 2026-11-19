import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { formatFreshness, MetricValue } from "./metric-value";
import { useSocialPerformance } from "./use-social-performance";

/**
 * Overview tile over the same stored selector as Analytics. Layout is chosen by
 * the host: Ocean Intelligence on web, the command center on phones.
 */
export function OverviewPerformanceSummary({ workspaceId, variant }: { workspaceId: string | null; variant: "ocean" | "mobile" }) {
  const perf = useSocialPerformance({ workspaceId, days: 30 });
  const p = perf.data?.current;
  if (!workspaceId || perf.isError) return null;
  const items = p
    ? [
        { label: "Reach", r: p.metrics.reach! },
        { label: "Views", r: p.metrics.views! },
        { label: "Lead actions", r: { ...p.leadActions.clicks, value: p.leadActions.combined } },
      ]
    : [];
  return (
    <section
      aria-label="Last 30 days performance"
      className={cn(
        variant === "ocean" ? "rounded-2xl border border-cyan-200/15 bg-slate-950/30 p-4 backdrop-blur" : "space-y-2",
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className={variant === "mobile" ? "text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground" : "text-sm font-semibold"}>
          Post performance · 30 days
        </h2>
        <Link to="/analytics" className="text-xs font-semibold text-primary">Details</Link>
      </div>
      <div className={cn("mt-2 grid grid-cols-3 gap-2", variant === "mobile" && "rounded-2xl border border-border bg-card p-3")}>
        {perf.isPending && <p className="col-span-3 text-sm opacity-70">Loading…</p>}
        {items.map(({ label, r }) => (
          <div key={label} className="min-w-0">
            <p className="text-[11px] opacity-70">{label}</p>
            <MetricValue value={r.value} availability={r.availability} className="text-base" />
          </div>
        ))}
      </div>
      {p && (
        <p className="mt-2 text-[11px] opacity-70">
          {p.hasStoredData ? `${p.copyCount} copies · last sync ${formatFreshness(p.freshestCapture)} · lead actions are interactions, not people` : "No stored post history yet."}
        </p>
      )}
    </section>
  );
}
