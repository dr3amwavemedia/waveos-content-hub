import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, CalendarDays, CheckCircle2, Cloud, ImagePlus, PenSquare,
  Share2, Sparkles, TrendingUp, Users, FolderOpen,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-waveos";
import { useWorkspace } from "@/components/app/workspace-context";
import { Section } from "@/components/app/section";
import { EmptyState } from "@/components/app/empty-state";
import { StatCard } from "@/components/app/stat-card";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeDashboard,
  head: () => ({ meta: [{ title: "Home — WaveOS" }] }),
});

function HomeDashboard() {
  const { data: user } = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const wsId = activeWorkspace?.id;
  const greeting = getGreeting();
  const firstName = user?.firstName?.split(" ")[0] ?? "there";

  const statsQ = useQuery({
    queryKey: ["home-stats", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const [assets, folders, members, brand, scheduled, awaiting, published] = await Promise.all([
        supabase.from("media_assets").select("id,created_at", { count: "exact", head: false })
          .eq("workspace_id", wsId!).is("archived_at", null),
        supabase.from("media_folders").select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId!),
        supabase.from("workspace_members").select("user_id", { count: "exact", head: true })
          .eq("workspace_id", wsId!),
        supabase.from("brand_profiles").select("onboarding_status").eq("workspace_id", wsId!).maybeSingle(),
        supabase.from("content_items").select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId!).in("status", ["scheduled", "approved"]),
        supabase.from("content_items").select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId!).in("status", ["in_review", "changes_requested"]),
        supabase.from("content_items").select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId!).eq("status", "published"),
      ]);
      return {
        mediaCount: assets.count ?? (assets.data?.length ?? 0),
        folderCount: folders.count ?? 0,
        memberCount: members.count ?? 0,
        brandComplete: brand.data?.onboarding_status === "complete",
        scheduledCount: scheduled.count ?? 0,
        awaitingCount: awaiting.count ?? 0,
        publishedCount: published.count ?? 0,
      };
    },
  });

  const stats = statsQ.data;
  const isDemo = activeWorkspace?.is_demo ?? false;
  const isEmpty = !stats || (stats.mediaCount === 0 && stats.memberCount <= 1);

  return (
    <div className="space-y-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
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
        <Link
          to="/create"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110"
        >
          <PenSquare className="h-4 w-4" />
          Create post
        </Link>
      </header>

     <section className="space-y-4">
  <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-[var(--shadow-glow)] sm:p-7">
    <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />

    <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-xl">
        <div className="flex items-center gap-2 text-primary">
          <TrendingUp className="h-4 w-4" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
            Growth overview
          </p>
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

      <Link
        to="/analytics"
        className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-2 text-sm font-semibold text-foreground backdrop-blur transition-all hover:border-primary/40 hover:bg-primary/10"
      >
        View full analytics
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>

    <div className="relative mt-6 grid grid-cols-3 gap-2 sm:gap-3">
      <div className="rounded-2xl border border-border/70 bg-background/60 p-3 backdrop-blur sm:p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
          Published
        </p>
        <p className="mt-2 text-2xl font-semibold text-foreground">
          {stats?.publishedCount ?? "—"}
        </p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-background/60 p-3 backdrop-blur sm:p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
          Scheduled
        </p>
        <p className="mt-2 text-2xl font-semibold text-foreground">
          {stats?.scheduledCount ?? "—"}
        </p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-background/60 p-3 backdrop-blur sm:p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
          To review
        </p>
        <p className="mt-2 text-2xl font-semibold text-foreground">
          {stats?.awaitingCount ?? "—"}
        </p>
      </div>
    </div>
  </div>

  <div className="grid grid-cols-2 gap-3">
    <StatCard
      icon={FolderOpen}
      label="Media assets"
      value={String(stats?.mediaCount ?? "—")}
      tone="primary"
    />

    <StatCard
      icon={Users}
      label="Team members"
      value={String(stats?.memberCount ?? "—")}
    />
  </div>
</section>

      <Section title="Upcoming content" subtitle="The next few posts scheduled for your brand.">
        <EmptyState
          icon={CalendarDays}
          title="No posts have been created yet."
          body="Your Dream Wave Media team is preparing your content. Once scheduled, it will appear here."
          action={{ label: "Open calendar", to: "/calendar" }}
        />
      </Section>

      <Section
  title="Needs your attention"
  subtitle="Approvals, account connections, and brand setup."
>
  {isEmpty && !isDemo ? (
    <div className="grid gap-3 sm:grid-cols-2">
      {!stats?.brandComplete && (
        <NudgeCard
          icon={Sparkles}
          title="Complete your brand profile"
          body="Complete your brand profile to improve caption suggestions."
          to="/brand-voice"
        />
      )}

      {stats?.mediaCount === 0 && (
        <NudgeCard
          icon={ImagePlus}
          title="Upload your first media"
          body="Photos and videos will appear in your content library."
          to="/content"
        />
      )}
    </div>
  ) : (
    <EmptyState
      icon={CheckCircle2}
      title="All caught up."
      body="Nothing needs your review right now."
    />
  )}
</Section>

      <Section title="Recent performance" subtitle="A quick pulse on how your content is doing.">
        <EmptyState
          icon={TrendingUp}
          title="No data yet."
          body="Analytics will appear after publishing begins."
        />
      </Section>


      <Section title="Quick actions" subtitle="Common things you can do right now.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <QuickAction to="/content" label="Upload content" icon={ImagePlus} description="Add photos or videos to your library." />
          <QuickAction to="/create" label="Create a post" icon={PenSquare} description="Build a post with per‑platform captions." />
          <QuickAction to="/calendar" label="View calendar" icon={CalendarDays} description="See what's coming up next." />
          <QuickAction to="/social-accounts" label="Connect account" icon={Share2} description="Link Instagram, Facebook, and more." />
          <QuickAction to="/brand-voice" label="Refine brand voice" icon={Sparkles} description="Teach WaveOS how your brand sounds." />
        </div>
      </Section>
    </div>
  );
}

function NudgeCard({
  icon: Icon, title, body, to,
}: { icon: typeof Sparkles; title: string; body: string; to: string }) {
  return (
    <Link to={to} className="surface-card flex items-start gap-3 p-4 hover:border-border-strong hover:shadow-[var(--shadow-glow)]">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/20">
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
  to, label, icon: Icon, description,
}: { to: string; label: string; icon: typeof PenSquare; description: string }) {
  return (
    <Link to={to}
      className="group surface-card flex flex-col gap-2 p-4 transition-all hover:border-border-strong hover:shadow-[var(--shadow-glow)]">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/20">
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </Link>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
