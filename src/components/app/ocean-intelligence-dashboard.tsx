import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FolderKanban,
  HeartPulse,
  Loader2,
  MessageSquareText,
  PenSquare,
  Play,
  Send,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useWorkspace } from "@/components/app/workspace-context";
import { useContentItems } from "@/hooks/use-content";
import { usePermissions } from "@/hooks/use-permissions";
import { useProductionCalendar } from "@/hooks/use-production-calendar";
import { useCurrentUser } from "@/hooks/use-waveos";
import {
  combineAnalyticsMetric,
  deriveEngagements,
  type AnalyticsSource,
} from "@/lib/analytics-transparency";
import { historySeries, type HistoryObservation } from "@/lib/analytics-history";
import {
  authorizedPortfolio,
  buildOceanTimeline,
  formatObservedMetric,
  oceanWorkload,
  type OceanTimelineKind,
} from "@/lib/ocean-dashboard";
import { getAdminOperationalHealth } from "@/lib/operational-health.functions";
import { waveAssist } from "@/lib/wave-assist.functions";
import { getSocialIntelligenceProfile, getZernioAnalytics } from "@/lib/zernio.functions";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<OceanTimelineKind, { label: string; icon: typeof Play; color: string }> = {
  content: { label: "Content", icon: Play, color: "#2de8dd" },
  shoot: { label: "Shoot", icon: Camera, color: "#42c8ff" },
  approval: { label: "Approval", icon: CheckCircle2, color: "#a884ff" },
  publishing: { label: "Publishing", icon: Send, color: "#45b9ff" },
};

type HealthPayload = {
  observedAt: string;
  storage: {
    usedBytes: number;
    safetyLimitBytes: number;
    workspaceCount: number;
    available: boolean;
  };
  ai: {
    requests30d: number;
    failures30d: number;
    inputTokens30d: number;
    outputTokens30d: number;
    estimatedCostMicros30d: number | null;
    available: boolean;
    telemetryAvailable: boolean;
  };
  analytics: { profiles: number; unhealthy: number; stale: number; available: boolean };
  externalMedia: { connections: number; unhealthy: number; available: boolean };
};

type DashboardRoute = "/content" | "/calendar" | "/approvals" | "/create" | "/videographer";

function OceanWaveBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-64 w-full opacity-55"
      viewBox="0 0 1200 280"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="ocean-wave-line" x1="0" x2="1">
          <stop offset="0" stopColor="#1f5eff" stopOpacity="0" />
          <stop offset=".48" stopColor="#25efe5" />
          <stop offset="1" stopColor="#866cff" stopOpacity=".15" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((offset) => (
        <path
          key={offset}
          d={`M -40 ${210 + offset * 9} C 270 ${30 + offset * 6}, 560 ${250 - offset * 8}, 1240 ${-10 + offset * 8}`}
          fill="none"
          stroke="url(#ocean-wave-line)"
          strokeWidth="1"
          opacity={0.7 - offset * 0.1}
        />
      ))}
    </svg>
  );
}

