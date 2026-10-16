import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BarChart3, CheckCircle2, Database, Loader2, Sparkles, Eye, Heart, Users, MousePointerClick, MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";

import {
  combineAnalyticsMetric,
  deriveEngagements,
  type AnalyticsAvailability,
  type AnalyticsMetricKey,
  type AnalyticsSource,
} from "@/lib/analytics-transparency";
import { getSocialIntelligenceProfile, getZernioAnalytics } from "@/lib/zernio.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type AnalyticsMode = "combined" | "organic" | "paid";

export type ObservedCount = {
  value: number | null;
  state: "loading" | "available" | "unavailable";
  unavailableReason?: string;
};

const STATUS_LABEL: Record<AnalyticsAvailability, string> = {
  available: "Available",
  true_zero: "Reported zero",
  not_synced: "Not synced",
  permission_missing: "Permission missing",
  connection_expired: "Connection expired",
  sync_failed: "Sync failed",
  unsupported: "Unsupported",
};

const METRICS: Array<{ key: AnalyticsMetricKey | "engagements"; label: string }> = [
  { key: "impressions", label: "Impressions" },
  { key: "engagements", label: "Engagements" },
  { key: "likes", label: "Likes" },
  { key: "reach", label: "Reach" },
  { key: "views", label: "Views" },
  { key: "comments", label: "Comments" },
  { key: "clicks", label: "Clicks" },
  { key: "followers", label: "Followers" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Not reported";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function observedValue(count: ObservedCount) {
  if (count.state === "loading") return "…";
  return count.state === "available" && count.value !== null
    ? count.value.toLocaleString()
    : "Unavailable";
}

function sourceStatusTone(state: AnalyticsAvailability) {
  if (state === "available" || state === "true_zero") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (state === "not_synced" || state === "unsupported") {
    return "border-border bg-elevated text-muted-foreground";
  }
  return "border-amber-400/30 bg-amber-400/10 text-amber-200";
}

export function AnalyticsCheckup({
  workspaceId,
  publishedPosts,
  connectedChannels,
}: {
  workspaceId: string;
  publishedPosts: ObservedCount;
  connectedChannels: ObservedCount;
}) {
  const analyticsFn = useServerFn(getZernioAnalytics);
  const intelligenceFn = useServerFn(getSocialIntelligenceProfile);
  const [mode, setMode] = useState<AnalyticsMode>("combined");
  const analytics = useQuery({
    queryKey: ["analytics-checkup", workspaceId, 30],
    queryFn: () => analyticsFn({ data: { workspaceId, days: 30 } }),
    retry: false,
  });
  const intelligence = useQuery({
    queryKey: ["social-intelligence", workspaceId],
    queryFn: () => intelligenceFn({ data: { workspaceId } }),
    retry: false,
  });

  const selectedSources = useMemo(() => {
    const sources = (analytics.data?.sources ?? []) as AnalyticsSource[];
    if (mode === "paid") return sources.filter((source) => source.key === "paid");
    if (mode === "organic") return sources.filter((source) => source.key !== "paid");
    return sources;
  }, [analytics.data?.sources, mode]);

  const metricRows = METRICS.map(({ key, label }) => {
    const metric =
      key === "engagements"
        ? deriveEngagements(selectedSources)
        : combineAnalyticsMetric(selectedSources, key);
    return { key, label, metric };
  });
  const strongest = metricRows
    .filter(
      (row): row is (typeof metricRows)[number] & { metric: { value: number } } =>
        row.metric.value !== null && row.metric.value > 0,
    )
    .sort((left, right) => right.metric.value - left.metric.value)[0];
  const providerError = analytics.error instanceof Error ? analytics.error.message : null;

  return (
    <div className="space-y-6">
      <section className="space-y-4 sm:rounded-2xl sm:border sm:border-border sm:bg-surface sm:p-6">
        <div className="grid min-w-0 gap-4 sm:flex sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <BarChart3 className="h-5 w-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Analytics checkup</p>
            </div>
            <h2 className="mt-2 hidden text-xl font-semibold text-foreground sm:block">
              Provider-reported performance
            </h2>
            <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
              Requested range: last 30 days. Missing or failed sources remain unavailable; WaveOS
              does not replace them with zero.
            </p>
          </div>
          <div className="grid grid-cols-3 rounded-xl border border-border bg-background/50 p-1">
            {(["combined", "organic", "paid"] as AnalyticsMode[]).map((value) => (
              <Button variant="ghost"
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "min-h-11 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize",
                  mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>

        {analytics.isPending && (
          <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading provider metrics…
          </div>
        )}
        {analytics.isError && (
          <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            <AlertTriangle className="mr-2 inline h-4 w-4" /> Metrics are unavailable. No values
            were substituted.
            {providerError === "forbidden"
              ? " This workspace does not grant analytics access."
              : " Try again after the provider connection is available."}
          </div>
        )}
        {!analytics.isPending && !analytics.isError && strongest && (
          <div className="mt-5 hidden rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success sm:block">
            <Sparkles className="mr-2 inline h-4 w-4" /> {strongest.label} is the largest reported
            value in this view at {strongest.metric.value.toLocaleString()}. This is a descriptive
            comparison, not a claim about what caused the result.
          </div>
        )}

        <div className="mt-5 sm:hidden">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Last 30 days</p>
            <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
              <CompactMetric label="Published" value={observedValue(publishedPosts)} />
              <CompactMetric label="Channels" value={observedValue(connectedChannels)} />
            </div>
            {metricRows.some(({ metric }) => metric.value === null) && !analytics.isPending && (
              <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                Some performance data hasn&apos;t synced yet. Missing values stay unavailable rather than becoming zero.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {metricRows.map(({ key, label, metric }, index) => {
                const Icon = key === "engagements" || key === "likes" ? Heart : key === "followers" || key === "reach" ? Users : key === "clicks" ? MousePointerClick : key === "comments" ? MessageCircle : Eye;
                return <article key={key} className={cn("min-w-0 rounded-xl border p-4", index % 2 ? "border-border-strong bg-gradient-to-br from-secondary to-surface" : "border-primary/25 bg-gradient-to-br from-primary/10 to-surface")}>
                  <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><Icon className="size-4 shrink-0 text-primary" /></div>
                  <p className="mt-3 break-words text-2xl font-semibold">{analytics.isPending ? "…" : metric.value === null ? "—" : metric.value.toLocaleString()}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">{metric.value === null ? "Not available" : metric.coverage === "partial" ? "Partial coverage" : "Provider reported"}</p>
                </article>;
              })}
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold">Source comparison</h3>
              {selectedSources.map((source) => { const value = source.metrics.impressions.value; const maximum = Math.max(1, ...selectedSources.map((item) => item.metrics.impressions.value ?? 0)); return <div key={source.key} className="mt-3"><div className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground">{source.label}</span><span>{value === null ? "Unavailable" : value.toLocaleString()}</span></div>{value !== null && <progress aria-label={`${source.label} impressions`} className="mt-2 h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-elevated [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" value={value} max={maximum} />}</div>; })}
              {!selectedSources.length && <p className="mt-2 text-xs text-muted-foreground">No source data available yet.</p>}
            </div>
            <p className="text-xs text-muted-foreground">Performance trends and top content are unavailable until the connected sources report them.</p>
          </div>
        </div>
        <div className="mt-5 hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Published posts" value={observedValue(publishedPosts)} hint={publishedPosts.state === "unavailable" ? publishedPosts.unavailableReason : undefined} />
          <MetricCard label="Connected channels" value={observedValue(connectedChannels)} hint={connectedChannels.state === "unavailable" ? connectedChannels.unavailableReason : undefined} />
          {metricRows.map(({ key, label, metric }) => (
            <MetricCard key={key} label={label} value={analytics.isPending ? "…" : metric.value === null ? "Unavailable" : metric.value.toLocaleString()} hint={metric.coverage === "partial" ? `Partial: ${metric.contributingSources}/${metric.expectedSources} source observations.` : metric.value === null ? STATUS_LABEL[metric.availability] : metric.availability === "true_zero" ? "Provider reported a true zero." : undefined} />
          ))}
        </div>

        <details className="mt-5 rounded-xl border border-border bg-background/35">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
            Why am I seeing this?
          </summary>
          <div className="space-y-3 border-t border-border p-4 text-xs text-muted-foreground">
            <p>
              Combined adds every available provider source; Organic uses published-content and
              connected-network sources; Paid uses only the paid-media source. Engagements equals
              reported likes plus reported comments (calculation version
              waveos-engagements-likes-plus-comments-v1).
            </p>
            <p>
              “Unavailable” means a value was not returned or could not be accessed. “Reported zero”
              appears only when the source returned a numeric zero. Partial totals identify how many
              expected source observations contributed.
            </p>
          </div>
        </details>
      </section>

      <details className="rounded-xl border border-border bg-surface/55 p-4 sm:p-6">
        <summary className="cursor-pointer text-sm font-semibold">Source details</summary>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Source transparency
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              Availability and provenance
            </h2>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {((analytics.data?.sources ?? []) as AnalyticsSource[]).map((source) => (
            <article
              key={source.key}
              className="rounded-xl border border-border bg-background/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{source.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{source.provider}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-1 text-[10px] font-semibold",
                    sourceStatusTone(source.availability),
                  )}
                >
                  {STATUS_LABEL[source.availability]}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-xs">
                <ProvenanceRow
                  label="Requested range"
                  value={`${formatDate(source.requestedRangeStart)} – ${formatDate(source.requestedRangeEnd)}`}
                />
                <ProvenanceRow
                  label="Available range"
                  value={
                    source.availableRangeStart || source.availableRangeEnd
                      ? `${formatDate(source.availableRangeStart)} – ${formatDate(source.availableRangeEnd)}`
                      : "Not declared by provider"
                  }
                />
                <ProvenanceRow label="Records used" value={source.recordCount.toLocaleString()} />
                <ProvenanceRow label="Source" value={source.sourceReference} />
                <ProvenanceRow label="Calculation" value={source.calculationVersion} />
              </dl>
              {source.safeMessage && (
                <p className="mt-3 rounded-lg border border-border bg-elevated/60 p-2 text-xs text-muted-foreground">
                  {source.safeMessage}
                </p>
              )}
            </article>
          ))}
          {!analytics.isPending && !analytics.isError && !analytics.data?.sources.length && (
            <p className="text-sm text-muted-foreground">No metric sources were returned.</p>
          )}
        </div>
      </details>

      <HistoricalIntelligence
        pending={intelligence.isPending}
        error={intelligence.error}
        data={intelligence.data}
      />
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/45 p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProvenanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-foreground">{value}</dd>
    </div>
  );
}

type IntelligenceData = {
  schemaAvailable: boolean;
  profile: {
    id: string;
    provider: string;
    sync_state: string;
    analyzed_sources: string[];
    requested_range_start: string | null;
    requested_range_end: string | null;
    available_range_start: string | null;
    available_range_end: string | null;
    record_count: number;
    last_attempt_at: string | null;
    last_success_at: string | null;
    safe_error_code: string | null;
    safe_error_message: string | null;
    updated_at: string;
  } | null;
  snapshots: Array<{
    id: string;
    metric_key: string;
    provider: string;
    availability: string;
    value: number | null;
    unit: string | null;
    range_start: string | null;
    range_end: string | null;
    record_count: number;
    captured_at: string;
    source_reference: string | null;
    calculation_version: string | null;
  }>;
  safeMessage: string | null;
};

function HistoricalIntelligence({
  pending,
  error,
  data,
}: {
  pending: boolean;
  error: Error | null;
  data: IntelligenceData | undefined;
}) {
  return (
    <details className="rounded-xl border border-border bg-surface/55 p-4 sm:p-6">
      <summary className="cursor-pointer text-sm font-semibold">Historical performance</summary>
      <div className="flex items-start gap-3">
        {data?.profile?.sync_state === "available" ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Social intelligence
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Historical availability</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Historical metrics appear only after a backend sync stores a sourced snapshot.
          </p>
        </div>
      </div>
      {pending && (
        <p className="mt-4 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading historical status…
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          Historical status is unavailable. No historical values were substituted.
        </p>
      )}
      {!pending && !error && data && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Sync state"
              value={data.profile?.sync_state?.replaceAll("_", " ") ?? "Not synced"}
            />
            <MetricCard
              label="Records analyzed"
              value={data.profile ? data.profile.record_count.toLocaleString() : "Unavailable"}
            />
            <MetricCard
              label="Available range"
              value={
                data.profile?.available_range_start || data.profile?.available_range_end
                  ? `${formatDate(data.profile.available_range_start)} – ${formatDate(data.profile.available_range_end)}`
                  : "Unavailable"
              }
            />
            <MetricCard
              label="Last successful sync"
              value={formatDateTime(data.profile?.last_success_at)}
            />
          </div>
          {data.safeMessage && (
            <p className="mt-4 rounded-xl border border-border bg-background/40 p-3 text-sm text-muted-foreground">
              {data.safeMessage}
            </p>
          )}
          {!!data.snapshots.length && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.snapshots.map((snapshot) => (
                <article
                  key={snapshot.id}
                  className="rounded-xl border border-border bg-background/40 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-foreground">
                      {snapshot.metric_key.replaceAll(/[_.-]/g, " ")}
                    </p>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                      {snapshot.availability.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {snapshot.value === null
                      ? "Unavailable"
                      : `${snapshot.value.toLocaleString()}${snapshot.unit ? ` ${snapshot.unit}` : ""}`}
                  </p>
                  <dl className="mt-3 grid gap-2 text-xs">
                    <ProvenanceRow
                      label="Range"
                      value={`${formatDate(snapshot.range_start)} – ${formatDate(snapshot.range_end)}`}
                    />
                    <ProvenanceRow label="Records" value={snapshot.record_count.toLocaleString()} />
                    <ProvenanceRow
                      label="Source"
                      value={snapshot.source_reference ?? snapshot.provider}
                    />
                    <ProvenanceRow
                      label="Calculation"
                      value={snapshot.calculation_version ?? "Not reported"}
                    />
                    <ProvenanceRow label="Captured" value={formatDateTime(snapshot.captured_at)} />
                  </dl>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </details>
  );
}
