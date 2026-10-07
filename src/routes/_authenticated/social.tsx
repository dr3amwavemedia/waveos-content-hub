import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock,
  Facebook,
  FileText,
  Globe,
  Eye,
  Instagram,
  LayoutDashboard,
  Linkedin,
  Loader2,
  Megaphone,
  Music2,
  PenSquare,
  Trash2,
  TrendingUp,
  Send,
  Settings2,
  Sparkles,
  Twitter,
  Unplug,
  Wrench,
  XCircle,
  Youtube,
  type LucideIcon,
} from "lucide-react";

import { RequireFeature } from "@/components/app/require-feature";
import { PublishResults, type PublishAttempt } from "@/components/social/publish-results";
import { usePublishAttempts } from "@/hooks/use-content";
import { useWorkspace } from "@/components/app/workspace-context";
import { usePermissions } from "@/hooks/use-permissions";
import {
  ALL_PLATFORMS,
  PLATFORM_LABEL,
  useContentItems,
  useDeleteContentItem,
  useSocialConnections,
  type ContentItem,
  type ContentStatus,
  type SocialPlatform,
} from "@/hooks/use-content";
import { cn } from "@/lib/utils";
import {
  createZernioConnectUrl,
  disconnectZernioAccount,
  ensureZernioProfile,
  getZernioAnalytics,
  getZernioCommentInbox,
  getZernioWorkspaceStatus,
  replyToZernioComment,
  refreshZernioConnections,
} from "@/lib/zernio.functions";
import { waveAssist } from "@/lib/wave-assist.functions";
import { SOCIAL_PLATFORM_GUIDANCE } from "@/lib/social-platform-guidance";
import { getSocialPostingGoal, setSocialPostingGoal } from "@/lib/social-goals.functions";
import { weeklyPostingProgress } from "@/lib/social-goals";

type SocialView = "overview" | "posts" | "analytics" | "accounts";
type DateRange = "all" | "7" | "30" | "90";
type AccountState = "connected" | "action_required" | "expired" | "error" | "not_connected";

