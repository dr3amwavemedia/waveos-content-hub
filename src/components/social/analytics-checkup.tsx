import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Loader2,
  Sparkles,
  Eye,
  Heart,
  Users,
  MousePointerClick,
  MessageCircle,
  TrendingUp,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
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
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { historySeries, comparePeriods } from "@/lib/analytics-history";
import { Button } from "@/components/ui/button";
import { OceanDisclosure, OceanPanel, OceanStatus } from "@/components/app/ocean-ui";

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

const ANALYTICS_TRUTH_NOTE =
  "Missing or failed sources remain unavailable. WaveOS does not replace them with zero.";

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

function formatTopPostMetrics(metrics: Record<string, string | number | null> | undefined) {
  if (!metrics) return "Post metrics were not reported.";
  const values = Object.entries(metrics).flatMap(([key, value]) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return [];
    return [`${key.replaceAll(/[_.-]/g, " ")} ${numeric.toLocaleString()}`];
  });
  return values.length ? values.slice(0, 4).join(" · ") : "Post metrics were not reported.";
}

function sourceStatusTone(state: AnalyticsAvailability) {
  if (state === "available" || state === "true_zero") {
    return "border-success/30 bg-success/10 text-success";
  }
  if (state === "not_synced" || state === "unsupported") {
    return "border-border bg-elevated text-muted-foreground";
  }
  return "border-warning/30 bg-warning/10 text-warning";
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
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [graphMetric, setGraphMetric] = useState("reach");
  const [mode, setMode] = useState<AnalyticsMode>("combined");
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const analytics = useQuery({
    queryKey: ["analytics-checkup", workspaceId, days],
    queryFn: () => analyticsFn({ data: { workspaceId, days } }),
    retry: false,
  });
  const intelligence = useQuery({
    queryKey: ["social-intelligence", workspaceId],
    queryFn: () => intelligenceFn({ data: { workspaceId } }),
    retry: false,
    enabled: analytics.isSuccess,
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
  const providerError = analytics.error instanceof Error ? analytics.error.message : null;
  const cutoff = Date.now() - days * 86400000;
  const historicalRows = (intelligence.data?.snapshots ?? []).filter(
    (row) => row.evidence?.mode === mode && row.range_end && Date.parse(row.range_end) >= cutoff,
  );
  const series = historySeries(historicalRows, graphMetric);
  const comparison = comparePeriods(historicalRows, graphMetric);
  const chartData = series.map((row) => ({ date: row.range_end, value: row.value }));
  const comparisons = ["reach", "views", "followers", "likes", "comments"].flatMap((key) => {
    const result = comparePeriods(historicalRows, key);
    return result ? [{ key, ...result }] : [];
  });
  const historicalBackfill = intelligence.data?.profile?.metadata?.historicalBackfill;
  const topPosts = Array.isArray(historicalBackfill?.topPosts) ? historicalBackfill.topPosts : [];
  return (
    <div className="space-y-6">
      <OceanPanel className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="ocean-eyebrow">Performance & growth</p>
            <h2 className="mt-1 text-xl font-semibold">Your business at a glance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Provider observations for the selected window. Unavailable data stays unavailable.
            </p>
          </div>
          <label className="text-xs text-muted-foreground">
            <span className="sr-only">Performance period</span>
            <select
              aria-label="Performance period"
              className="ocean-control px-3"
              value={days}
              onChange={(event) => setDays(Number(event.target.value) as 7 | 30 | 90)}
            >
              {[7, 30, 90].map((value) => (
                <option key={value} value={value}>
                  Last {value} days
                </option>
              ))}
            </select>
          </label>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={refreshing || analytics.isFetching}
            onClick={async () => {
              setRefreshing(true);
              try {
                const result = await analyticsFn({ data: { workspaceId, days, refresh: true } });
                queryClient.setQueryData(["analytics-checkup", workspaceId, days], result);
                await queryClient.invalidateQueries({
                  queryKey: ["social-intelligence", workspaceId],
                });
              } catch {
                await analytics.refetch();
                await queryClient.invalidateQueries({
                  queryKey: ["social-intelligence", workspaceId],
                });
              } finally {
                setRefreshing(false);
              }
            }}
          >
            {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {refreshing ? "Refreshing…" : "Refresh analytics"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Last provider sync: {formatDateTime(analytics.data?.sync.lastSuccessAt)}
          </span>
        </div>
        {analytics.data?.sync.state !== "available" && analytics.data?.sync && (
          <p role="status" className="border-l-2 border-warning pl-3 text-sm">
            {analytics.data.sync.message}
          </p>
        )}
        <div
          aria-label="Metric coverage"
          className="flex gap-1 rounded-lg border border-cyan-200/10 bg-background/35 p-1"
        >
          {(["combined", "organic", "paid"] as AnalyticsMode[]).map((value) => (
            <Button
              key={value}
              variant={mode === value ? "secondary" : "ghost"}
              className="min-w-0 flex-1 capitalize"
              onClick={() => setMode(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        <section className="rounded-xl border border-cyan-200/10 bg-background/25 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Growth over time</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {series.length
                  ? `${series[0].range_start} – ${series.at(-1)?.range_end} · ${series.at(-1)?.provider}`
                  : "Awaiting sourced historical observations"}
              </p>
            </div>
            {comparison?.change !== null && comparison?.change !== undefined && (
              <span
                className={cn(
                  "text-lg font-semibold",
                  comparison.change >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {comparison.change >= 0 ? "+" : ""}
                {comparison.change.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {["reach", "views", "likes", "followers"].map((key) => (
              <Button
                size="sm"
                key={key}
                className="capitalize"
                variant={graphMetric === key ? "secondary" : "ghost"}
                onClick={() => setGraphMetric(key)}
              >
                {key}
              </Button>
            ))}
          </div>
          {series.length >= 2 ? (
            <div className="mt-4 h-56 min-w-0 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    tickFormatter={(value) => String(value).slice(5)}
                  />
                  <YAxis width={42} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={graphMetric}
                    stroke="var(--analytics)"
                    fill="var(--analytics)"
                    fillOpacity={0.12}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 rounded-xl border border-dashed border-border bg-background/30 p-4 sm:grid-cols-[auto_1fr]">
              <TrendingUp className="size-6 text-analytics" />
              <div>
                <p className="text-sm font-medium">
                  {intelligence.isPending
                    ? "Checking historical observations…"
                    : "History collection in progress"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {series.length === 1
                    ? `One sourced ${graphMetric} observation is available for ${formatDate(series[0]?.range_end)}. A trend needs at least two compatible, non-overlapping observations.`
                    : "Current totals remain available below. A line appears only when the provider supplies dated, compatible observations."}
                </p>
                {historicalBackfill?.requestedRangeStart && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Backfill requested: {formatDate(historicalBackfill.requestedRangeStart)} –{" "}
                    {formatDate(historicalBackfill.requestedRangeEnd)} ·{" "}
                    {historicalBackfill.dailyRecords?.toLocaleString() ?? 0} daily records stored
                  </p>
                )}
              </div>
            </div>
          )}
          {comparison && (
            <p className="mt-3 text-xs text-muted-foreground">
              Current observed period: {comparison.current.value?.toLocaleString()} · Previous
              non-overlapping period: {comparison.previous.value?.toLocaleString()}
              {comparison.change === null
                ? " · Percentage unavailable: previous value is zero."
                : ""}
            </p>
          )}
        </section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metricRows
            .filter((row) => ["views", "reach", "engagements", "followers"].includes(row.key))
            .map(({ key, label, metric }, index) => {
              const trend = historySeries(historicalRows, key);
              const change = comparePeriods(historicalRows, key);
              return (
                <article
                  key={key}
                  className="min-w-0 rounded-xl border border-cyan-200/10 bg-background/30 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    {index === 2 ? (
                      <Heart className="size-4 text-intelligence" />
                    ) : (
                      <Eye className="size-4 text-analytics" />
                    )}
                  </div>
                  <p className="mt-3 text-2xl font-semibold">
                    {analytics.isPending
                      ? "…"
                      : metric.value === null
                        ? "—"
                        : metric.value.toLocaleString()}
                  </p>
                  {trend.length >= 2 ? (
                    <div className="mt-3 h-8">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trend}>
                          <Area
                            dataKey="value"
                            stroke="var(--analytics)"
                            fill="var(--analytics)"
                            fillOpacity={0.1}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Historical trend unavailable
                    </p>
                  )}
                  <div className="mt-2">
                    <OceanStatus tone={metric.value === null ? "warning" : "positive"}>
                      {metric.value === null
                        ? STATUS_LABEL[metric.availability]
                        : metric.coverage === "partial"
                          ? "Partial coverage"
                          : "Provider reported"}
                    </OceanStatus>
                  </div>
                  {change?.change !== null && change?.change !== undefined && (
                    <p
                      className={cn(
                        "mt-2 text-xs",
                        change.change >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {change.change >= 0 ? "+" : ""}
                      {change.change.toFixed(1)}% across comparable stored periods
                    </p>
                  )}
                </article>
              );
            })}
        </div>
        {analytics.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline size-4 animate-spin" />
            Loading provider metrics…
          </p>
        )}
        {analytics.isError && (
          <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
            Metrics are unavailable. No values were substituted.{" "}
            {providerError === "forbidden"
              ? "This workspace does not grant analytics access."
              : "Retry when the provider connection is available."}
            <Button variant="ghost" onClick={() => void analytics.refetch()}>
              Retry
            </Button>
          </p>
        )}
        <section className="border-t border-border pt-5">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-5 text-warning" />
            Evidence-backed insights
          </h3>
          {comparisons.length ? (
            <ul className="mt-3 space-y-3">
              {comparisons.map((item) => (
                <li key={item.key} className="text-sm">
                  <span className="capitalize">{item.key}</span>{" "}
                  {item.change === null
                    ? `changed from ${item.previous.value} to ${item.current.value}`
                    : `${item.change >= 0 ? "increased" : "declined"} by ${Math.abs(item.change).toFixed(1)}%`}{" "}
                  across equal-length, non-overlapping observed periods.
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.current.source_reference} · {item.current.calculation_version}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Not enough comparable evidence for a growth conclusion, best posting time or
              content-format recommendation.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            These are calculated observations, not AI conclusions. AI analysis is currently
            unavailable.
          </p>
        </section>
        <section className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <h3 className="font-semibold">Top provider-reported content</h3>
            {topPosts.length ? (
              <div className="mt-2 space-y-2">
                {topPosts.slice(0, 5).map((post, index) => (
                  <article
                    key={post.postId ?? `${post.platform}-${post.publishedAt}-${index}`}
                    className="rounded-lg border border-border bg-background/30 p-3"
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span>{post.platform || "Platform not reported"}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(post.publishedAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatTopPostMetrics(post.metrics)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                The provider has not returned ranked post-level metrics. No content winners are
                inferred from account totals.
              </p>
            )}
          </div>
          <div>
            <h3 className="font-semibold">Source performance</h3>
            <div className="mt-2 space-y-3">
              {selectedSources.map((source) => (
                <article
                  key={source.key}
                  className="rounded-lg border border-border bg-background/30 p-3"
                >
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{source.label}</span>
                    <OceanStatus
                      tone={
                        ["available", "true_zero"].includes(source.availability)
                          ? "positive"
                          : "warning"
                      }
                    >
                      {STATUS_LABEL[source.availability]}
                    </OceanStatus>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Reach {source.metrics.reach.value?.toLocaleString() ?? "unavailable"} · Views{" "}
                    {source.metrics.views.value?.toLocaleString() ?? "unavailable"} · Likes{" "}
                    {source.metrics.likes.value?.toLocaleString() ?? "unavailable"} · Comments{" "}
                    {source.metrics.comments.value?.toLocaleString() ?? "unavailable"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {source.recordCount.toLocaleString()} records ·{" "}
                    {formatDate(source.availableRangeStart)} –{" "}
                    {formatDate(source.availableRangeEnd)}
                  </p>
                </article>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-semibold">Competitive benchmark</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Comparable competitor platform metrics are not available. Public research is not a
              performance benchmark.
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Brand consistency</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Not evaluated. A score requires a review of recent content against your saved Brand
              Voice.
            </p>
          </div>
        </section>
        <section className="border-t border-border pt-5">
          <h3 className="text-lg font-semibold">What should I do next?</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {comparisons.length
              ? "Review the observed changes above before choosing a content direction. These totals alone cannot identify which topic or format caused growth."
              : "Collect comparable historical observations before making performance-driven content decisions."}
          </p>
        </section>
        <OceanDisclosure summary="All metrics and calculation details">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="WaveOS-published posts" value={observedValue(publishedPosts)} />
            <MetricCard label="Connected channels" value={observedValue(connectedChannels)} />
            {metricRows.map(({ key, label, metric }) => (
              <MetricCard
                key={key}
                label={label}
                value={metric.value === null ? "Unavailable" : metric.value.toLocaleString()}
                hint={
                  metric.coverage === "partial"
                    ? "Partial coverage"
                    : STATUS_LABEL[metric.availability]
                }
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Combined adds available provider sources. Provider analytics can include content
            published directly on connected social networks after the provider syncs it. The
            WaveOS-published posts count is local and only counts posts published through WaveOS.
            Paid uses paid-media only. Engagements is reported likes plus comments
            (waveos-engagements-likes-plus-comments-v1). {ANALYTICS_TRUTH_NOTE} Historical
            comparisons use one compatible provider/calculation series; they are separate from the
            requested current totals and do not mix organic/paid observations.
          </p>
        </OceanDisclosure>
      </OceanPanel>

      <OceanDisclosure summary="Source details">
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
      </OceanDisclosure>

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
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
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
    metadata: {
      historicalBackfill?: {
        requestedRangeStart?: string;
        requestedRangeEnd?: string;
        availableRangeStart?: string;
        availableRangeEnd?: string;
        dailyRecords?: number;
        dataAsOf?: string | null;
        topPosts?: Array<{
          postId?: string;
          platform?: string;
          publishedAt?: string;
          metrics?: Record<string, string | number | null>;
        }>;
      };
    } | null;
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
