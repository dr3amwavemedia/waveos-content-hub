import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Clock,
  Facebook,
  FileText,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Music2,
  Send,
  Twitter,
  Wrench,
  XCircle,
  Youtube,
  type LucideIcon,
} from "lucide-react";

import { RequireFeature } from "@/components/app/require-feature";
import { useWorkspace } from "@/components/app/workspace-context";
import { usePermissions } from "@/hooks/use-permissions";
import {
  ALL_PLATFORMS,
  PLATFORM_LABEL,
  useContentItems,
  useSocialConnections,
  type ContentItem,
  type ContentStatus,
  type SocialPlatform,
} from "@/hooks/use-content";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/social")({
  component: () => (
    <RequireFeature
      feature="can_connect_socials"
      title="Social tools aren't part of this workspace"
      description="The social media dashboard is available on Full Retainer and Social Management plans."
    >
      <SocialDashboard />
    </RequireFeature>
  ),
  head: () => ({
    meta: [
      { title: "Social Dashboard — WaveOS" },
      { name: "description", content: "Accounts, drafts, approvals and posts for your workspace." },
      { property: "og:title", content: "Social Dashboard — WaveOS" },
      { property: "og:description", content: "Accounts, drafts, approvals and posts for your workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

type AccountState = "connected" | "action_required" | "expired" | "error" | "not_connected";

const ACCOUNT_STATE: Record<AccountState, { label: string; tone: string; icon: LucideIcon }> = {
  connected: { label: "Connected", tone: "text-success border-success/30 bg-success/10", icon: CheckCircle2 },
  action_required: { label: "Action required", tone: "text-warning border-warning/30 bg-warning/10", icon: AlertTriangle },
  expired: { label: "Expired", tone: "text-warning border-warning/30 bg-warning/10", icon: Clock },
  error: { label: "Error", tone: "text-destructive border-destructive/30 bg-destructive/10", icon: XCircle },
  not_connected: { label: "Not connected", tone: "text-muted-foreground border-border bg-surface/60", icon: Globe },
};

function accountState(row: { connected: boolean; raw: unknown } | undefined): AccountState {
  if (!row) return "not_connected";
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  if (raw.error || raw.status === "error") return "error";
  if (raw.expired === true || raw.status === "expired") return "expired";
  if (raw.refreshRequired || raw.status === "action_required") return "action_required";
  return row.connected ? "connected" : "not_connected";
}

type Section = "overview" | "accounts" | "upcoming" | "drafts" | "approvals" | "published" | "failed";

const SECTIONS: { id: Section; label: string; icon: LucideIcon; statuses?: ContentStatus[] }[] = [
  { id: "overview", label: "Overview", icon: Globe },
  { id: "accounts", label: "Connected Accounts", icon: Send },
  { id: "upcoming", label: "Upcoming", icon: CalendarClock, statuses: ["scheduled", "publishing"] },
  { id: "drafts", label: "Drafts", icon: FileText, statuses: ["draft", "changes_requested"] },
  { id: "approvals", label: "Approvals", icon: CheckSquare, statuses: ["in_review", "approved"] },
  { id: "published", label: "Published", icon: CheckCircle2, statuses: ["published"] },
  { id: "failed", label: "Failed", icon: XCircle, statuses: ["failed"] },
];

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  archived: "Archived",
};

type DateRange = "all" | "7" | "30" | "90";

function itemDate(item: ContentItem) {
  return item.published_at ?? item.scheduled_at ?? item.updated_at ?? item.created_at;
}

function itemPlatforms(item: ContentItem): SocialPlatform[] {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const p = meta.platforms;
  return Array.isArray(p) ? (p.filter((x) => typeof x === "string") as SocialPlatform[]) : [];
}

function SocialDashboard() {
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();
  const { isStaff } = usePermissions();
  const workspaceId = activeWorkspace?.id ?? null;
  const content = useContentItems(workspaceId);
  const conns = useSocialConnections(workspaceId);

  const [section, setSection] = useState<Section>("overview");
  const [platform, setPlatform] = useState<SocialPlatform | "all">("all");
  const [status, setStatus] = useState<ContentStatus | "all">("all");
  const [range, setRange] = useState<DateRange>("all");

  const filtered = useMemo(() => {
    const items = (content.data ?? []) as ContentItem[];
    const cutoff = range === "all" ? null : Number(range) * 86_400_000;
    return items.filter((item) => {
      if (item.status === "archived") return false;
      if (status !== "all" && item.status !== status) return false;
      if (platform !== "all") {
        const ps = itemPlatforms(item);
        if (!ps.includes(platform)) return false;
      }
      if (cutoff) {
        const d = new Date(itemDate(item)).getTime();
        if (Math.abs(Date.now() - d) > cutoff) return false;
      }
      return true;
    });
  }, [content.data, platform, status, range]);

  const bySection = (s: Section) => {
    const def = SECTIONS.find((x) => x.id === s);
    return def?.statuses ? filtered.filter((i) => def.statuses!.includes(i.status)) : filtered;
  };

  const connByPlatform = new Map((conns.data ?? []).map((c) => [c.platform as SocialPlatform, c]));
  const accountRows = ALL_PLATFORMS.filter((p) => platform === "all" || p === platform).map((p) => ({
    platform: p,
    row: connByPlatform.get(p),
    state: accountState(connByPlatform.get(p)),
  }));

  const eligibleWorkspaces = workspaces.filter(
    (w) => w.access_tier === "retainer_full" || w.access_tier === "social_management",
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Social dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {activeWorkspace?.name} — accounts, drafts, approvals and posts in one place.
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div>
          <p className="font-medium text-foreground">Publishing setup in progress</p>
          <p className="text-muted-foreground">
            Posts are not being published or scheduled to social platforms yet. Drafts and approvals
            still work, and nothing will go live until the new publishing connection is verified.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {isStaff && eligibleWorkspaces.length > 1 ? (
          <FilterSelect
            label="Client"
            value={workspaceId ?? ""}
            onChange={(v) => setActiveWorkspaceId(v)}
            options={eligibleWorkspaces.map((w) => ({ value: w.id, label: w.name }))}
          />
        ) : (
          <div className="rounded-xl border border-border bg-surface/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Client</p>
            <p className="truncate text-sm text-foreground">{activeWorkspace?.name}</p>
          </div>
        )}
        <FilterSelect
          label="Platform"
          value={platform}
          onChange={(v) => setPlatform(v as SocialPlatform | "all")}
          options={[{ value: "all", label: "All platforms" }, ...ALL_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as ContentStatus | "all")}
          options={[
            { value: "all", label: "All statuses" },
            ...(Object.keys(STATUS_LABEL) as ContentStatus[])
              .filter((s) => s !== "archived")
              .map((s) => ({ value: s, label: STATUS_LABEL[s] })),
          ]}
        />
        <FilterSelect
          label="Date"
          value={range}
          onChange={(v) => setRange(v as DateRange)}
          options={[
            { value: "all", label: "Any date" },
            { value: "7", label: "Within 7 days" },
            { value: "30", label: "Within 30 days" },
            { value: "90", label: "Within 90 days" },
          ]}
        />
      </div>

      {/* Section tabs */}
      <nav aria-label="Social sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {SECTIONS.map((s) => {
          const count = s.id === "overview" ? null : s.id === "accounts" ? accountRows.filter((a) => a.state === "connected").length : bySection(s.id).length;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              aria-pressed={section === s.id}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                section === s.id
                  ? "border-primary/40 bg-primary/15 text-foreground"
                  : "border-border bg-surface/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
              {count !== null && <span className="text-xs text-muted-foreground">{count}</span>}
            </button>
          );
        })}
      </nav>

      {content.isLoading || conns.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : content.error || conns.error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm">
          <p className="font-medium text-foreground">We couldn't load this workspace's social data.</p>
          <button
            type="button"
            onClick={() => {
              content.refetch();
              conns.refetch();
            }}
            className="mt-3 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-foreground hover:bg-elevated"
          >
            Try again
          </button>
        </div>
      ) : section === "overview" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {SECTIONS.filter((s) => s.id !== "overview").map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className="surface-card flex flex-col items-start gap-2 p-4 text-left transition-colors hover:border-primary/40"
              >
                <s.icon className="h-4 w-4 text-primary" />
                <span className="text-2xl font-semibold text-foreground">
                  {s.id === "accounts" ? accountRows.filter((a) => a.state === "connected").length : bySection(s.id).length}
                </span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </button>
            ))}
          </div>
          <AccountsGrid rows={accountRows} />
          <PostList title="Coming up next" items={bySection("upcoming").slice(0, 5)} emptyText="Nothing is scheduled." />
        </div>
      ) : section === "accounts" ? (
        <AccountsGrid rows={accountRows} />
      ) : (
        <PostList
          title={SECTIONS.find((s) => s.id === section)!.label}
          items={bySection(section)}
          emptyText="No posts match these filters."
        />
      )}
    </div>
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
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="rounded-xl border border-border bg-surface/60 px-3 py-2">
      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-sm text-foreground outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-background">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PlatformIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  const Icon = PLATFORM_ICON[platform] ?? Globe;
  return <Icon className={className} aria-hidden />;
}

