import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Image as ImageIcon,
  Megaphone,
  PlusCircle,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { FeatureKey } from "@/lib/permissions";

export type MobileUpcomingItem = {
  id: string;
  title: string | null;
  scheduled_at: string;
  status: string;
  metadata?: unknown;
  media_asset_ids?: string[] | null;
};

type Action = {
  to: string;
  label: string;
  icon: LucideIcon;
  feature: FeatureKey;
  search?: Record<string, string>;
  tone: string;
};

const ACTIONS: Action[] = [
  { to: "/create", label: "Create", icon: PlusCircle, feature: "can_create_content", tone: "text-primary border-primary/25 bg-primary/10" },
  { to: "/creative-studio", label: "Studio", icon: Wand2, feature: "can_use_creative_studio", tone: "text-intelligence border-intelligence/25 bg-intelligence/10" },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, feature: "can_use_campaign_manager", tone: "text-campaign border-campaign/25 bg-campaign/10" },
  { to: "/social", search: { view: "analytics" }, label: "Analytics", icon: BarChart3, feature: "can_view_analytics_checkup", tone: "text-analytics border-analytics/25 bg-analytics/10" },
];

function platformsOf(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const value = (metadata as Record<string, unknown>).platforms;
  return Array.isArray(value) ? value.filter((p): p is string => typeof p === "string") : [];
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const day =
    date.toDateString() === today.toDateString()
      ? "Today"
      : date.toDateString() === tomorrow.toDateString()
        ? "Tomorrow"
        : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day} • ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

function useThumbnail(assetId: string | undefined) {
  return useQuery({
    queryKey: ["mobile-next-thumb", assetId],
    enabled: !!assetId,
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("media_assets")
        .select("thumbnail_url")
        .eq("id", assetId!)
        .maybeSingle();
      return (data?.thumbnail_url as string | null | undefined) ?? null;
    },
  });
}

/** Phone-only home: status strip, quick actions, Next Up, Needs Attention, Upcoming. */
export function MobileCommandCenter({
  can,
  workspaceName,
  stats,
  loading,
  approvalsTo,
}: {
  can: (feature: FeatureKey) => boolean;
  workspaceName?: string;
  stats?: {
    scheduledCount: number;
    awaitingCount: number;
    draftCount: number;
    failedCount: number;
    publishedCount: number;
    upcoming: MobileUpcomingItem[];
  };
  loading: boolean;
  approvalsTo: string;
}) {
  const actions = ACTIONS.filter((a) => can(a.feature));
  const showCalendar = can("can_view_calendar_preview");
  const next = stats?.upcoming[0];
  const thumb = useThumbnail(next?.media_asset_ids?.[0]);
  const v = (n: number | undefined) => (loading ? "…" : (n ?? "—"));

  const status = [
    { label: "Scheduled", value: v(stats?.scheduledCount), to: "/calendar", tone: "border-warning/25 bg-warning/10", valueTone: "text-warning" },
    { label: "Drafts", value: v(stats?.draftCount), to: "/social", tone: "border-border bg-surface", valueTone: "text-foreground" },
    { label: "Approvals", value: v(stats?.awaitingCount), to: approvalsTo, tone: "border-intelligence/25 bg-intelligence/10", valueTone: "text-intelligence" },
    { label: "Published", value: v(stats?.publishedCount), to: "/social", tone: "border-success/25 bg-success/10", valueTone: "text-success" },
  ];

  const attention = [
    stats?.awaitingCount
      ? { label: `${stats.awaitingCount} ${stats.awaitingCount === 1 ? "post" : "posts"} awaiting approval`, cta: "Review", to: approvalsTo, icon: CheckSquare }
      : null,
    stats?.failedCount
      ? { label: `${stats.failedCount} ${stats.failedCount === 1 ? "post" : "posts"} failed to publish`, cta: "Fix", to: "/social", icon: AlertTriangle }
      : null,
  ].filter(Boolean) as Array<{ label: string; cta: string; to: string; icon: LucideIcon }>;

  return (
    <div className="space-y-5 sm:hidden">
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]">
        {status.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className={`flex min-h-11 shrink-0 items-baseline gap-1.5 rounded-full border px-3.5 py-2 ${s.tone}`}
          >
            <span className={`text-base font-semibold tabular-nums ${s.valueTone}`}>{s.value}</span>
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </Link>
        ))}
      </div>

      {actions.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {actions.map(({ to, search, label, icon: Icon, tone }) => (
            <Link key={to} to={to} search={search} className="flex flex-col items-center gap-1.5 rounded-2xl py-1.5">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-medium text-foreground">{label}</span>
            </Link>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Next up</h2>
        {loading ? (
          <div className="h-20 animate-pulse rounded-2xl bg-elevated" />
        ) : next ? (
          <Link
            to="/calendar"
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-elevated">
              {thumb.data ? (
                <img src={thumb.data} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-muted-foreground">
                {[platformsOf(next.metadata).map(cap).join(", "), workspaceName].filter(Boolean).join(" · ")}
              </p>
              <p className="truncate text-sm font-semibold text-foreground">{next.title || "Untitled post"}</p>
              <p className="text-xs text-primary">{formatWhen(next.scheduled_at)}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {cap(next.status)}
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-3">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <p className="flex-1 text-sm text-muted-foreground">Nothing scheduled yet</p>
            {can("can_create_content") && (
              <Link to="/create" className="text-sm font-semibold text-primary">Plan a post</Link>
            )}
          </div>
        )}
      </section>

      {attention.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Needs attention</h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {attention.map(({ label, cta, to, icon: Icon }) => (
              <Link key={label} to={to} className="flex min-h-12 items-center gap-3 px-3 text-sm">
                <Icon className={`h-4 w-4 ${label.includes("failed") ? "text-destructive" : "text-warning"}`} />
                <span className="flex-1 text-foreground">{label}</span>
                <span className="flex items-center text-xs font-semibold text-primary">{cta}<ChevronRight className="h-3.5 w-3.5" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {stats && stats.upcoming.length > 1 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Upcoming</h2>
            {showCalendar && <Link to="/calendar" className="text-xs text-primary">See all</Link>}
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {stats.upcoming.slice(1, 5).map((item) => (
              <Link key={item.id} to="/calendar" className="flex min-h-12 items-center gap-3 px-3 py-2">
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{item.title || "Untitled post"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[formatWhen(item.scheduled_at), platformsOf(item.metadata).map(cap).join(", ")].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground">{cap(item.status)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