export const Route = createFileRoute("/_authenticated/social")({
  validateSearch: (search: Record<string, unknown>): { view?: SocialView } => {
    const allowed: SocialView[] = ["overview", "posts", "analytics", "accounts"];
    return typeof search.view === "string" && allowed.includes(search.view as SocialView)
      ? { view: search.view as SocialView }
      : {};
  },
  component: () => (
    <RequireFeature
      feature="can_connect_socials"
      title="Social tools aren't part of this workspace"
      description="The Social Media workspace is available on Full Retainer and Social Management plans."
    >
      <SocialWorkspace />
    </RequireFeature>
  ),
  head: () => ({
    meta: [
      { title: "Social Media — WaveOS" },
      {
        name: "description",
        content: "Plan, review and understand social content in one workspace.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const PLATFORM_ICON: Partial<Record<SocialPlatform, LucideIcon>> = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  linkedin: Linkedin,
  x: Twitter,
  tiktok: Music2,
};

const ACCOUNT_STATE: Record<AccountState, { label: string; tone: string; icon: LucideIcon }> = {
  connected: {
    label: "Connected",
    tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    icon: CheckCircle2,
  },
  action_required: {
    label: "Action required",
    tone: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    icon: AlertTriangle,
  },
  expired: {
    label: "Expired",
    tone: "border-orange-400/30 bg-orange-400/10 text-orange-300",
    icon: Clock,
  },
  error: {
    label: "Error",
    tone: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    icon: XCircle,
  },
  not_connected: {
    label: "Not connected",
    tone: "border-border bg-surface/60 text-muted-foreground",
    icon: Globe,
  },
};

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Needs attention",
  archived: "Archived",
};

const STATUS_TONE: Record<ContentStatus, string> = {
  draft: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  in_review: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  changes_requested: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  approved: "border-teal-400/30 bg-teal-400/10 text-teal-300",
  scheduled: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  publishing: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300",
  published: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  failed: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  archived: "border-border bg-surface/60 text-muted-foreground",
};

function accountState(
  row: { connected: boolean; connection_state?: string; raw: unknown } | undefined,
): AccountState {
  if (!row) return "not_connected";
  if (row.connection_state && row.connection_state in ACCOUNT_STATE) {
    return row.connection_state as AccountState;
  }
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  if (raw.error || raw.status === "error") return "error";
  if (raw.expired === true || raw.status === "expired") return "expired";
  if (raw.refreshRequired || raw.status === "action_required") return "action_required";
  return row.connected ? "connected" : "not_connected";
}

function itemDate(item: ContentItem) {
  return item.published_at ?? item.scheduled_at ?? item.updated_at ?? item.created_at;
}

function itemPlatforms(item: ContentItem): SocialPlatform[] {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const platforms = meta.platforms;
  return Array.isArray(platforms)
    ? (platforms.filter((value) => typeof value === "string") as SocialPlatform[])
    : [];
}

function SocialWorkspace() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const activeView = search.view ?? "overview";
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();
  const { isStaff } = usePermissions();
  const workspaceId = activeWorkspace?.id ?? null;
  const content = useContentItems(workspaceId);
  const connections = useSocialConnections(workspaceId);

  const [platform, setPlatform] = useState<SocialPlatform | "all">("all");
  const [status, setStatus] = useState<ContentStatus | "all">("all");
  const [range, setRange] = useState<DateRange>("all");

  const items = useMemo(
    () => ((content.data ?? []) as ContentItem[]).filter((item) => item.status !== "archived"),
    [content.data],
  );

  const filteredItems = useMemo(() => {
    const windowMs = range === "all" ? null : Number(range) * 86_400_000;
    return items.filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (platform !== "all" && !itemPlatforms(item).includes(platform)) return false;
      if (windowMs) {
        const date = new Date(itemDate(item)).getTime();
        if (!Number.isFinite(date) || Math.abs(Date.now() - date) > windowMs) return false;
      }
      return true;
    });
  }, [items, platform, range, status]);

  const count = (statuses: ContentStatus[]) =>
    items.filter((item) => statuses.includes(item.status)).length;
  const upcoming = items
    .filter((item) => item.status === "scheduled" || item.status === "publishing")
    .sort((a, b) => new Date(itemDate(a)).getTime() - new Date(itemDate(b)).getTime());

  const connectionByPlatform = new Map(
    (connections.data ?? []).map((connection) => [
      connection.platform as SocialPlatform,
      connection,
    ]),
  );
  const accountRows = ALL_PLATFORMS.map((socialPlatform) => ({
    platform: socialPlatform,
    row: connectionByPlatform.get(socialPlatform),
    state: accountState(connectionByPlatform.get(socialPlatform)),
  }));
  const connectedCount = accountRows.filter((account) => account.state === "connected").length;
  const attentionCount = accountRows.filter((account) =>
    ["action_required", "expired", "error"].includes(account.state),
  ).length;

  const eligibleWorkspaces = workspaces.filter(
    (workspace) =>
      workspace.access_tier === "retainer_full" || workspace.access_tier === "social_management",
  );

  const setView = (view: SocialView) => {
    void navigate({ to: "/social", search: view === "overview" ? {} : { view }, replace: true });
  };

  if (content.isLoading || connections.isLoading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center" role="status">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <span className="sr-only">Loading social workspace</span>
      </div>
    );
  }

  if (content.error || connections.error) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-rose-400/30 bg-rose-400/10 p-8 text-center">
        <XCircle className="mx-auto h-8 w-8 text-rose-300" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">
          We couldn't load the social workspace
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your data was not changed. Try loading it again.
        </p>
        <button
          type="button"
          onClick={() => {
            void content.refetch();
            void connections.refetch();
          }}
          className="mt-5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_48%),linear-gradient(135deg,color-mix(in_oklab,var(--surface)_92%,black),var(--background))] p-5 shadow-xl shadow-black/10 sm:p-7">
        <div
          className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <Megaphone className="h-3.5 w-3.5" /> Social Media
              </span>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                Approval-protected publishing
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              One place to plan, review and measure.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              {activeWorkspace?.name} content, approvals, account health and performance—organized
              without duplicate pages.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {isStaff && eligibleWorkspaces.length > 1 && (
              <label className="rounded-xl border border-border bg-background/60 px-3 py-2 backdrop-blur">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Client
                </span>
                <select
                  aria-label="Select client workspace"
                  value={workspaceId ?? ""}
                  onChange={(event) => setActiveWorkspaceId(event.target.value)}
                  className="max-w-52 bg-transparent text-sm font-medium text-foreground outline-none"
                >
                  {eligibleWorkspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id} className="bg-background">
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Link
              to="/create"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition hover:brightness-110"
            >
              <PenSquare className="h-4 w-4" /> New post
            </Link>
          </div>
        </div>
      </section>

      <nav
        aria-label="Social Media workspace"
        className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface/70 p-1.5 sm:grid-cols-4"
      >
        <WorkspaceTab
          active={activeView === "overview"}
          icon={LayoutDashboard}
          label="Overview"
          description="What needs attention"
          onClick={() => setView("overview")}
        />
        <WorkspaceTab
          active={activeView === "posts"}
          icon={BarChart3}
          label="Posts"
          description="Content and publishing"
          onClick={() => setView("posts")}
        />
        <WorkspaceTab
          active={activeView === "analytics"}
          icon={TrendingUp}
          label="Analytics"
          description="Reach and engagement"
          onClick={() => setView("analytics")}
        />
        <WorkspaceTab
          active={activeView === "accounts"}
          icon={Settings2}
          label="Accounts"
          description="Connection health"
          onClick={() => setView("accounts")}
        />
      </nav>

      {activeView === "overview" && (
        <>
          <PostingGoalCard workspaceId={workspaceId!} items={items} />
          <AchievementHighlight workspaceId={workspaceId!} />
          <OverviewView
            items={items}
            upcoming={upcoming}
            connectedCount={connectedCount}
            attentionCount={attentionCount}
            accountRows={accountRows}
            onOpenPosts={() => setView("posts")}
            onOpenAccounts={() => setView("accounts")}
            count={count}
          />
        </>
      )}

      {activeView === "posts" && (
        <PostsAndInsights
          items={filteredItems}
          allItems={items}
          platform={platform}
          status={status}
          range={range}
          setPlatform={setPlatform}
          setStatus={setStatus}
          setRange={setRange}
        />
      )}

      {activeView === "analytics" && (
        <AnalyticsAndComments
          workspaceId={workspaceId!}
          published={items.filter((item) => item.status === "published").length}
          connectedCount={connectedCount}
        />
      )}

      {activeView === "accounts" && (
        <AccountsView
          workspaceId={workspaceId!}
          isPublicOs={activeWorkspace?.data_source === "os_data"}
          rows={accountRows}
          connectedCount={connectedCount}
          attentionCount={attentionCount}
        />
      )}
    </div>
  );
}

function PostingGoalCard({ workspaceId, items }: { workspaceId: string; items: ContentItem[] }) {
  const qc = useQueryClient();
  const readGoal = useServerFn(getSocialPostingGoal);
  const writeGoal = useServerFn(setSocialPostingGoal);
  const goal = useQuery({
    queryKey: ["social-posting-goal", workspaceId],
    queryFn: () => readGoal({ data: { workspaceId } }),
  });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("3");
  const completed = weeklyPostingProgress(items);
  const target = goal.data?.weeklyGoal ?? 3;
  const percent = Math.min(100, Math.round((completed / target) * 100));
  const remaining = Math.max(0, target - completed);

  return (
    <section className="rounded-2xl border border-primary/25 bg-primary/[0.07] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Weekly posting goal
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {completed} of {target} scheduled or published
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {remaining === 0
              ? "Goal reached—keep the rhythm going."
              : `${remaining} more ${remaining === 1 ? "post" : "posts"} keeps this week's plan on track.`}
          </p>
        </div>
        {goal.data?.canManage && (
          <button
            type="button"
            onClick={() => {
              setValue(String(target));
              setEditing((current) => !current);
            }}
            className="rounded-lg border border-primary/30 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            Set goal
          </button>
        )}
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-background/70"
        aria-label={`${percent}% of weekly goal`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      {editing && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await writeGoal({ data: { workspaceId, weeklyGoal: Number(value) } });
              await qc.invalidateQueries({ queryKey: ["social-posting-goal", workspaceId] });
              setEditing(false);
              toast.success("Weekly posting goal updated.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not update the goal.");
            }
          }}
        >
          <label className="text-xs text-muted-foreground">
            Posts per week
            <input
              type="number"
              min={1}
              max={30}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="ml-2 w-20 rounded-lg border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>
          <button className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            Save goal
          </button>
        </form>
      )}
    </section>
  );
}

