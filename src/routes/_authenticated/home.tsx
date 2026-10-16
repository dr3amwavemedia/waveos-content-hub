import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ImagePlus,
  Mail,
  Megaphone,
  Palette,
  PenSquare,
  Sparkles,
  TrendingUp,
  Users,
  FolderOpen,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-waveos";
import { useWorkspace } from "@/components/app/workspace-context";
import { Section } from "@/components/app/section";
import { EmptyState } from "@/components/app/empty-state";
import { usePermissions } from "@/hooks/use-permissions";
import { Layer1Overview } from "@/components/app/layer1-overview";
import { WeddingOverview } from "@/components/app/wedding-overview";
import { UpcomingShootPanel } from "@/components/app/upcoming-shoot";
import { WorkspaceBrandmark } from "@/components/branding/workspace-brandmark";
import { useWorkspaceBranding } from "@/hooks/use-workspace-branding";
import { getFrameioWorkspaceStatus, listFrameioWorkspaceMedia } from "@/hooks/use-frameio";
import { ProductReleaseProvider, WhatsNewCard } from "@/components/app/product-releases";
import { formatInTimeZone } from "@/lib/date-time";
import { MobileCommandCenter } from "@/components/app/mobile-command-center";
import { MobileRecentMedia } from "@/components/app/mobile-recent-media";