function AccountsGrid({
  rows,
}: {
  rows: { platform: SocialPlatform; row?: { username: string | null; display_name: string | null; last_synced_at: string | null }; state: AccountState }[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Connected accounts</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs text-warning">
          <Wrench className="h-3.5 w-3.5" /> Publishing: setup in progress
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ platform, row, state }) => {
          const s = ACCOUNT_STATE[state];
          return (
            <div key={platform} className="surface-card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-elevated">
                <PlatformIcon platform={platform} className="h-5 w-5 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{PLATFORM_LABEL[platform]}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row?.username ? `@${row.username}` : row?.display_name ?? "No account linked"}
                </p>
              </div>
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", s.tone)}>
                <s.icon className="h-3 w-3" /> {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PostList({ title, items, emptyText }: { title: string; items: ContentItem[]; emptyText: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {items.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const platforms = itemPlatforms(item);
            return (
              <li key={item.id}>
                <Link
                  to="/posts"
                  className="surface-card flex flex-col gap-2 p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.title || "Untitled post"}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{item.primary_caption || "No caption yet"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {platforms.map((p) => (
                      <PlatformIcon key={p} platform={p} className="h-4 w-4 text-muted-foreground" />
                    ))}
                    <span className="rounded-full border border-border bg-elevated px-2 py-0.5 text-[11px] text-foreground">
                      {STATUS_LABEL[item.status]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(itemDate(item)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