function AchievementHighlight({ workspaceId }: { workspaceId: string }) {
  const analyticsFn = useServerFn(getZernioAnalytics);
  const analytics = useQuery({
    queryKey: ["zernio-achievement", workspaceId, 30],
    queryFn: () => analyticsFn({ data: { workspaceId, days: 30 } }),
    retry: false,
  });
  const combined = analytics.data
    ? {
        reach:
          (analytics.data.organic?.reach ?? 0) +
          (analytics.data.external?.reach ?? 0) +
          (analytics.data.paid?.reach ?? 0),
        impressions:
          (analytics.data.organic?.impressions ?? 0) +
          (analytics.data.external?.impressions ?? 0) +
          (analytics.data.paid?.impressions ?? 0),
        likes:
          (analytics.data.organic?.likes ?? 0) +
          (analytics.data.external?.likes ?? 0) +
          (analytics.data.paid?.likes ?? 0),
      }
    : null;
  const highlight = combined
    ? (["reach", "impressions", "likes"] as const)
        .map((key) => [key, combined[key]] as const)
        .find(([, value]) => value > 0)
    : null;
  if (!highlight) return null;
  return (
    <section className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-100">
      <p className="font-semibold">
        <Sparkles className="mr-2 inline h-4 w-4" /> Your combined {highlight[0]} reached{" "}
        {highlight[1].toLocaleString()} in the last 30 days. Great work—keep it going!
      </p>
      <p className="mt-1 text-xs text-emerald-100/75">
        Open Posts & insights to separate Organic, Paid and Combined results.
      </p>
    </section>
  );
}