export function OceanIntelligenceDashboard() {
  const { activeWorkspace, workspaces } = useWorkspace();
  const { data: user } = useCurrentUser();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [assistBrief, setAssistBrief] = useState("");
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistMessages, setAssistMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const workspaceId = activeWorkspace?.id ?? null;
  const content = useContentItems(workspaceId);
  const shoots = useProductionCalendar(workspaceId);
  const analyticsFn = useServerFn(getZernioAnalytics);
  const intelligenceFn = useServerFn(getSocialIntelligenceProfile);
  const healthFn = useServerFn(getAdminOperationalHealth);
  const assistFn = useServerFn(waveAssist);
  const canSeeAnalytics = can("can_view_analytics_checkup");
  const isOwner = user?.isDreamWaveOwner === true;

  const analytics = useQuery({
    queryKey: ["ocean-dashboard", "analytics", workspaceId],
    enabled: Boolean(workspaceId && canSeeAnalytics),
    retry: false,
    queryFn: () => analyticsFn({ data: { workspaceId: workspaceId!, days: 30 } }),
  });
  const intelligence = useQuery({
    queryKey: ["ocean-dashboard", "history", workspaceId],
    enabled: Boolean(workspaceId && canSeeAnalytics && analytics.isSuccess),
    retry: false,
    queryFn: () => intelligenceFn({ data: { workspaceId: workspaceId! } }),
  });
  const health = useQuery({
    queryKey: ["admin-operational-health"],
    enabled: isOwner,
    retry: false,
    staleTime: 60_000,
    queryFn: () => healthFn(),
  });

  const now = useMemo(() => new Date(), []);
  const items = content.data ?? [];
  const shootItems = shoots.data ?? [];
  const workload = oceanWorkload(items, shootItems, now);
  const timeline = buildOceanTimeline(items, shootItems, now);
  const portfolio = authorizedPortfolio(workspaces, activeWorkspace?.id);
  const sources = (analytics.data?.sources ?? []) as AnalyticsSource[];
  const history = ((intelligence.data?.snapshots ?? []) as HistoryObservation[]).filter(
    (row) => row.evidence?.mode === "combined",
  );
  const series = historySeries(history, "reach").map((row) => ({
    date: row.range_end,
    value: row.value,
  }));
  const metrics = [
    { label: "Views", metric: combineAnalyticsMetric(sources, "views") },
    { label: "Engagement", metric: deriveEngagements(sources) },
    { label: "Reach", metric: combineAnalyticsMetric(sources, "reach") },
    { label: "Followers", metric: combineAnalyticsMetric(sources, "followers") },
  ];
  const workloadUnavailable = content.isError;

  useEffect(() => {
    if (!workspaceId) return;
    try {
      const stored = sessionStorage.getItem(`waveos.assist.${workspaceId}`);
      if (stored) setAssistMessages(JSON.parse(stored).slice(-8));
      else setAssistMessages([]);
    } catch {
      setAssistMessages([]);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    sessionStorage.setItem(
      `waveos.assist.${workspaceId}`,
      JSON.stringify(assistMessages.slice(-8)),
    );
  }, [assistMessages, workspaceId]);

  const submitAssist = async () => {
    const brief = assistBrief.trim();
    if (!brief || !workspaceId) return;
    const prior = assistMessages.slice(-6);
    setAssistMessages((current) =>
      [...current, { role: "user" as const, content: brief }].slice(-8),
    );
    setAssistBrief("");
    setAssistBusy(true);
    setAssistError(null);
    try {
      const result = await assistFn({
        data: {
          mode: "advisor",
          input: brief,
          workspaceId,
          conversation: prior,
          context: JSON.stringify({
            workspace: activeWorkspace?.name ?? "WaveOS",
            workload: workloadUnavailable ? "unavailable" : workload,
            performance: Object.fromEntries(
              metrics.map(({ label, metric }) => [label.toLowerCase(), metric.value]),
            ),
            analyticsCoverage: analytics.isError
              ? "unavailable"
              : analytics.isPending
                ? "loading"
                : "provider sourced",
          }),
        },
      });
      setAssistMessages((current) =>
        [...current, { role: "assistant" as const, content: result.suggestion }].slice(-8),
      );
    } catch (error) {
      setAssistError(error instanceof Error ? error.message : "Wave Assist is unavailable.");
    } finally {
      setAssistBusy(false);
    }
  };

  return (
    <div className="ocean-dashboard relative isolate min-h-[calc(100vh-8rem)] overflow-hidden rounded-[1.75rem] border border-cyan-300/10 p-3 text-slate-50 shadow-[0_30px_100px_rgba(0,0,0,.4)] sm:p-5 xl:p-6">
      <OceanWaveBackdrop />
      <div className="relative z-10 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.62fr)_minmax(19rem,.92fr)]">
        <main className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-end justify-between gap-3 px-1 pb-1 pt-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.24em] text-cyan-200/65">
                {activeWorkspace?.name ?? "WaveOS"}
              </p>
              <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">Today</h1>
              <p className="mt-1 text-sm text-slate-300">Your creative operations at a glance.</p>
            </div>
            <div className="rounded-xl border border-cyan-200/15 bg-slate-950/30 px-3 py-2 text-sm text-slate-300 backdrop-blur">
              {new Intl.DateTimeFormat("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(now)}
            </div>
          </header>

          <section aria-label="Today's workload" className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <WorkloadCard
              icon={Play}
              label="Content"
              value={workloadUnavailable ? null : workload.content}
              hint="active workflow"
              to="/content"
              color="#2de8dd"
              loading={content.isPending}
            />
            <WorkloadCard
              icon={Camera}
              label="Shoots"
              value={shoots.isError ? null : workload.shoots}
              hint="today"
              to={user?.isStaff ? "/videographer" : "/calendar"}
              color="#42c8ff"
              loading={shoots.isPending}
            />
            <WorkloadCard
              icon={CheckCircle2}
              label="Approvals"
              value={workloadUnavailable ? null : workload.approvals}
              hint="awaiting review"
              to="/approvals"
              color="#a884ff"
              loading={content.isPending}
            />
            <WorkloadCard
              icon={Send}
              label="Publishing"
              value={workloadUnavailable ? null : workload.publishing}
              hint="scheduled or sending"
              to="/calendar"
              color="#45b9ff"
              loading={content.isPending}
            />
          </section>

          <section className="ocean-panel p-3 sm:p-4" aria-labelledby="today-timeline-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="today-timeline-title" className="text-sm font-semibold text-slate-100">
                Today&apos;s operational timeline
              </h2>
              {(content.isError || shoots.isError) && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                  <CircleAlert className="h-3.5 w-3.5" />
                  Partial data
                </span>
              )}
            </div>
            {content.isPending || shoots.isPending ? (
              <div className="flex min-h-44 items-center justify-center text-sm text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading dated work…
              </div>
            ) : timeline.length ? (
              <ol className="mt-3 space-y-2">
                {timeline.map((item) => {
                  const visual = KIND_STYLE[item.kind];
                  const Icon = visual.icon;
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.to}
                        className="group grid min-h-12 grid-cols-[4.5rem_2rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-cyan-100/10 bg-[#071c36]/70 px-2.5 py-2 transition hover:border-cyan-200/30 hover:bg-[#0b294a] sm:grid-cols-[5.5rem_2.2rem_6rem_minmax(0,1fr)_auto]"
                      >
                        <time className="text-xs font-medium tabular-nums text-slate-300">
                          {new Intl.DateTimeFormat("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(item.at))}
                        </time>
                        <span
                          className="flex h-8 w-8 items-center justify-center rounded-lg border"
                          style={{
                            color: visual.color,
                            borderColor: `${visual.color}55`,
                            background: `${visual.color}12`,
                          }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="hidden text-sm font-semibold sm:block">
                          {visual.label}
                        </span>
                        <span className="min-w-0 truncate text-sm text-slate-200">
                          {item.title}
                        </span>
                        <span className="col-start-3 w-fit rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] capitalize text-slate-300 sm:col-start-auto">
                          {item.status}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <HonestEmpty
                title="No dated work on today’s timeline"
                body="Scheduled publishing, production shoots, and items updated for review will appear here when those records exist."
              />
            )}
          </section>

          <section
            className="ocean-panel overflow-hidden p-4 sm:p-5"
            aria-labelledby="performance-current-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="performance-current-title" className="text-xl font-semibold">
                  Performance Current
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Last 30 days · sourced provider observations
                </p>
              </div>
              {canSeeAnalytics && (
                <Link
                  to="/analytics"
                  className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-cyan-200/15 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/10"
                >
                  Open methodology <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            {!canSeeAnalytics ? (
              <HonestEmpty
                title="Analytics are not included for this workspace"
                body="No performance values are inferred. Open an entitled workspace to see sourced provider metrics."
              />
            ) : analytics.isError ? (
              <HonestEmpty
                title="Performance data is unavailable"
                body="WaveOS did not substitute zeros. Retry from Analytics when the provider connection is available."
                tone="warning"
              />
            ) : (
              <>
                <div className="mt-5 grid grid-cols-2 gap-4 border-y border-cyan-100/10 py-4 sm:grid-cols-4">
                  {metrics.map(({ label, metric }) => (
                    <div
                      key={label}
                      className="min-w-0 border-cyan-100/10 sm:border-r sm:last:border-r-0"
                    >
                      <p className="text-[11px] uppercase tracking-[.14em] text-slate-400">
                        {label}
                      </p>
                      <p className="mt-1 truncate text-xl font-semibold sm:text-2xl">
                        {formatObservedMetric(metric.value, analytics.isPending)}
                      </p>
                      <p className="mt-1 text-[10px] text-cyan-200/60">
                        {metric.value === null
                          ? "Not reported"
                          : metric.coverage === "partial"
                            ? "Partial provider coverage"
                            : "Provider reported"}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 h-56 min-w-0 sm:h-72">
                  {intelligence.isPending ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading sourced history…
                    </div>
                  ) : series.length >= 2 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                        <defs>
                          <linearGradient id="ocean-chart-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#46e9e0" stopOpacity=".42" />
                            <stop offset="1" stopColor="#7167ff" stopOpacity=".02" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(135,210,255,.12)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#8ca7c1", fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => String(value).slice(5)}
                        />
                        <YAxis
                          width={44}
                          tick={{ fill: "#8ca7c1", fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) =>
                            new Intl.NumberFormat("en", { notation: "compact" }).format(
                              Number(value),
                            )
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#061a31",
                            border: "1px solid rgba(91,220,229,.24)",
                            borderRadius: 12,
                          }}
                          labelStyle={{ color: "#b9d8ec" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          name="Reach"
                          stroke="#45e4dc"
                          strokeWidth={2.5}
                          fill="url(#ocean-chart-fill)"
                          connectNulls={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <HonestEmpty
                      title="Growth history needs another comparable observation"
                      body="Current totals remain above. The wave chart appears only after at least two dated observations share provider, coverage, calculation, and period length."
                    />
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-4 text-slate-500">
                  Combined values add only available provider sources. Historical points preserve
                  source reference, coverage, and calculation version; unsupported metrics remain
                  unavailable.
                </p>
              </>
            )}
          </section>
        </main>

        <aside className="min-w-0 space-y-4">
          <section
            className="ocean-panel overflow-hidden border-cyan-300/25 bg-[linear-gradient(145deg,rgba(7,34,62,.96),rgba(16,22,54,.94))] p-4 shadow-[0_18px_55px_rgba(17,217,225,.08)]"
            aria-labelledby="wave-assist-title"
          >
            <div className="-mx-4 -mt-4 mb-4 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/20 bg-gradient-to-br from-cyan-300/25 to-violet-400/25 text-cyan-100 shadow-[0_0_24px_rgba(64,224,230,.15)]">
                <WandSparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 id="wave-assist-title" className="text-lg font-semibold">
                    Wave Assist
                  </h2>
                  <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.16em] text-violet-200">
                    Premium AI
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Brand-aware guidance grounded in your live WaveOS workspace.
                </p>
              </div>
            </div>
            {assistMessages.length > 0 && (
              <div aria-live="polite" className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                {assistMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-sm leading-6",
                      message.role === "assistant"
                        ? "border border-cyan-200/10 bg-cyan-200/[.06] text-slate-200"
                        : "ml-8 bg-violet-300/10 text-violet-50",
                    )}
                  >
                    {message.role === "assistant" && (
                      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-cyan-200/70">
                        <MessageSquareText className="h-3 w-3" /> Wave Assist
                      </span>
                    )}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                ))}
              </div>
            )}
            {assistBusy && (
              <div
                className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-200/10 bg-cyan-200/[.04] p-3 text-xs text-cyan-100"
                role="status"
              >
                <Loader2 className="h-4 w-4 animate-spin" /> Reading your workspace and shaping a
                useful answer…
              </div>
            )}
            {assistError && (
              <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">
                {assistError}
              </p>
            )}
            {can("can_create_content") ? (
              <form
                className="mt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitAssist();
                }}
              >
                <label className="sr-only" htmlFor="ocean-assist-brief">
                  Ask Wave Assist
                </label>
                <div className="flex min-h-11 items-center rounded-xl border border-cyan-300/35 bg-[#06182d]/70 px-3 focus-within:ring-2 focus-within:ring-cyan-300/45">
                  <Sparkles className="mr-2 h-4 w-4 text-cyan-300" />
                  <input
                    id="ocean-assist-brief"
                    value={assistBrief}
                    onChange={(event) => setAssistBrief(event.target.value)}
                    placeholder="Ask for a decision, idea, or next step…"
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={!assistBrief.trim() || assistBusy}
                    className="ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-cyan-200 hover:bg-cyan-300/10 disabled:opacity-35"
                    aria-label="Ask Wave Assist"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-4 rounded-xl border border-white/10 p-3 text-xs text-slate-400">
                Wave Assist opens through the existing Create Post workflow when content creation is
                available.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {assistMessages.some((message) => message.role === "assistant") && (
                <button
                  type="button"
                  className="ocean-chip"
                  onClick={() => {
                    const lastAnswer = [...assistMessages]
                      .reverse()
                      .find((message) => message.role === "assistant")?.content;
                    if (lastAnswer && workspaceId)
                      void navigate({
                        to: "/create",
                        search: { brief: lastAnswer.slice(0, 3000), briefWorkspace: workspaceId },
                      });
                  }}
                >
                  Turn answer into a draft
                </button>
              )}
              {can("can_use_campaign_manager") && (
                <Link to="/campaigns" className="ocean-chip">
                  Plan a campaign
                </Link>
              )}
              {user?.isStaff && (
                <Link to="/videographer" className="ocean-chip">
                  Create a shoot plan
                </Link>
              )}
              <Link to="/approvals" className="ocean-chip">
                Summarize approvals
              </Link>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-500">
              Suggestions only · Brand Voice aware · never publishes or changes records for you
            </p>
          </section>

          <SystemHealthPanel owner={isOwner} query={health} />

          <section className="ocean-panel p-4" aria-labelledby="quick-actions-title">
            <h2 id="quick-actions-title" className="text-lg font-semibold">
              Quick Actions
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {can("can_create_content") && (
                <QuickAction to="/create" icon={PenSquare} label="Create Content" color="#2de8dd" />
              )}
              {user?.isStaff && (
                <QuickAction to="/videographer" icon={Camera} label="Plan Shoot" color="#42c8ff" />
              )}
              <QuickAction
                to="/approvals"
                icon={CheckCircle2}
                label="Review Approvals"
                color="#a884ff"
              />
              {can("can_view_calendar_preview") && (
                <QuickAction to="/calendar" icon={Send} label="Schedule Publish" color="#45b9ff" />
              )}
            </div>
          </section>

          <section className="ocean-panel p-4" aria-labelledby="client-portfolio-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="client-portfolio-title" className="text-lg font-semibold">
                Client Portfolio
              </h2>
              <span className="text-xs text-slate-400">{portfolio.length} authorized</span>
            </div>
            {portfolio.length ? (
              <ul className="mt-3 divide-y divide-cyan-100/10">
                {portfolio.map((workspace) => (
                  <li key={workspace.id} className="flex min-w-0 items-center gap-3 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-200/15 bg-cyan-300/5 text-cyan-200">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{workspace.name}</p>
                      <p className="truncate text-[10px] capitalize text-slate-500">
                        {workspace.access_tier.replaceAll("_", " ")} · {workspace.role}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-[10px]",
                        workspace.id === activeWorkspace?.id
                          ? "bg-emerald-400/15 text-emerald-200"
                          : "bg-sky-400/10 text-sky-200",
                      )}
                    >
                      {workspace.id === activeWorkspace?.id ? "Active" : "Available"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <HonestEmpty
                title="No authorized clients"
                body="Only workspaces granted to this account can appear here."
              />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function WorkloadCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
  color,
  loading,
}: {
  icon: typeof Play;
  label: string;
  value: number | null;
  hint: string;
  to: DashboardRoute;
  color: string;
  loading: boolean;
}) {
  return (
    <Link
      to={to}
      className="ocean-panel group min-w-0 p-3 transition hover:-translate-y-0.5 hover:border-cyan-200/30 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
          style={{ color, borderColor: `${color}55`, background: `${color}12` }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">
            {loading ? "…" : value === null ? "—" : value}
          </p>
          <p className="truncate text-[10px] text-slate-400">
            {value === null && !loading ? "unavailable" : hint}
          </p>
        </div>
      </div>
    </Link>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  color,
}: {
  to: DashboardRoute;
  icon: typeof PenSquare;
  label: string;
  color: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-24 flex-col items-center justify-center rounded-xl border border-cyan-100/12 bg-[#071c36]/55 p-2 text-center transition hover:border-cyan-200/35 hover:bg-[#0b294a]"
    >
      <Icon className="h-5 w-5" style={{ color }} />
      <span className="mt-2 text-xs font-semibold leading-4">{label}</span>
    </Link>
  );
}

function HonestEmpty({
  title,
  body,
  tone = "default",
}: {
  title: string;
  body: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "my-4 flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center",
        tone === "warning"
          ? "border-amber-300/25 bg-amber-300/5"
          : "border-cyan-100/15 bg-[#06182d]/45",
      )}
    >
      <Activity className="h-6 w-6 text-cyan-200/55" />
      <p className="mt-2 text-sm font-semibold text-slate-200">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">{body}</p>
    </div>
  );
}

function SystemHealthPanel({
  owner,
  query,
}: {
  owner: boolean;
  query: { data?: HealthPayload; isPending: boolean; isError: boolean };
}) {
  if (!owner)
    return (
      <section className="ocean-panel p-4" aria-labelledby="system-health-title">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-emerald-300" />
          <h2 id="system-health-title" className="text-lg font-semibold">
            System Health
          </h2>
        </div>
        <p className="mt-3 rounded-xl border border-white/10 p-3 text-xs leading-5 text-slate-400">
          Detailed operational and payment-adjacent health is available only to Dream Wave owners.
          No privileged status was requested for this view.
        </p>
      </section>
    );
  const data = query.data;
  const rows = data
    ? [
        {
          label: "AI",
          icon: Sparkles,
          healthy: data.ai.available && data.ai.failures30d === 0,
          detail: !data.ai.available
            ? "Service unavailable"
            : data.ai.telemetryAvailable
              ? `${data.ai.requests30d} requests · ${data.ai.failures30d} failures`
              : "Ready · usage metering unavailable",
        },
        {
          label: "Analytics",
          icon: BarChart3,
          healthy: data.analytics.available && data.analytics.unhealthy === 0,
          detail: data.analytics.available
            ? `${data.analytics.profiles} profiles · ${data.analytics.unhealthy} unhealthy`
            : "Unavailable",
        },
        {
          label: "Connections",
          icon: Send,
          healthy: data.externalMedia.available && data.externalMedia.unhealthy === 0,
          detail: data.externalMedia.available
            ? `${data.externalMedia.connections} connected · ${data.externalMedia.unhealthy} expired`
            : "Unavailable",
        },
        {
          label: "Storage",
          icon: FolderKanban,
          healthy:
            data.storage.available && data.storage.usedBytes <= data.storage.safetyLimitBytes,
          detail: data.storage.available
            ? `${new Intl.NumberFormat("en", { notation: "compact", style: "unit", unit: "byte", unitDisplay: "narrow" }).format(data.storage.usedBytes)} observed`
            : "Unavailable",
        },
      ]
    : [];
  return (
    <section className="ocean-panel p-4" aria-labelledby="system-health-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="system-health-title" className="text-lg font-semibold">
          System Health
        </h2>
        {data && (
          <span className="text-[10px] text-slate-500">
            Observed{" "}
            {new Date(data.observedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      {query.isPending ? (
        <div className="flex min-h-36 items-center justify-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading owner health…
        </div>
      ) : query.isError ? (
        <HonestEmpty
          title="Operational health unavailable"
          body="No healthy state was assumed. Retry from the owner Staff dashboard."
          tone="warning"
        />
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map(({ label, icon: Icon, healthy, detail }) => (
            <li
              key={label}
              className="grid grid-cols-[1.5rem_5rem_minmax(0,1fr)] items-center gap-2 text-xs"
            >
              <Icon className={cn("h-4 w-4", healthy ? "text-emerald-300" : "text-amber-300")} />
              <span className="font-semibold">{label}</span>
              <span className="truncate text-right text-slate-400">{detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