export const Route = createFileRoute("/_authenticated/home")({
  component: () => (
    <ProductReleaseProvider>
      <HomeRoute />
    </ProductReleaseProvider>
  ),
  head: () => ({ meta: [{ title: "Home — WaveOS" }, { name: "description", content: "Your WaveOS workspace, recent content and upcoming work." }, { property: "og:title", content: "Home — WaveOS" }, { property: "og:description", content: "Your workspace, recent content and upcoming work at a glance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

function HomeRoute() {
  const { access, isStaff, isLoading } = usePermissions();
  const { activeWorkspace, workspaces, isLoading: wsLoading } = useWorkspace();
  const { data: user } = useCurrentUser();

  // Signed in but no workspace membership yet — invite hasn't been accepted
  // or the admin hasn't provisioned one. Show a clear dead-end instead of a
  // blank dashboard.
  if (!isStaff && !wsLoading && !isLoading && workspaces.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <div className="surface-card p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/20">
            <Mail className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
            {user?.accountSource === "os_data"
              ? "Finish setting up your WaveOS trial"
              : "You haven't been invited to a workspace yet."}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {user?.accountSource === "os_data"
              ? "Create your brand workspace to activate 30 days of access for two social accounts."
              : "WaveOS access is provisioned by Dream Wave Media. Once your team sends you an invite, your workspace will appear here automatically."}
          </p>
          <Link
            to={user?.accountSource === "os_data" ? "/onboarding" : "/feedback"}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110"
          >
            {user?.accountSource === "os_data" ? "Create trial workspace" : "Contact support"}
          </Link>
        </div>
      </div>
    );
  }

  // Client projects and delivery links are universal across every tier.
  // Tier-specific tools remain available through the client navigation.
  if (!isStaff && !isLoading && access) {
    if (activeWorkspace?.data_source === "os_data") return <HomeDashboard />;
    if (access.tier === "wedding_client") return <WeddingOverview />;
    return <Layer1Overview />;
  }
  return <HomeDashboard />;
}

function HomeDashboard() {
  const { data: user } = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const { can } = usePermissions();
  const wsId = activeWorkspace?.id;
  const isPublicOs = activeWorkspace?.data_source === "os_data";
  const branding = useWorkspaceBranding(wsId);
  const greeting = getGreeting();
  const firstName = user?.firstName?.split(" ")[0] ?? "there";

  const statsQ = useQuery({
    queryKey: ["home-stats", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const [assets, members, brand, scheduled, awaiting, published, upcoming] = await Promise.all([
        supabase
          .from("media_assets")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId!)
          .is("archived_at", null),
        supabase
          .from("workspace_members")
          .select("user_id", { count: "exact", head: true })
          .eq("workspace_id", wsId!),
        supabase
          .from("brand_profiles")
          .select("onboarding_status")
          .eq("workspace_id", wsId!)
          .maybeSingle(),
        supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId!)
          .in("status", ["scheduled", "approved"]),
        supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId!)
          .in("status", ["in_review", "changes_requested"]),
        supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId!)
          .eq("status", "published"),
        supabase
          .from("content_items")
          .select("id,title,scheduled_at,status")
          .eq("workspace_id", wsId!)
          .in("status", ["scheduled", "approved"])
          .not("scheduled_at", "is", null)
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(3),
      ]);
      const failed = [assets, members, brand, scheduled, awaiting, published, upcoming].find(
        (result) => result.error,
      );
      if (failed?.error) throw failed.error;
      return {
        mediaCount: assets.count ?? 0,
        memberCount: members.count ?? 0,
        brandComplete: brand.data?.onboarding_status === "complete",
        scheduledCount: scheduled.count ?? 0,
        awaitingCount: awaiting.count ?? 0,
        publishedCount: published.count ?? 0,
        upcoming: (upcoming.data ?? []) as Array<{
          id: string;
          title: string | null;
          scheduled_at: string;
          status: string;
        }>,
      };
    },
  });

  const stats = statsQ.data;
  const frameioQ = useQuery({
    queryKey: ["home", "frameio", wsId],
    enabled: !!wsId,
    staleTime: 60_000,
    queryFn: async () => {
      const status = await getFrameioWorkspaceStatus(wsId!);
      return status.connected ? listFrameioWorkspaceMedia(wsId!, "") : null;
    },
  });
  const metricValue = (value: number | undefined) =>
    statsQ.isPending ? "…" : statsQ.isError ? "—" : (value ?? "—");
  const attentionItems = stats
    ? [
        stats.awaitingCount > 0 ? "approvals" : null,
        !stats.brandComplete ? "brand" : null,
        stats.mediaCount === 0 ? "media" : null,
      ].filter(Boolean)
    : [];
  const recommendation = stats
    ? stats.awaitingCount > 0
      ? {
          title: `${stats.awaitingCount} ${stats.awaitingCount === 1 ? "post needs" : "posts need"} review`,
          body: "Review requested changes or approve the next posts in your workflow.",
          to: isPublicOs ? "/social" : "/approvals",
          label: "Review posts",
        }
      : stats.publishedCount === 0 && can("can_create_content")
        ? {
            title: "Publish your first post",
            body: "Start a draft so performance insights have real activity to measure.",
            to: "/create",
            label: "Create a post",
          }
        : stats.scheduledCount === 0 && can("can_view_calendar_preview")
          ? {
              title: "Plan the next post",
              body: "Your calendar has no scheduled content yet. Add a date to keep momentum visible.",
              to: "/calendar",
              label: "Open calendar",
            }
          : can("can_view_analytics_checkup")
            ? {
                title: "Check your recent performance",
                body: "Review the latest verified social data and its source coverage.",
                to: "/analytics",
                label: "Open analytics",
              }
            : null
    : null;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <WorkspaceBrandmark
            logoUrl={branding.data?.logoUrl}
            name={activeWorkspace?.name ?? "Workspace"}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {activeWorkspace?.name ?? "WaveOS"}
            </p>
            <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {greeting}, {firstName}.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Here's what's happening in your workspace.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/updates"
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-elevated"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            What&apos;s new
          </Link>
          {can("can_create_content") && (
            <Link
              to="/create"
              className="hidden min-h-11 w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110 sm:inline-flex"
            >
              <PenSquare className="h-4 w-4" />
              Create post
            </Link>
          )}
        </div>
      </header>

      <MobileCommandCenter
        can={can}
        scheduledCount={stats?.scheduledCount}
        awaitingCount={stats?.awaitingCount}
        approvalsTo={isPublicOs ? "/social" : "/approvals"}
      />

      <WhatsNewCard />

      <MobileRecentMedia workspaceId={wsId} />

      {!isPublicOs && <UpcomingShootPanel />}

      {!isPublicOs && frameioQ.data && frameioQ.data.files.length > 0 && (
        <Section title={frameioQ.data.label} subtitle="Media curated for your brand by Dream Wave.">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {frameioQ.data.files.slice(0, 6).map((file) => (
              <a
                key={file.id}
                href={file.viewUrl ?? "#"}
                target={file.viewUrl ? "_blank" : undefined}
                rel={file.viewUrl ? "noopener noreferrer" : undefined}
                className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-elevated"
              >
                {file.thumbnailUrl ? (
                  <img
                    src={file.thumbnailUrl}
                    alt={file.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                    {file.name}
                  </div>
                )}
                <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-2 py-1.5 text-[10px] text-foreground backdrop-blur">
                  {file.name}
                </span>
              </a>
            ))}
          </div>
        </Section>
      )}

      <section className="hidden space-y-4 sm:block">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-[var(--shadow-glow)] sm:p-7">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-primary">
                <TrendingUp className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">Growth overview</p>
              </div>

              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {stats?.publishedCount
                  ? "Your content is building momentum."
                  : "Your growth dashboard is ready."}
              </h2>

              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {stats?.publishedCount
                  ? `You currently have ${stats.publishedCount} published ${
                      stats.publishedCount === 1 ? "post" : "posts"
                    }. Reach, engagement, and audience growth will become more detailed as performance data comes in.`
                  : "Once your first posts are published, this area will highlight reach, engagement, audience growth, and your strongest-performing content."}
              </p>
            </div>

            {can("can_view_analytics_checkup") && (
              <Link
                to="/analytics"
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2 text-sm font-semibold text-foreground backdrop-blur transition-all hover:border-primary/40 hover:bg-primary/10"
              >
                View analytics checkup
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>

          <div className="relative mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            <DashboardMetric
              to={can("can_view_analytics_checkup") ? "/analytics" : "/social"}
              label="Published"
              value={metricValue(stats?.publishedCount)}
              tone="success"
            />
            <DashboardMetric
              to="/social"
              search={{ view: "posts" }}
              label="Scheduled"
              value={metricValue(stats?.scheduledCount)}
              tone="tertiary"
            />
            {isPublicOs ? (
              <DashboardMetric
                to="/content"
                label="Media ready"
                value={metricValue(stats?.mediaCount)}
                tone="highlight"
              />
            ) : (
              <DashboardMetric
                to="/approvals"
                label="To review"
                value={metricValue(stats?.awaitingCount)}
                tone="highlight"
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DashboardMetric
            to="/content"
            icon={FolderOpen}
            label="Media assets"
            value={metricValue(stats?.mediaCount)}
            tone="secondary"
          />
          <DashboardMetric
            to="/settings"
            icon={Users}
            label="Team members"
            value={metricValue(stats?.memberCount)}
            tone="tertiary"
          />
        </div>
      </section>

      <Section title="Upcoming content" subtitle="The next few posts scheduled for your brand.">
        {statsQ.isPending ? (
          <div className="grid gap-3 sm:grid-cols-3" aria-label="Loading upcoming content">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-2xl border border-border bg-elevated/50"
              />
            ))}
          </div>
        ) : statsQ.isError ? (
          <div role="alert" className="surface-card p-5">
            <p className="font-semibold text-foreground">Upcoming content could not be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No values were replaced with zeros. Try the workspace query again.
            </p>
            <button
              type="button"
              onClick={() => void statsQ.refetch()}
              className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-elevated"
            >
              Try again
            </button>
          </div>
        ) : stats?.upcoming.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {stats.upcoming.map((item) => (
              <Link
                key={item.id}
                to="/calendar"
                className="surface-card min-h-24 p-4 transition hover:-translate-y-0.5 hover:border-primary/40"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {formatInTimeZone(item.scheduled_at, activeWorkspace?.timezone ?? "UTC", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">
                  {item.title || "Untitled post"}
                </p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">{item.status}</p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Nothing is scheduled yet."
            body={
              isPublicOs
                ? "Schedule your first post and it will appear here."
                : "Your Dream Wave Media team is preparing your content. Once scheduled, it will appear here."
            }
            action={
              can("can_view_calendar_preview")
                ? { label: "Open calendar", to: "/calendar" }
                : undefined
            }
            tone="var(--workspace-tone-tertiary)"
          />
        )}
      </Section>

      <Section
        title="Needs your attention"
        subtitle="Approvals, account connections, and brand setup."
      >
        {statsQ.isPending ? (
          <div className="h-24 animate-pulse rounded-2xl border border-border bg-elevated/50" />
        ) : statsQ.isError ? (
          <p
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground"
          >
            Attention items are unavailable until the workspace query succeeds.
          </p>
        ) : attentionItems.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {(stats?.awaitingCount ?? 0) > 0 && (
              <NudgeCard
                icon={CheckCircle2}
                title={`${stats!.awaitingCount} ${stats!.awaitingCount === 1 ? "post needs" : "posts need"} review`}
                body="Open the review queue to approve or request changes."
                to={isPublicOs ? "/social" : "/approvals"}
                tone="success"
              />
            )}
            {!stats?.brandComplete && can("can_manage_brand_voice") && (
              <NudgeCard
                icon={Sparkles}
                title="Complete your brand profile"
                body="Complete your brand profile to improve caption suggestions."
                to="/brand-voice"
                tone="highlight"
              />
            )}

            {stats?.mediaCount === 0 && can("can_upload_media") && (
              <NudgeCard
                icon={ImagePlus}
                title="Upload your first media"
                body="Photos and videos will appear in your content library."
                to="/content"
                tone="secondary"
              />
            )}
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="All caught up."
            body="Nothing needs your review right now."
            tone="var(--workspace-tone-success)"
          />
        )}
      </Section>

      <Section
        title="Recommended for you"
        subtitle="A next step based on this workspace's current counts."
      >
        {statsQ.isPending ? (
          <div className="h-28 animate-pulse rounded-2xl border border-border bg-elevated/50" />
        ) : statsQ.isError ? (
          <p
            role="alert"
            className="rounded-2xl border border-border bg-surface/55 p-4 text-sm text-muted-foreground"
          >
            A recommendation will appear after workspace activity loads successfully.
          </p>
        ) : recommendation ? (
          <div className="surface-card p-5">
            <h3 className="font-semibold text-foreground">{recommendation.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{recommendation.body}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                to={recommendation.to}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                {recommendation.label} <ArrowRight className="h-4 w-4" />
              </Link>
              <details className="text-xs text-muted-foreground">
                <summary className="min-h-11 cursor-pointer content-center font-medium text-foreground">
                  Why am I seeing this?
                </summary>
                <p className="max-w-xl pb-2">
                  WaveOS uses the published, scheduled, and review counts shown above. It does not
                  invent performance data when connected-source data is unavailable.
                </p>
              </details>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="You're on track."
            body="There isn't a higher-priority workspace action right now."
            tone="var(--workspace-tone-success)"
          />
        )}
      </Section>

      <div className="hidden sm:block"><Section title="Quick actions" subtitle="Common things you can do right now.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {can("can_create_content") && (
            <QuickAction
              to="/create"
              label="Create a post"
              icon={PenSquare}
              description="Build a post with per-platform captions."
              tone="primary"
            />
          )}
          {can("can_use_campaign_manager") && (
            <QuickAction
              to="/campaigns"
              label="Build a campaign"
              icon={Megaphone}
              description="Plan a focused multi-post campaign."
              tone="tertiary"
            />
          )}
          {can("can_use_creative_studio") && (
            <QuickAction
              to="/creative-studio"
              label="Create a graphic"
              icon={Palette}
              description="Start a reusable social design."
              tone="highlight"
            />
          )}
          {can("can_view_analytics_checkup") && (
            <QuickAction
              to="/analytics"
              label="See how I'm doing"
              icon={BarChart3}
              description="Review verified performance and coverage."
              tone="success"
            />
          )}
          {can("can_view_media_library") && (
            <QuickAction
              to="/content"
              label="Media library"
              icon={ImagePlus}
              description="Add or choose photos and videos."
              tone="secondary"
            />
          )}
          {can("can_view_calendar_preview") && (
            <QuickAction
              to="/calendar"
              label="View calendar"
              icon={CalendarDays}
              description="See what's coming up next."
              tone="highlight"
            />
          )}
        </div>
      </Section></div>
    </div>
  );
}

function NudgeCard({
  icon: Icon,
  title,
  body,
  to,
  tone,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
  to: string;
  tone: DashboardTone;
}) {
  const color = dashboardTone(tone);
  return (
    <Link
      to={to}
      className="surface-card flex items-start gap-3 p-4 transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)]"
      style={dashboardPanelStyle(color)}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg border"
        style={dashboardIconStyle(color)}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{body}</div>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function QuickAction({
  to,
  label,
  icon: Icon,
  description,
  tone,
}: {
  to: string;
  label: string;
  icon: typeof PenSquare;
  description: string;
  tone: DashboardTone;
}) {
  const color = dashboardTone(tone);
  return (
    <Link
      to={to}
      className="group surface-card flex flex-col gap-2 p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)]"
      style={dashboardPanelStyle(color)}
    >
      <div className="flex items-center justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg border"
          style={dashboardIconStyle(color)}
        >
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </Link>
  );
}

type DashboardTone = "primary" | "secondary" | "tertiary" | "highlight" | "success";

function dashboardTone(tone: DashboardTone) {
  return `var(--workspace-tone-${tone})`;
}

function dashboardPanelStyle(color: string): CSSProperties {
  return {
    borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
    background: `linear-gradient(145deg, color-mix(in oklab, ${color} 11%, var(--card)), var(--card) 64%)`,
  };
}

function dashboardIconStyle(color: string): CSSProperties {
  return {
    color,
    borderColor: `color-mix(in oklab, ${color} 28%, transparent)`,
    backgroundColor: `color-mix(in oklab, ${color} 13%, transparent)`,
  };
}

function DashboardMetric({
  to,
  search,
  icon: Icon,
  label,
  value,
  tone,
}: {
  to: string;
  search?: Record<string, string>;
  icon?: typeof FolderOpen;
  label: string;
  value: string | number;
  tone: DashboardTone;
}) {
  const color = dashboardTone(tone);
  return (
    <Link
      to={to}
      search={search}
      className="group rounded-2xl border p-3 backdrop-blur transition-all hover:-translate-y-0.5 hover:brightness-110 sm:p-4"
      style={dashboardPanelStyle(color)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
          {label}
        </p>
        {Icon && <Icon className="h-4 w-4" style={{ color }} />}
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <div
        className="mt-3 h-0.5 w-8 rounded-full transition-all group-hover:w-12"
        style={{ backgroundColor: color }}
      />
    </Link>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