function WorkspaceTab({
  active,
  icon: Icon,
  label,
  description,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 py-2 text-left transition sm:justify-start sm:px-4",
        active
          ? "bg-primary/15 text-foreground ring-1 ring-inset ring-primary/30"
          : "text-muted-foreground hover:bg-elevated hover:text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold sm:text-sm">{label}</span>
        <span className="hidden truncate text-[11px] text-muted-foreground md:block">
          {description}
        </span>
      </span>
    </button>
  );
}

function OverviewView({
  items,
  upcoming,
  connectedCount,
  attentionCount,
  accountRows,
  onOpenPosts,
  onOpenAccounts,
  count,
}: {
  items: ContentItem[];
  upcoming: ContentItem[];
  connectedCount: number;
  attentionCount: number;
  accountRows: AccountRow[];
  onOpenPosts: () => void;
  onOpenAccounts: () => void;
  count: (statuses: ContentStatus[]) => number;
}) {
  const metrics = [
    {
      label: "Drafts",
      value: count(["draft"]),
      detail: "Ready to shape",
      icon: FileText,
      tone: "border-sky-400/25 bg-sky-400/[0.08] text-sky-300",
    },
    {
      label: "Needs review",
      value: count(["in_review", "changes_requested", "approved"]),
      detail: "Awaiting a decision",
      icon: CheckSquare,
      tone: "border-amber-400/25 bg-amber-400/[0.08] text-amber-300",
    },
    {
      label: "Scheduled",
      value: count(["scheduled", "publishing"]),
      detail: "Coming up",
      icon: CalendarClock,
      tone: "border-violet-400/25 bg-violet-400/[0.08] text-violet-300",
    },
    {
      label: "Published",
      value: count(["published"]),
      detail: "Live content",
      icon: CheckCircle2,
      tone: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300",
    },
  ];

  return (
    <div className="space-y-7">
      <section aria-labelledby="social-summary-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              At a glance
            </p>
            <h2 id="social-summary-title" className="mt-1 text-xl font-semibold text-foreground">
              Content flow
            </h2>
          </div>
          <button
            type="button"
            onClick={onOpenPosts}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View posts <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(19rem,0.8fr)]">
        <section className="rounded-2xl border border-border bg-surface/55 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">
                Schedule
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">Coming up next</h2>
            </div>
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open calendar <CalendarDays className="h-3.5 w-3.5" />
            </Link>
          </div>
          <PostList items={upcoming.slice(0, 5)} emptyText="Nothing is scheduled yet." compact />
        </section>

        <section className="rounded-2xl border border-border bg-surface/55 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                Account health
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">
                {connectedCount} connected
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenAccounts}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-elevated hover:text-foreground"
              aria-label="Open account settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {attentionCount > 0
              ? `${attentionCount} connection${attentionCount === 1 ? " needs" : "s need"} attention.`
              : "No connected account currently needs attention."}
          </p>
          <div className="mt-4 space-y-2">
            {accountRows.slice(0, 4).map((account) => (
              <AccountSummaryRow key={account.platform} account={account} />
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenAccounts}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            See all accounts <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      </div>

      {items.length === 0 && (
        <section className="rounded-2xl border border-dashed border-primary/25 bg-primary/[0.04] p-7 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-primary" />
          <h2 className="mt-3 font-semibold text-foreground">
            Your social workspace is ready for ideas
          </h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            Start a draft now. Nothing will publish until the new provider connection is verified.
          </p>
          <Link
            to="/create"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <PenSquare className="h-4 w-4" /> Create a draft
          </Link>
        </section>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className={cn("rounded-2xl border p-4 sm:p-5", tone)}>
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-5 w-5" />
        <span className="text-3xl font-semibold tracking-tight text-foreground">{value}</span>
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function PostsAndInsights({
  items,
  allItems,
  platform,
  status,
  range,
  setPlatform,
  setStatus,
  setRange,
}: {
  items: ContentItem[];
  allItems: ContentItem[];
  platform: SocialPlatform | "all";
  status: ContentStatus | "all";
  range: DateRange;
  setPlatform: (value: SocialPlatform | "all") => void;
  setStatus: (value: ContentStatus | "all") => void;
  setRange: (value: DateRange) => void;
}) {
  const published = allItems.filter((item) => item.status === "published").length;
  const scheduled = allItems.filter(
    (item) => item.status === "scheduled" || item.status === "publishing",
  ).length;
  const failed = allItems.filter((item) => item.status === "failed").length;

  return (
    <div className="space-y-7">
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Posts</p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              Content and publishing history
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Drafts, approvals, scheduled work and results in one list.
            </p>
          </div>
          <Link
            to="/create"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <PenSquare className="h-4 w-4" /> New post
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <CompactStat label="Scheduled" value={scheduled} tone="text-violet-300" />
          <CompactStat label="Published" value={published} tone="text-emerald-300" />
          <CompactStat label="Needs attention" value={failed} tone="text-rose-300" />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface/55 p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-3">
          <FilterSelect
            label="Platform"
            value={platform}
            onChange={(value) => setPlatform(value as SocialPlatform | "all")}
            options={[
              { value: "all", label: "All platforms" },
              ...ALL_PLATFORMS.map((value) => ({ value, label: PLATFORM_LABEL[value] })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => setStatus(value as ContentStatus | "all")}
            options={[
              { value: "all", label: "All statuses" },
              ...(Object.keys(STATUS_LABEL) as ContentStatus[])
                .filter((value) => value !== "archived")
                .map((value) => ({ value, label: STATUS_LABEL[value] })),
            ]}
          />
          <FilterSelect
            label="Date"
            value={range}
            onChange={(value) => setRange(value as DateRange)}
            options={[
              { value: "all", label: "Any date" },
              { value: "7", label: "Within 7 days" },
              { value: "30", label: "Within 30 days" },
              { value: "90", label: "Within 90 days" },
            ]}
          />
        </div>
        <div className="mt-5">
          <PostList items={items} emptyText="No posts match these filters." />
        </div>
      </section>
    </div>
  );
}

function CompactStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/55 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-3xl font-semibold", tone)}>{value}</p>
    </div>
  );
}

type AnalyticsMode = "combined" | "organic" | "paid";

function AnalyticsAndComments({
  workspaceId,
  published,
  connectedCount,
}: {
  workspaceId: string;
  published: number;
  connectedCount: number;
}) {
  const analyticsFn = useServerFn(getZernioAnalytics);
  const commentsFn = useServerFn(getZernioCommentInbox);
  const replyFn = useServerFn(replyToZernioComment);
  const assistFn = useServerFn(waveAssist);
  const [mode, setMode] = useState<AnalyticsMode>("combined");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const analytics = useQuery({
    queryKey: ["zernio-analytics", workspaceId, 30],
    queryFn: () => analyticsFn({ data: { workspaceId, days: 30 } }),
    retry: false,
  });
  const comments = useQuery({
    queryKey: ["zernio-comment-inbox", workspaceId],
    queryFn: () => commentsFn({ data: { workspaceId } }),
    retry: false,
  });
  const metric = (key: "impressions" | "reach" | "likes" | "comments" | "clicks" | "views") => {
    const organic = (analytics.data?.organic?.[key] ?? 0) + (analytics.data?.external?.[key] ?? 0);
    const paid = analytics.data?.paid?.[key] ?? 0;
    return mode === "organic" ? organic : mode === "paid" ? paid : organic + paid;
  };
  const positive = [
    ["reach", metric("reach")],
    ["impressions", metric("impressions")],
    ["likes", metric("likes")],
    ["comments", metric("comments")],
    ["clicks", metric("clicks")],
  ].find(([, value]) => Number(value) > 0);

  const draftReply = async (comment: { id: string; platform: string; text: string }) => {
    try {
      const result = await assistFn({
        data: {
          mode: "comment_reply",
          input: `Platform: ${comment.platform}\nCustomer comment: ${comment.text}`,
          workspaceId,
          platform: comment.platform,
        },
      });
      setDrafts((current) => ({ ...current, [comment.id]: result.suggestion }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not draft a reply.");
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_8%,var(--surface)),var(--surface))] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <BarChart3 className="h-5 w-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Verified analytics
              </p>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              Organic, paid and combined progress
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Last 30 days. WaveOS never substitutes placeholder numbers for provider results.
            </p>
          </div>
          <div className="flex rounded-xl border border-border bg-background/50 p-1">
            {(["combined", "organic", "paid"] as AnalyticsMode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize",
                  mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        {mode === "paid" && !analytics.data?.paidAvailable && (
          <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
            Paid metrics will appear after an eligible Zernio ads connection is available. Organic
            data remains separate.
          </p>
        )}
        {positive && (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            <Sparkles className="mr-2 inline h-4 w-4" />
            Great work—your {String(positive[0])} reached {Number(positive[1]).toLocaleString()} in
            this view. Keep the momentum going.
          </div>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InsightStat label="Published posts" value={String(published)} />
          <InsightStat label="Connected channels" value={String(connectedCount)} />
          <InsightStat
            label="Impressions"
            value={analytics.isPending ? "…" : metric("impressions").toLocaleString()}
          />
          <InsightStat
            label="Engagements"
            value={
              analytics.isPending ? "…" : (metric("likes") + metric("comments")).toLocaleString()
            }
          />
          <InsightStat
            label="Likes"
            value={analytics.isPending ? "…" : metric("likes").toLocaleString()}
          />
          <InsightStat
            label="Reach"
            value={analytics.isPending ? "…" : metric("reach").toLocaleString()}
          />
          <InsightStat
            label="Views"
            value={analytics.isPending ? "…" : metric("views").toLocaleString()}
          />
          <InsightStat
            label="Comments"
            value={analytics.isPending ? "…" : metric("comments").toLocaleString()}
          />
          <InsightStat
            label="Clicks"
            value={analytics.isPending ? "…" : metric("clicks").toLocaleString()}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface/55 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Community inbox
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Comments and Brand Voice replies
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Facebook, Instagram, YouTube, LinkedIn organization pages, Threads, X and Bluesky. Every
            AI draft requires review before posting.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {(comments.data?.comments ?? []).slice(0, 5).map((comment) => (
            <div key={comment.id} className="rounded-xl border border-border bg-background/40 p-4">
              <p className="text-xs font-semibold text-foreground">
                {comment.author} · {comment.platform}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{comment.text}</p>
              {drafts[comment.id] && (
                <textarea
                  value={drafts[comment.id]}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [comment.id]: event.target.value }))
                  }
                  rows={3}
                  className="mt-3 w-full rounded-lg border border-border bg-elevated p-3 text-sm text-foreground"
                />
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void draftReply(comment)}
                  className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
                >
                  Draft with Brand Voice
                </button>
                {drafts[comment.id] && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Post this reviewed reply publicly?")) return;
                      await replyFn({
                        data: {
                          workspaceId,
                          postId: comment.postId,
                          commentId: comment.id,
                          accountId: comment.accountId,
                          message: drafts[comment.id],
                        },
                      });
                      setDrafts((current) => ({ ...current, [comment.id]: "" }));
                      await comments.refetch();
                      toast.success("Reply posted.");
                    }}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    Approve and reply
                  </button>
                )}
              </div>
            </div>
          ))}
          {!comments.isPending && !(comments.data?.comments ?? []).length && (
            <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              No supported comments are available yet. Reconnect older accounts if Zernio requests
              new comment permissions.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

function InsightStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-background/45 p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function AccountsView({
  workspaceId,
  isPublicOs,
  rows,
  connectedCount,
  attentionCount,
}: {
  workspaceId: string;
  isPublicOs: boolean;
  rows: AccountRow[];
  connectedCount: number;
  attentionCount: number;
}) {
  const queryClient = useQueryClient();
  const getStatus = useServerFn(getZernioWorkspaceStatus);
  const ensureProfile = useServerFn(ensureZernioProfile);
  const refreshConnections = useServerFn(refreshZernioConnections);
  const getConnectUrl = useServerFn(createZernioConnectUrl);
  const disconnectAccount = useServerFn(disconnectZernioAccount);
  const [busy, setBusy] = useState<string | null>(null);
  const automaticProfileAttempted = useRef(false);
  const status = useQuery({
    queryKey: ["zernio-status", workspaceId],
    queryFn: () => getStatus({ data: { workspaceId } }),
    retry: (count, error) =>
      !(error instanceof Error && error.message === "forbidden") && count < 2,
  });
  const statusErrorForbidden =
    status.error instanceof Error && status.error.message === "forbidden";
  const accountLimitReached =
    Boolean(status.data?.accountLimit) &&
    (status.data?.connectedAccounts ?? connectedCount) >= (status.data?.accountLimit ?? 0);

  const refresh = async (quiet = false) => {
    setBusy("refresh");
    try {
      const result = await refreshConnections({ data: { workspaceId } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["social-connections", workspaceId] }),
        status.refetch(),
      ]);
      if (!quiet)
        toast.success(
          `Checked ${result.updated} connected account${result.updated === 1 ? "" : "s"}.`,
        );
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not refresh Zernio accounts.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const handleConnected = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "waveos:zernio-connected")
        return;
      void refresh(true);
    };
    window.addEventListener("message", handleConnected);
    return () => window.removeEventListener("message", handleConnected);
  });

  const prepare = async () => {
    setBusy("profile");
    try {
      await ensureProfile({ data: { workspaceId } });
      await status.refetch();
      toast.success(
        isPublicOs
          ? "Social connections are ready. Choose an account to connect."
          : "This client now has an isolated Zernio profile.",
      );
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not prepare Zernio.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    automaticProfileAttempted.current = false;
  }, [workspaceId]);

  useEffect(() => {
    if (
      !isPublicOs ||
      !status.data?.configured ||
      status.data.hasProfile ||
      automaticProfileAttempted.current
    )
      return;
    automaticProfileAttempted.current = true;
    void prepare();
    // prepare is intentionally run once when a public account first reaches
    // the connection screen; Dream Wave client setup remains manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublicOs, status.data?.configured, status.data?.hasProfile, workspaceId]);

  const connect = async (platform: SocialPlatform) => {
    const selected = rows.find((row) => row.platform === platform);
    if (accountLimitReached && selected?.state !== "connected") {
      toast.error(
        "Your plan's social account limit is full. Disconnect an account or upgrade in Settings.",
      );
      return;
    }
    setBusy(`connect:${platform}`);
    try {
      const result = await getConnectUrl({ data: { workspaceId, platform } });
      if (result.alreadyConnected || !result.url) {
        await refresh(true);
        toast.success(`${PLATFORM_LABEL[platform]} is already connected.`);
        return;
      }
      const popup = window.open(result.url, "waveos-zernio-connect", "popup,width=760,height=820");
      if (!popup) window.location.assign(result.url);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not start the connection.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (platform: SocialPlatform) => {
    if (
      !window.confirm(
        `Disconnect ${PLATFORM_LABEL[platform]} from this workspace? WaveOS will no longer be able to publish to that account until it is connected again.`,
      )
    )
      return;
    setBusy(`disconnect:${platform}`);
    try {
      await disconnectAccount({ data: { workspaceId, platform } });
      await queryClient.invalidateQueries({ queryKey: ["social-connections", workspaceId] });
      toast.success(`${PLATFORM_LABEL[platform]} disconnected.`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not disconnect the account.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <CompactStat label="Connected" value={connectedCount} tone="text-emerald-300" />
        <CompactStat label="Needs attention" value={attentionCount} tone="text-amber-300" />
        <CompactStat label="Available networks" value={rows.length} tone="text-sky-300" />
      </section>

      <section
        className={cn(
          "rounded-2xl border p-5",
          status.data?.configured
            ? "border-sky-400/25 bg-sky-400/[0.07]"
            : "border-amber-400/25 bg-amber-400/[0.07]",
        )}
      >
        <div className="flex gap-3">
          <Wrench
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              status.data?.configured ? "text-sky-300" : "text-amber-300",
            )}
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-foreground">
              {status.isPending
                ? "Checking publishing setup…"
                : status.isError
                  ? statusErrorForbidden
                    ? "Social publishing isn't included in this client's plan"
                    : "Couldn't check publishing setup"
                  : !status.data?.configured
                    ? "Zernio key needs deployment setup"
                    : status.data.hasProfile
                      ? isPublicOs
                        ? "Your social connections are ready"
                        : `Zernio is ready for ${status.data.profileName ?? "this client"}`
                      : isPublicOs
                        ? "Getting your social connections ready…"
                        : "Prepare this client's publishing profile"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {status.isPending
                ? "One moment."
                : status.isError
                  ? statusErrorForbidden
                    ? "Connecting social accounts is available on the Full Retainer and Social Management plans. Change this client's plan in Clients to turn it on."
                    : status.error instanceof Error
                      ? status.error.message
                      : "Please try again in a moment."
                  : !status.data?.configured
                    ? "Add ZERNIO_API_KEY to the deployment secrets. WaveOS will never expose its value in the browser."
                    : status.data.hasProfile
                      ? isPublicOs
                        ? "Choose a network below to securely connect your social account."
                        : "Each client stays isolated in its own Zernio profile. Refresh runs live account-health checks before publishing."
                      : isPublicOs
                        ? "WaveOS is automatically preparing the secure publishing connection for your workspace."
                        : "One click creates a separate Zernio profile for this workspace; it does not publish anything."}
            </p>
            {status.data?.lastError && (
              <p className="mt-2 text-xs text-rose-300">Last check: {status.data.lastError}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {status.data?.configured && !status.data.hasProfile && !isPublicOs && (
                <button
                  type="button"
                  onClick={prepare}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {busy === "profile" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Prepare
                  Zernio profile
                </button>
              )}
              {status.data?.hasProfile && (
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-4 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
                >
                  {busy === "refresh" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Refresh
                  account health
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Connections
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-foreground">Social accounts</h2>
          {accountLimitReached && (
            <p className="mt-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
              Plan limit reached ({status.data?.connectedAccounts ?? connectedCount}/
              {status.data?.accountLimit}). Disconnect an account or upgrade in Settings before
              connecting another.
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((account) => (
            <AccountCard
              key={account.platform}
              account={account}
              canConnect={Boolean(status.data?.configured && status.data.hasProfile)}
              limitReached={accountLimitReached && account.state !== "connected"}
              busy={busy === `connect:${account.platform}`}
              disconnecting={busy === `disconnect:${account.platform}`}
              onConnect={() => void connect(account.platform)}
              onDisconnect={() => void disconnect(account.platform)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

type AccountRow = {
  platform: SocialPlatform;
  row?: {
    username: string | null;
    display_name: string | null;
    last_synced_at: string | null;
    connection_state?: string;
  };
  state: AccountState;
};

function AccountSummaryRow({ account }: { account: AccountRow }) {
  const Icon = PLATFORM_ICON[account.platform] ?? Globe;
  const state = ACCOUNT_STATE[account.state];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background/35 px-3 py-2.5">
      <Icon className="h-4 w-4 text-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {PLATFORM_LABEL[account.platform]}
      </span>
      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", state.tone)}>
        {state.label}
      </span>
    </div>
  );
}

function AccountCard({
  account,
  canConnect,
  limitReached,
  busy,
  disconnecting,
  onConnect,
  onDisconnect,
}: {
  account: AccountRow;
  canConnect: boolean;
  limitReached: boolean;
  busy: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const Icon = PLATFORM_ICON[account.platform] ?? Globe;
  const state = ACCOUNT_STATE[account.state];
  const StateIcon = state.icon;
  return (
    <article
      className={cn(
        "rounded-2xl border p-4 transition",
        account.state === "connected"
          ? "border-emerald-400/30 bg-emerald-400/[0.07] hover:border-emerald-400/50"
          : limitReached
            ? "border-rose-400/35 bg-rose-400/[0.08]"
            : "border-border bg-surface/55 hover:border-primary/25",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-elevated">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{PLATFORM_LABEL[account.platform]}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {account.row?.username
              ? `@${account.row.username}`
              : (account.row?.display_name ?? "No account linked")}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
            state.tone,
          )}
        >
          <StateIcon className="h-3.5 w-3.5" /> {state.label}
        </span>
        {account.row?.last_synced_at && (
          <span className="text-[10px] text-muted-foreground">
            Checked {new Date(account.row.last_synced_at).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConnect}
          disabled={!canConnect || limitReached || busy || disconnecting}
          title={
            limitReached
              ? "Plan limit reached. Disconnect an account or upgrade in Settings."
              : undefined
          }
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed",
            limitReached
              ? "border-rose-400/30 bg-rose-400/10 text-rose-200 opacity-100"
              : "border-border bg-background/35 text-foreground hover:border-primary/35 disabled:opacity-45",
          )}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {limitReached
            ? "Limit reached"
            : account.state === "connected"
              ? "Reconnect"
              : "Connect"}{" "}
          {PLATFORM_LABEL[account.platform]}
        </button>
        {account.state === "connected" && (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={busy || disconnecting}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-3 py-2 text-xs font-semibold text-rose-300 hover:border-rose-400/45 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={`Disconnect ${PLATFORM_LABEL[account.platform]}`}
          >
            {disconnecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unplug className="h-3.5 w-3.5" />
            )}
            Disconnect
          </button>
        )}
      </div>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="rounded-xl border border-border bg-background/35 px-3 py-2.5">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-0.5 w-full bg-transparent text-sm font-medium text-foreground outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-background">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PostList({
  items,
  emptyText,
  compact = false,
}: {
  items: ContentItem[];
  emptyText: string;
  compact?: boolean;
}) {
  const attemptsQ = usePublishAttempts(items.map((item) => item.id));
  const remove = useDeleteContentItem();
  const attemptsByItem = new Map<string, PublishAttempt[]>();
  for (const attempt of (attemptsQ.data ?? []) as PublishAttempt[]) {
    const list = attemptsByItem.get(attempt.content_item_id) ?? [];
    list.push(attempt);
    attemptsByItem.set(attempt.content_item_id, list);
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background/25 p-7 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  async function handleDelete(item: ContentItem) {
    const published = item.status === "published";
    const message = published
      ? "Delete this post record from WaveOS? This will not remove the already-published post from the social platform."
      : item.status === "scheduled"
        ? "Delete this scheduled post? It will no longer publish at the scheduled time."
        : "Delete this post from WaveOS? This cannot be undone.";
    if (!confirm(message)) return;
    try {
      await remove.mutateAsync(item.id);
      toast.success(published ? "WaveOS post record deleted." : "Post deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Post could not be deleted.");
    }
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const platforms = itemPlatforms(item);
        return (
          <li key={item.id}>
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/30 p-3.5 transition hover:border-primary/30 hover:bg-elevated/60 sm:flex-row sm:items-center">
              <Link
                to="/create"
                search={{ id: item.id }}
                className="group flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.title || "Untitled post"}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        STATUS_TONE[item.status],
                      )}
                    >
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  {!compact && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {item.primary_caption || "No caption yet"}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {platforms.slice(0, 4).map((socialPlatform) => {
                    const Icon = PLATFORM_ICON[socialPlatform] ?? Globe;
                    return (
                      <Icon
                        key={socialPlatform}
                        className="h-4 w-4"
                        aria-label={PLATFORM_LABEL[socialPlatform]}
                      />
                    );
                  })}
                  <span className="text-xs">
                    {new Date(itemDate(item)).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </Link>
              {!compact && (
                <div className="flex shrink-0 items-center gap-2 border-t border-border/70 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                  <Link
                    to="/create"
                    search={{ id: item.id }}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface"
                  >
                    {item.status === "published" || item.status === "publishing" ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <PenSquare className="h-3.5 w-3.5" />
                    )}
                    {item.status === "published" || item.status === "publishing" ? "View" : "Edit"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item)}
                    disabled={remove.isPending || item.status === "publishing"}
                    title={
                      item.status === "publishing"
                        ? "Wait for publishing to finish before deleting"
                        : "Delete post"
                    }
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {remove.isPending && remove.variables === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Delete
                  </button>
                </div>
              )}
            </div>
            {!compact && <PublishResults attempts={attemptsByItem.get(item.id) ?? []} />}
          </li>
        );
      })}
    </ul>
  );
}
